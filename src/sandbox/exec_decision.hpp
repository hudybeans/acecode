#pragma once

// bash 执行决策表(openspec add-auto-mode-sandbox,对齐 Codex
// exec_policy.rs::render_decision_for_unmatched_command_for_platform)。
//
// 纯函数:输入全部显式,输出「放行 / 弹确认 / 禁止」+ 本次执行用的沙盒模式 +
// 一句原因(给确认框与日志)。AgentLoop 对每次 bash 调用只调这一处,prompt 批准
// 后也直接用 ExecDecision::sandbox,不再二次推导。优先级表见 design.md D4。

#include "command_classifier.hpp"
#include "exec_rules.hpp"
#include "permissions.hpp"
#include "sandbox_types.hpp"

#include <string>

namespace acecode::sandbox {

enum class ExecVerdict { Allow, Prompt, Forbidden };

const char* exec_verdict_name(ExecVerdict v);

// 会话级前缀记忆的结论。
enum class SessionAllowKind { None, Sandboxed, Bypass };

struct ExecDecisionInput {
    PermissionMode mode = PermissionMode::Default;
    bool dangerous_mode = false;          // --dangerous / --yolo 启动
    CommandKind kind = CommandKind::Unknown;
    RuleDecision rule = RuleDecision::NoMatch;
    bool sandbox_available = false;
    bool escalation_requested = false;    // bash 参数 with_escalated_permissions
    SessionAllowKind session_allow = SessionAllowKind::None;
};

struct ExecDecision {
    ExecVerdict verdict = ExecVerdict::Prompt;
    SandboxMode sandbox = SandboxMode::FullAccess;
    // 机器可读原因(前端按它选文案):
    //   rule_forbidden / yolo / rule_prompt / escalation_requested / session_allow /
    //   rule_allow / rule_allow_sandboxed / dangerous_command / known_safe /
    //   unknown_command_sandboxed / unknown_command_without_sandbox /
    //   default_mode / plan_mode
    std::string reason;
};

ExecDecision decide_exec(const ExecDecisionInput& input);

// 模式对应的"自动执行沙盒":auto → WorkspaceWrite,default / plan → ReadOnly,
// yolo → FullAccess。沙盒不可用时退 FullAccess。
SandboxMode mode_sandbox(PermissionMode mode, bool sandbox_available);

} // namespace acecode::sandbox
