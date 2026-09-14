#include <gtest/gtest.h>
#include "agent_loop.hpp"
#include "stub_provider.hpp"
#include "tool/bash_tool.hpp"
#include "../sandbox/test_support.hpp"
#include <condition_variable>
#include <chrono>
#include <memory>
#include <mutex>

using namespace acecode;
using namespace acecode::sandbox;
using namespace std::chrono_literals;

namespace {
class AutoHarness {
public:
    test::TempTree tree;
    PermissionManager permissions;
    ToolExecutor tools;
    AgentCallbacks callbacks;
    std::shared_ptr<acecode_test::StubLlmProvider> provider = std::make_shared<acecode_test::StubLlmProvider>();
    std::unique_ptr<AgentLoop> loop;
    std::vector<nlohmann::json> prompts;
    std::vector<SandboxMode> executions;
    PermissionResult answer = PermissionResult::Allow;
    std::mutex mutex;
    std::condition_variable cv;
    bool busy = false;

    explicit AutoHarness(bool available = true, bool has_prompter = true) {
        permissions.set_mode(PermissionMode::Auto);
        auto bash = create_bash_tool();
        bash.execute = [this](const std::string&, const ToolContext& ctx) {
            executions.push_back(ctx.exec_sandbox ? ctx.exec_sandbox->policy.mode : SandboxMode::FullAccess);
            return ToolResult{"ok", true};
        };
        tools.register_tool(bash);
        callbacks.on_busy_changed = [this](bool value) {
            std::lock_guard<std::mutex> lock(mutex);
            busy = value;
            if (!busy) cv.notify_all();
        };
        if (has_prompter) callbacks.on_tool_confirm = [this](const std::string&, const std::string& args) {
            prompts.push_back(nlohmann::json::parse(args));
            return answer;
        };
        loop = std::make_unique<AgentLoop>([this]() -> std::shared_ptr<LlmProvider> { return provider; },
            tools, callbacks, path_to_utf8(tree.root), permissions);
        loop->set_exec_rules({});
        loop->set_sandbox_availability_for_tests(available);
    }
    ~AutoHarness() { loop.reset(); }
    bool run(nlohmann::json args) {
        provider->push_tool_call("bash", args.dump(), "call-" + std::to_string(provider->turn_count()));
        provider->push_text("done");
        {
            std::lock_guard<std::mutex> lock(mutex);
            busy = true;
        }
        loop->submit("run");
        std::unique_lock<std::mutex> lock(mutex);
        return cv.wait_for(lock, 10s, [this] { return !busy; });
    }
};
}

// 场景:auto 模式 + 沙盒可用,模型先后执行 `git status`(已知安全)与
// `pnpm test`(未知)。期望:两次都不弹确认,且都带着 workspace-write 沙盒
// 请求进工具 —— 这就是 Codex Auto 预设的日常体验。
TEST(AgentLoopAutoMode, SafeAndUnknownCommandsRunInsideAvailableSandbox) {
    AutoHarness h;
    ASSERT_TRUE(h.run({{"command", "git status"}}));
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    EXPECT_TRUE(h.prompts.empty());
    ASSERT_EQ(h.executions.size(), 2u);
    EXPECT_EQ(h.executions[0], SandboxMode::WorkspaceWrite);
    EXPECT_EQ(h.executions[1], SandboxMode::WorkspaceWrite);
}

// 场景:auto 模式下模型执行 `rm -rf output`,用户拒绝。期望:弹一次确认,
// 确认 args 的 permission.reason 是 dangerous_command,拒绝后工具不执行。
TEST(AgentLoopAutoMode, DangerousCommandRequiresConfirmationAndCanBeDenied) {
    AutoHarness h;
    h.answer = PermissionResult::Deny;
    ASSERT_TRUE(h.run({{"command", "rm -rf output"}}));
    EXPECT_TRUE(h.executions.empty());
    ASSERT_EQ(h.prompts.size(), 1u);
    EXPECT_EQ(h.prompts[0]["permission"]["reason"], "dangerous_command");
}

// 场景:auto 模式但沙盒不可用(Codex 的 Windows-disabled 分支)。期望:已知
// 安全命令仍免确认;未知命令弹确认(reason=unknown_command_without_sandbox),
// 批准后以 full-access 执行。
TEST(AgentLoopAutoMode, UnavailableSandboxPromptsForUnknownButAllowsKnownSafe) {
    AutoHarness h(false);
    ASSERT_TRUE(h.run({{"command", "git status"}}));
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    ASSERT_EQ(h.prompts.size(), 1u);
    EXPECT_EQ(h.prompts[0]["permission"]["reason"], "unknown_command_without_sandbox");
    ASSERT_EQ(h.executions.size(), 2u);
    EXPECT_EQ(h.executions.back(), SandboxMode::FullAccess);
}

