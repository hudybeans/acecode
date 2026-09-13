#include <gtest/gtest.h>
#include "sandbox/sandbox_denial.hpp"
#include <csignal>

using namespace acecode::sandbox;

// 场景:沙盒内命令失败,输出含中英文权限拒绝特征 / 普通编译错误 / 127 / 2。
// 期望:只有非零退出码 + 特征词才判为沙盒拒绝;退出 0、用法错误(2)、
// 找不到命令(127)都不归咎沙盒;POSIX 上 seccomp 的 128+SIGSYS 直接判定。
TEST(SandboxDenial, RecognizesPermissionFailuresWithoutBlamingEveryError) {
    for (const char* output : {"Access is denied.", "拒绝访问。", "Permission denied", "Read-only file system"}) {
        EXPECT_TRUE(is_likely_sandbox_denied(1, output));
        EXPECT_FALSE(is_likely_sandbox_denied(0, output));
    }
    EXPECT_FALSE(is_likely_sandbox_denied(1, "compilation failed"));
    EXPECT_FALSE(is_likely_sandbox_denied(127, "command not found"));
    EXPECT_FALSE(is_likely_sandbox_denied(2, "invalid option"));
#ifndef _WIN32
    EXPECT_TRUE(is_likely_sandbox_denied(128 + SIGSYS, ""));
#endif
}

// 场景:升级提示文案。期望:后端不拦网络(Windows)时不说"网络已阻断",
// 拦网络时才说;两种情况都指引模型用 with_escalated_permissions + justification。
TEST(SandboxDenial, WindowsHintDoesNotClaimNetworkIsBlocked) {
    SandboxPolicy policy;
    policy.mode = SandboxMode::WorkspaceWrite;
    policy.writable_roots.push_back({"workspace", {"workspace/.acecode/rules"}});
    const auto windows = escalation_hint(policy, false);
    EXPECT_EQ(windows.find("Network access is blocked"), std::string::npos);
    EXPECT_NE(windows.find("with_escalated_permissions=true"), std::string::npos);
    EXPECT_NE(windows.find("justification"), std::string::npos);
    EXPECT_NE(escalation_hint(policy, true).find("Network access is blocked"), std::string::npos);
}
