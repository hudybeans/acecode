#include <gtest/gtest.h>
#include "sandbox/exec_permission.hpp"

using namespace acecode;
using namespace acecode::sandbox;

// 场景:auto 模式的决策表主干。期望:未知命令沙盒不可用时确认、可用时进
// workspace-write 免确认;危险命令一律确认;已知安全放行;显式申请越权即便
// 是安全命令也要确认,且批准后是 full-access。
TEST(ExecDecision, AutoDecisionTable) {
    ExecDecisionInput input;
    input.mode = PermissionMode::Auto;
    input.kind = CommandKind::Unknown;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
    input.sandbox_available = true;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Allow);
    EXPECT_EQ(decide_exec(input).sandbox, SandboxMode::WorkspaceWrite);
    input.kind = CommandKind::Dangerous;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
    input.kind = CommandKind::KnownSafe;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Allow);
    input.escalation_requested = true;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
    EXPECT_EQ(decide_exec(input).sandbox, SandboxMode::FullAccess);
}

// 场景:命中 forbidden 规则,同时是 yolo 模式 + --dangerous 启动。期望:仍是
// Forbidden —— forbidden 是用户写下的硬禁令,优先级高于任何放行模式。
TEST(ExecDecision, ForbiddenSurvivesYoloAndDangerousMode) {
    ExecDecisionInput input;
    input.rule = RuleDecision::Forbidden;
    input.mode = PermissionMode::Yolo;
    input.dangerous_mode = true;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Forbidden);
}

// 场景:default / plan 模式下已知安全命令,以及全局 allow 规则命中。期望:
// 沙盒可用时都进 read-only 沙盒 —— 这两个模式不该让 shell 写任何东西,
// 全局 allow 在 plan 下也不例外(只读约束优先)。
TEST(ExecDecision, DefaultsAndPlanPreferReadOnlyForSafeCommands) {
    ExecDecisionInput input;
    input.kind = CommandKind::KnownSafe;
    input.sandbox_available = true;
    for (const auto mode : {PermissionMode::Default, PermissionMode::Plan}) {
        input.mode = mode;
        EXPECT_EQ(decide_exec(input).sandbox, SandboxMode::ReadOnly);
    }
    input.rule = RuleDecision::Allow;
    EXPECT_EQ(decide_exec(input).sandbox, SandboxMode::ReadOnly);
}

// 场景:会话里记住的是"沙盒内批准"(不是越权批准),之后沙盒变得不可用;
// 以及项目 allow 规则碰上危险参数。期望:两者都回到确认 —— 沙盒内的批准
// 不能在沙盒失效后静默升级成完整访问,项目规则也压不过危险命令确认。
TEST(ExecDecision, SandboxedApprovalDoesNotEscalateWhenBackendFails) {
    ExecDecisionInput input;
    input.mode = PermissionMode::Auto;
    input.session_allow = SessionAllowKind::Sandboxed;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
    input.sandbox_available = true;
    input.kind = CommandKind::Dangerous;
    input.rule = RuleDecision::AllowSandboxed;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
}

// 场景:prompt 规则命中且模型同时显式申请越权。期望:确认一次,批准后按
// 申请给 full-access,而不是把模型的越权申请悄悄降级回沙盒内执行。
TEST(ExecDecision, RulePromptCanApproveExplicitEscalation) {
    ExecDecisionInput input;
    input.mode = PermissionMode::Auto;
    input.sandbox_available = true;
    input.rule = RuleDecision::Prompt;
    input.escalation_requested = true;
    EXPECT_EQ(decide_exec(input).verdict, ExecVerdict::Prompt);
    EXPECT_EQ(decide_exec(input).sandbox, SandboxMode::FullAccess);
}

// 场景:越权申请缺 justification / 类型错误;正常申请后用户"总是允许"。期望:
// 参数错误直接报错不弹确认;记住的是 `git commit` 这一个前缀(bypass),
// 同前缀免确认、`git push --force` 仍确认;切换模式清空记忆;bash 永远不会
// 被整个工具级"总是允许"。
TEST(ExecPermission, ValidatesEscalationBeforePromptAndRemembersOnlySpecificPrefixes) {
    PermissionManager permissions;
    permissions.set_mode(PermissionMode::Auto);
    EXPECT_FALSE(evaluate_exec_permission(R"({"command":"git status","with_escalated_permissions":true})",
        permissions, {}, true).error.empty());
    EXPECT_FALSE(evaluate_exec_permission(R"({"command":"git status","with_escalated_permissions":"yes"})",
        permissions, {}, true).error.empty());
    auto first = evaluate_exec_permission(R"({"command":"git commit -m x","with_escalated_permissions":true,"justification":"write repository metadata"})",
        permissions, {}, true);
    ASSERT_EQ(first.prefixes, std::vector<std::string>{"git commit"});
    EXPECT_EQ(first.arguments["permission"]["reason"], "escalation_requested");
    permissions.add_session_command_allow(first.prefixes[0], true);
    EXPECT_EQ(evaluate_exec_permission(first.arguments.dump(), permissions, {}, true).decision.verdict, ExecVerdict::Allow);
    EXPECT_EQ(evaluate_exec_permission(R"({"command":"git push --force"})", permissions, {}, true).decision.verdict, ExecVerdict::Prompt);
    permissions.set_mode(PermissionMode::Default);
    EXPECT_EQ(permissions.session_command_allow({"git commit"}), SessionCommandAllow::None);
    permissions.add_session_allow("bash");
    EXPECT_FALSE(permissions.has_session_allow("bash"));
}

// 场景:旧模式名解析与规则目录保护。期望:auto / accept-edits / acceptEdits
// 都解析成 Auto 且归一成 "auto";未知名字返回空;内置 Deny 规则命中
// `.acecode/rules/` 下的文件写入;Windows 反斜杠路径也能识别为规则目录。
TEST(ExecPermission, LegacyModeNamesAndRuleDirectoryProtection) {
    for (const char* name : {"auto", "accept-edits", "acceptEdits"}) {
        EXPECT_EQ(PermissionManager::parse_mode_name(name), PermissionMode::Auto);
        EXPECT_EQ(PermissionManager::canonical_mode_name(name), "auto");
    }
    EXPECT_FALSE(PermissionManager::parse_mode_name("banana"));
    PermissionManager permissions;
    permissions.set_mode(PermissionMode::Auto);
    EXPECT_EQ(permissions.matched_rule("file_write", ".acecode/rules/default.rules"), RuleAction::Deny);
    EXPECT_TRUE(is_exec_rules_path("C:\\project\\.acecode\\rules\\default.rules"));
}