// 场景:模型带 with_escalated_permissions + justification 执行 `pnpm install`,
// 用户选"总是允许";随后 `pnpm install lodash` 与 `pnpm test`。期望:确认框
// 带 reason=escalation_requested、sandbox=full-access、前缀 `pnpm install` 与
// 理由原文;同前缀第二次免确认且沙盒外执行;`pnpm test` 不沾光,照常进沙盒。
TEST(AgentLoopAutoMode, EscalationShowsJustificationAndRemembersOnlyApprovedPrefix) {
    AutoHarness h;
    h.answer = PermissionResult::AlwaysAllow;
    ASSERT_TRUE(h.run({{"command", "pnpm install"}, {"with_escalated_permissions", true},
                      {"justification", "Install dependencies using the shared cache."}}));
    ASSERT_EQ(h.prompts.size(), 1u);
    EXPECT_EQ(h.prompts[0]["permission"]["reason"], "escalation_requested");
    EXPECT_EQ(h.prompts[0]["permission"]["sandbox"], "full-access");
    EXPECT_EQ(h.prompts[0]["permission"]["always_allow_prefix"], "pnpm install");
    EXPECT_EQ(h.prompts[0]["justification"], "Install dependencies using the shared cache.");
    ASSERT_TRUE(h.run({{"command", "pnpm install lodash"}}));
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    EXPECT_EQ(h.prompts.size(), 1u);
    ASSERT_EQ(h.executions.size(), 3u);
    EXPECT_EQ(h.executions[0], SandboxMode::FullAccess);
    EXPECT_EQ(h.executions[1], SandboxMode::FullAccess);
    EXPECT_EQ(h.executions[2], SandboxMode::WorkspaceWrite);
}

// 场景:yolo 模式 + 项目规则 forbidden `git push`。期望:不弹确认、不执行 ——
// forbidden 是硬禁令,yolo 只能跳过确认,不能跳过禁令。
TEST(AgentLoopAutoMode, ForbiddenRuleWinsEvenInYoloWithoutPrompt) {
    AutoHarness h;
    h.permissions.set_mode(PermissionMode::Yolo);
    ExecRules rules;
    auto parsed = parse_rules_text("prefix_rule(pattern=[\"git\", \"push\"], decision=\"forbidden\")",
                                   RuleScope::Project, "project.rules");
    ASSERT_TRUE(parsed.error.empty());
    rules.add_rule(parsed.rules.front());
    h.loop->set_exec_rules(std::move(rules));
    ASSERT_TRUE(h.run({{"command", "git push"}}));
    EXPECT_TRUE(h.prompts.empty());
    EXPECT_TRUE(h.executions.empty());
}

// 场景:沙盒不可用且宿主没有装确认回调(非交互嵌入)。期望:缺 justification
// 的越权申请直接报参数错误;需要确认的未知命令因为没有确认通道也不执行 ——
// 两条路径都不能退化成"没人问就直接跑"。
TEST(AgentLoopAutoMode, InvalidEscalationAndMissingPrompterNeverExecute) {
    AutoHarness h(false, false);
    ASSERT_TRUE(h.run({{"command", "pnpm test"}, {"with_escalated_permissions", true}}));
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    EXPECT_TRUE(h.executions.empty());
}

// 场景:会话里已记住 `pnpm test`(bypass),用户 `/sandbox off` 再 `/sandbox on`。
// 期望:开关翻转即清空前缀记忆;off 期间未知命令按沙盒不可用弹确认;on 之后
// 恢复进 workspace-write 沙盒且不再确认。
TEST(AgentLoopAutoMode, SessionSandboxSwitchClearsRememberedPrefixes) {
    AutoHarness h;
    h.permissions.add_session_command_allow("pnpm test", true);
    EXPECT_NE(h.loop->sandbox_command("off").find("disabled for this session"), std::string::npos);
    EXPECT_TRUE(h.permissions.session_command_allows().empty());
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    EXPECT_EQ(h.prompts.size(), 1u);
    h.loop->sandbox_command("on");
    ASSERT_TRUE(h.run({{"command", "pnpm test"}}));
    EXPECT_EQ(h.prompts.size(), 1u);
    EXPECT_EQ(h.executions.back(), SandboxMode::WorkspaceWrite);
}
