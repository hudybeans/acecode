#include <gtest/gtest.h>
#include "sandbox/sandbox_backend.hpp"
#include <algorithm>

using namespace acecode::sandbox;

// 场景:可写根路径里含引号和 SBPL 语法(`"(allow default)`)。期望:路径只经
// `-D` 参数注入,policy 文本本身不内嵌路径(否则路径能注入策略),只读子路径
// 走 require-not,network_access=false 时没有 network-outbound。
TEST(SandboxBackendPosix, SeatbeltUsesParametersForUntrustedPathText) {
    SandboxPolicy policy;
    policy.mode = SandboxMode::WorkspaceWrite;
    policy.writable_roots = {{"/tmp/a \"(allow default)", {"/tmp/a \"(allow default)/.acecode/rules"}}};
    auto text = build_seatbelt_policy(policy);
    EXPECT_EQ(text.find(policy.writable_roots[0].root), std::string::npos);
    EXPECT_NE(text.find("require-not"), std::string::npos);
    EXPECT_EQ(text.find("(allow network-outbound)"), std::string::npos);
    auto argv = build_seatbelt_argv(policy);
    EXPECT_EQ(argv.front(), "/usr/bin/sandbox-exec");
    EXPECT_EQ(argv.back(), "--");
    EXPECT_NE(std::find(argv.begin(), argv.end(), "-DWRITABLE_ROOT_0=" + policy.writable_roots[0].root), argv.end());
}

// 场景:bwrap 参数组装。期望:只读子路径的 --ro-bind 排在可写根 --bind 之后
// (后绑定覆盖先绑定);默认 --unshare-net,放行网络时去掉;用户 / PID / IPC
// 命名空间与 --new-session 恒在;Windows 后端的环境变量只有 ACECODE_SANDBOX。
TEST(SandboxBackendPosix, BwrapMountsProtectedPathsAfterWritableRoots) {
    SandboxPolicy policy;
    policy.mode = SandboxMode::WorkspaceWrite;
    policy.writable_roots = {{"/work space", {"/work space/.git/config"}}};
    auto argv = build_bwrap_argv(policy);
    auto allow = std::find(argv.begin(), argv.end(), "--bind");
    auto deny = std::find(allow, argv.end(), "--ro-bind");
    ASSERT_NE(deny, argv.end());
    EXPECT_EQ(*(allow + 1), "/work space");
    EXPECT_EQ(*(deny + 1), "/work space/.git/config");
    EXPECT_NE(std::find(argv.begin(), argv.end(), "--unshare-net"), argv.end());
    for (const auto* option : {"--unshare-user", "--unshare-pid", "--unshare-ipc", "--new-session"}) {
        EXPECT_NE(std::find(argv.begin(), argv.end(), option), argv.end());
    }
    EXPECT_EQ(argv.back(), "--");
    policy.network_access = true;
    argv = build_bwrap_argv(policy);
    EXPECT_EQ(std::find(argv.begin(), argv.end(), "--unshare-net"), argv.end());
    EXPECT_EQ(sandbox_environment(BackendKind::WindowsRestrictedToken, policy, false).size(), 1u);
}

// 临时目录覆盖只用于 Windows 的 WorkspaceWrite;只读/完整访问和未追加
// 临时根(exclude_tmpdir)不能误带写目录或覆盖宿主环境。
TEST(SandboxBackendPosix, TemporaryEnvironmentOverridesAreScopedToWindowsWorkspaceWrite) {
    SandboxPolicy policy;
    policy.mode = SandboxMode::WorkspaceWrite;
    policy.temporary_directory = "C:/temp/acecode-sandbox/workspace";
    const auto env = sandbox_environment(BackendKind::WindowsRestrictedToken, policy, false);
    for (const char* key : {"TEMP", "TMP", "TMPDIR"}) {
        EXPECT_NE(std::find(env.begin(), env.end(),
            std::make_pair(std::string(key), policy.temporary_directory)), env.end());
    }
    EXPECT_EQ(sandbox_environment(BackendKind::LinuxBwrap, policy, false).size(), 1u);
    for (const auto mode : {SandboxMode::ReadOnly, SandboxMode::FullAccess}) {
        policy.mode = mode;
        EXPECT_EQ(sandbox_environment(BackendKind::WindowsRestrictedToken, policy, false).size(), 1u);
    }
    policy.mode = SandboxMode::WorkspaceWrite;
    policy.temporary_directory.clear();
    EXPECT_EQ(sandbox_environment(BackendKind::WindowsRestrictedToken, policy, false).size(), 1u);
}
