#ifdef _WIN32
#include <gtest/gtest.h>
#include "sandbox/sandbox_backend.hpp"
#include "sandbox/sandbox_runtime.hpp"
#include "tool/bash_tool.hpp"
#include "environment/terminal_runtime.hpp"
#include "agent_loop.hpp"
#include "../agent_loop/stub_provider.hpp"
#include "test_support.hpp"
#include <windows.h>
#include <aclapi.h>
#include <condition_variable>
#include <chrono>
#include <mutex>

using namespace acecode;
using namespace acecode::sandbox;
namespace fs = std::filesystem;

namespace {
struct Token {
    HANDLE value = nullptr;
    ~Token() { if (value) CloseHandle(value); }
};
// 本机 TEMP 被其它程序授予 Everyone FullControl。此用例创建自己的私有目录,
// 验证普通用户私有路径的隔离,不修改 TEMP 的权限或掩盖公开目录的已知限制。
bool make_private_test_root(const fs::path& root) {
    Token current;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &current.value)) return false;
    DWORD size = 0;
    GetTokenInformation(current.value, TokenUser, nullptr, 0, &size);
    std::vector<unsigned char> user(size);
    if (!GetTokenInformation(current.value, TokenUser, user.data(), size, &size)) return false;
    auto* info = reinterpret_cast<TOKEN_USER*>(user.data());
    EXPLICIT_ACCESS_W entry{};
    entry.grfAccessPermissions = FILE_ALL_ACCESS;
    entry.grfAccessMode = GRANT_ACCESS;
    entry.grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    entry.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    entry.Trustee.ptstrName = static_cast<LPWSTR>(info->User.Sid);
    PACL acl = nullptr;
    if (SetEntriesInAclW(1, &entry, nullptr, &acl) != ERROR_SUCCESS) return false;
    auto path = root.wstring();
    const auto result = SetNamedSecurityInfoW(path.data(), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr, nullptr, acl, nullptr);
    LocalFree(acl);
    return result == ERROR_SUCCESS;
}
bool token_can_write(HANDLE token, const fs::path& path) {
    if (!ImpersonateLoggedOnUser(token)) return false;
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                              nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    const bool allowed = file != INVALID_HANDLE_VALUE;
    if (allowed) CloseHandle(file);
    RevertToSelf();
    return allowed;
}
bool token_can_delete(HANDLE token, const fs::path& path) {
    if (!ImpersonateLoggedOnUser(token)) return false;
    const bool allowed = DeleteFileW(path.c_str()) != FALSE;
    RevertToSelf();
    return allowed;
}
bool token_can_rename(HANDLE token, const fs::path& from, const fs::path& to) {
    if (!ImpersonateLoggedOnUser(token)) return false;
    const bool allowed = MoveFileW(from.c_str(), to.c_str()) != FALSE;
    RevertToSelf();
    return allowed;
}
bool token_can_open_access(HANDLE token, const fs::path& path, DWORD access) {
    if (!ImpersonateLoggedOnUser(token)) return false;
    auto file = CreateFileW(path.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                           nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, nullptr);
    const bool allowed = file != INVALID_HANDLE_VALUE;
    if (allowed) CloseHandle(file);
    RevertToSelf();
    return allowed;
}
}

// 真机回归:工作区 A 的 ACE 不能让 B 或只读令牌继续写 A。
TEST(SandboxBackendWin, IsolatesWorkspaceDataWritesAndProtectsSensitiveContents) {
    const auto probe = probe_backend();
    if (!probe.available) GTEST_SKIP() << probe.reason;
    test::TempTree tree;
    ASSERT_TRUE(make_private_test_root(tree.root));
    auto a = tree.dir("a");
    auto b = tree.dir("b");
    auto outside = tree.dir("outside");
    tree.dir("a/.git");
    SandboxRuntime runtime;
    SandboxRuntimeConfig config;
    config.exclude_tmpdir = true;
    runtime.configure(config);
    auto request_a = runtime.request_for(SandboxMode::WorkspaceWrite, path_to_utf8(a));
    auto request_b = runtime.request_for(SandboxMode::WorkspaceWrite, path_to_utf8(b));
    ASSERT_TRUE(runtime.prepare_request(request_a).empty());
    ASSERT_TRUE(runtime.prepare_request(request_b).empty());
    std::string error;
    Token token_a{static_cast<HANDLE>(create_restricted_token(request_a.policy, &error))};
    Token token_b{static_cast<HANDLE>(create_restricted_token(request_b.policy, &error))};
    auto read_only = make_sandbox_policy(SandboxMode::ReadOnly, path_to_utf8(a), {});
    Token token_read{static_cast<HANDLE>(create_restricted_token(read_only, &error))};
    ASSERT_NE(token_a.value, nullptr) << error;
    ASSERT_NE(token_b.value, nullptr) << error;
    ASSERT_NE(token_read.value, nullptr) << error;
    EXPECT_NE(synthetic_sid_string(request_a.policy), synthetic_sid_string(request_b.policy));
    EXPECT_NE(synthetic_sid_string(request_a.policy), synthetic_sid_string(read_only));
    EXPECT_TRUE(token_can_write(token_a.value, a / "allowed.txt"));
    EXPECT_FALSE(token_can_write(token_a.value, b / "denied.txt"));
    EXPECT_FALSE(token_can_write(token_a.value, outside / "denied.txt"));
    EXPECT_FALSE(token_can_write(token_b.value, a / "denied.txt"));
    EXPECT_FALSE(token_can_write(token_read.value, a / "denied-readonly.txt"));
    for (const char* child : {".git/config", ".git/config.worktree", ".git/hooks/pre-commit",
                             ".git/modules/attack", ".acecode/rules/attack.rules"}) {
        EXPECT_FALSE(token_can_write(token_a.value, a / child)) << child;
    }
    EXPECT_TRUE(token_can_open_access(token_a.value, a / ".git/config", GENERIC_READ));
    EXPECT_TRUE(token_can_delete(token_a.value, a / "allowed.txt"));
    // 正常宿主仍可编辑规则,沙盒初始化不应误伤当前用户。
    tree.write(a / ".acecode/rules/user.rules", "# user rule");
    EXPECT_TRUE(fs::exists(a / ".acecode/rules/user.rules"));
    EXPECT_TRUE(ensure_windows_acl_grants(request_a.policy, &error));
}

// 真机通过实际 Bash 工具创建受限子进程,验证拒绝提示及显式完整访问。
TEST(SandboxBackendWin, BashChildEnforcesBoundaryAndReportsDenial) {
    if (!probe_backend().available) GTEST_SKIP() << "restricted tokens unavailable";
    test::TempTree tree;
    ASSERT_TRUE(make_private_test_root(tree.root));
    auto workspace = tree.dir("workspace");
    auto outside = tree.dir("outside");
    tree.write(workspace / ".acecode/rules/probe.rules", "# protected");
    SandboxRuntime runtime;
    SandboxRuntimeConfig config;
    config.exclude_tmpdir = true;
    runtime.configure(config);
    ToolContext ctx;
    ctx.cwd = path_to_utf8(workspace);
    ctx.exec_sandbox = runtime.request_for(SandboxMode::WorkspaceWrite, ctx.cwd);
    ASSERT_TRUE(runtime.prepare_request(*ctx.exec_sandbox).empty());
    auto previous = environment::terminal().last();
    struct RestoreTerminal {
        decltype(previous) snapshot;
        ~RestoreTerminal() {
            if (snapshot) environment::terminal().publish(*snapshot);
            else environment::terminal().reset_for_test();
        }
    } restore{previous};
    environment::terminal().reset_for_test();
    auto bash = create_bash_tool();
    auto inside = bash.execute(nlohmann::json{{"command", "echo allowed > allowed.txt"}}.dump(), ctx);
    ASSERT_TRUE(inside.success) << inside.output << " " << inside.metadata.dump();
    EXPECT_TRUE(fs::exists(workspace / "allowed.txt"));
    auto protected_write = bash.execute(nlohmann::json{{"command", "echo denied >> .acecode\\rules\\probe.rules"}}.dump(), ctx);
    EXPECT_FALSE(protected_write.success) << protected_write.output;
    EXPECT_TRUE(fs::exists(workspace / ".acecode/rules/probe.rules"));
    const std::string command = "echo denied > \"" + path_to_utf8(outside / "denied.txt") + "\"";
    auto denied = bash.execute(nlohmann::json{{"command", command}}.dump(), ctx);
    EXPECT_FALSE(denied.success);
    EXPECT_FALSE(fs::exists(outside / "denied.txt"));
    EXPECT_TRUE(denied.metadata.value("sandbox_denied", false)) << denied.output;
    EXPECT_NE(denied.output.find("with_escalated_permissions=true"), std::string::npos);
    ctx.exec_sandbox.reset(); // 模拟用户已批准的完整访问执行上下文。
    auto approved = bash.execute(nlohmann::json{{"command", command},
        {"with_escalated_permissions", true}, {"justification", "Write the requested external file."}}.dump(), ctx);
    EXPECT_TRUE(approved.success) << approved.output;
    EXPECT_TRUE(fs::exists(outside / "denied.txt"));
}

// 已接受的 Codex unelevated 边界,单独记录,不能把它算作删除隔离通过。
// 对照源码 dfaf451426868c22e6859f5494150fd6338c3257,详见 docs/sandbox.md。
TEST(SandboxBackendWin, DocumentsUnelevatedDeleteAndRenameLimitation) {
    if (!probe_backend().available) GTEST_SKIP() << "restricted tokens unavailable";
    test::TempTree tree;
    ASSERT_TRUE(make_private_test_root(tree.root));
    const auto workspace = tree.dir("workspace");
    const auto outside = tree.dir("outside");
    tree.write(workspace / ".acecode/rules/probe.rules", "# protected");
    tree.write(outside / "existing.txt", "outside");
    SandboxRuntime runtime;
    SandboxRuntimeConfig config;
    config.exclude_tmpdir = true;
    runtime.configure(config);
    auto request = runtime.request_for(SandboxMode::WorkspaceWrite, path_to_utf8(workspace));
    ASSERT_TRUE(runtime.prepare_request(request).empty());
    std::string error;
    Token token{static_cast<HANDLE>(create_restricted_token(request.policy, &error))};
    ASSERT_NE(token.value, nullptr) << error;
    EXPECT_FALSE(token_can_write(token.value, outside / "new.txt"));
    EXPECT_TRUE(token_can_delete(token.value, outside / "existing.txt"));
    EXPECT_TRUE(token_can_delete(token.value, workspace / ".acecode/rules/probe.rules"));
    EXPECT_TRUE(token_can_rename(token.value, workspace / ".acecode", workspace / ".acecode-old"));
    EXPECT_NE(runtime.status_text(PermissionMode::Auto, path_to_utf8(workspace), false)
        .find("delete/rename are not fully restricted"), std::string::npos);
}

// 真机完整链路:模型调用 -> AgentLoop 审批 -> Bash 受限/完整访问子进程。
// LLM 使用确定性 provider,Shell、git、令牌和文件系统全部真实执行。
TEST(SandboxBackendWin, AutoAgentLoopRunsGitAndRequiresApprovalForEscalationAndDanger) {
    if (!probe_backend().available) GTEST_SKIP() << "restricted tokens unavailable";
    test::TempTree tree;
    ASSERT_TRUE(make_private_test_root(tree.root));
    const auto workspace = tree.dir("workspace");
    const auto outside = tree.dir("outside");
    auto previous = environment::terminal().last();
    struct RestoreTerminal {
        decltype(previous) snapshot;
        ~RestoreTerminal() {
            if (snapshot) environment::terminal().publish(*snapshot);
            else environment::terminal().reset_for_test();
        }
    } restore{previous};
    environment::terminal().reset_for_test();
    auto bash = create_bash_tool();
    ToolContext init_context;
    init_context.cwd = path_to_utf8(workspace);
    const auto initialized = bash.execute(nlohmann::json{
        {"command", "git -c init.templateDir= -c init.defaultBranch=main init -q"}}.dump(), init_context);
    ASSERT_TRUE(initialized.success) << initialized.output;
    std::vector<ToolResult> results;
    std::vector<SandboxMode> execution_modes;
    const auto real_execute = bash.execute;
    bash.execute = [&](const std::string& args, const ToolContext& ctx) {
        execution_modes.push_back(ctx.exec_sandbox ? ctx.exec_sandbox->policy.mode : SandboxMode::FullAccess);
        auto result = real_execute(args, ctx);
        results.push_back(result);
        return result;
    };
    ToolExecutor tools;
    tools.register_tool(bash);
    PermissionManager permissions;
    permissions.set_mode(PermissionMode::Auto);
    std::vector<nlohmann::json> prompts;
    PermissionResult answer = PermissionResult::Allow;
    std::mutex mutex;
    std::condition_variable cv;
    bool busy = false;
    AgentCallbacks callbacks;
    callbacks.on_busy_changed = [&](bool value) {
        std::lock_guard<std::mutex> lock(mutex);
        busy = value;
        if (!busy) cv.notify_all();
    };
    callbacks.on_tool_confirm = [&](const std::string&, const std::string& args) {
        prompts.push_back(nlohmann::json::parse(args));
        return answer;
    };
    auto provider = std::make_shared<acecode_test::StubLlmProvider>();
    AgentLoop loop([&]() -> std::shared_ptr<LlmProvider> { return provider; }, tools,
        callbacks, path_to_utf8(workspace), permissions);
    SandboxConfig config;
    config.exclude_tmpdir = true;
    loop.set_sandbox_config(config);
    loop.set_exec_rules({});
    auto run = [&](nlohmann::json args) {
        provider->push_tool_call("bash", args.dump(), "native-" + std::to_string(provider->turn_count()));
        provider->push_text("done");
        { std::lock_guard<std::mutex> lock(mutex); busy = true; }
        loop.submit("run");
        std::unique_lock<std::mutex> lock(mutex);
        return cv.wait_for(lock, std::chrono::seconds(15), [&] { return !busy; });
    };
    ASSERT_TRUE(run({{"command", "git status --short"}}));
    ASSERT_EQ(results.size(), 1u);
    EXPECT_TRUE(prompts.empty());
    EXPECT_TRUE(results.back().success) << results.back().output;
    EXPECT_EQ(execution_modes.back(), SandboxMode::WorkspaceWrite);
    const auto command = "echo denied > \"" + path_to_utf8(outside / "probe.txt") + "\"";
    ASSERT_TRUE(run({{"command", command}}));
    ASSERT_EQ(results.size(), 2u);
    EXPECT_TRUE(prompts.empty());
    EXPECT_FALSE(results.back().success);
    EXPECT_TRUE(results.back().metadata.value("sandbox_denied", false));
    EXPECT_FALSE(fs::exists(outside / "probe.txt"));
    ASSERT_TRUE(run({{"command", command}, {"with_escalated_permissions", true},
        {"justification", "Write the requested file outside this workspace."}}));
    ASSERT_EQ(prompts.size(), 1u);
    EXPECT_EQ(prompts.back()["permission"]["reason"], "escalation_requested");
    EXPECT_EQ(prompts.back()["permission"]["sandbox"], "full-access");
    ASSERT_EQ(results.size(), 3u);
    EXPECT_TRUE(results.back().success) << results.back().output;
    EXPECT_EQ(execution_modes.back(), SandboxMode::FullAccess);
    EXPECT_TRUE(fs::exists(outside / "probe.txt"));
    answer = PermissionResult::Deny;
    ASSERT_TRUE(run({{"command", "rm -rf output"}}));
    ASSERT_EQ(prompts.size(), 2u);
    EXPECT_EQ(prompts.back()["permission"]["reason"], "dangerous_command");
    EXPECT_EQ(results.size(), 3u);
}
#endif
