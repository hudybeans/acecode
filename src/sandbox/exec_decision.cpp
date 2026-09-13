#include "exec_decision.hpp"

namespace acecode::sandbox {

const char* exec_verdict_name(ExecVerdict v) {
    switch (v) {
        case ExecVerdict::Allow:     return "allow";
        case ExecVerdict::Prompt:    return "prompt";
        case ExecVerdict::Forbidden: return "forbidden";
    }
    return "prompt";
}

SandboxMode mode_sandbox(PermissionMode mode, bool sandbox_available) {
    if (!sandbox_available) return SandboxMode::FullAccess;
    switch (mode) {
        case PermissionMode::Auto:    return SandboxMode::WorkspaceWrite;
        case PermissionMode::Default: return SandboxMode::ReadOnly;
        case PermissionMode::Plan:    return SandboxMode::ReadOnly;
        case PermissionMode::Yolo:    return SandboxMode::FullAccess;
    }
    return SandboxMode::FullAccess;
}

namespace {

// 用户在 prompt 上点允许之后实际执行用的沙盒:auto 仍留在 workspace-write 里
// (越界会再触发升级申请),default / plan 视为用户已经审过这条命令,不沙盒。
SandboxMode approved_sandbox(const ExecDecisionInput& in) {
    if (in.mode == PermissionMode::Auto && in.sandbox_available) return SandboxMode::WorkspaceWrite;
    return SandboxMode::FullAccess;
}

ExecDecision make(ExecVerdict v, SandboxMode s, const char* reason) {
    ExecDecision d;
    d.verdict = v;
    d.sandbox = s;
    d.reason = reason;
    return d;
}

} // namespace

ExecDecision decide_exec(const ExecDecisionInput& in) {
    // 1. forbidden 规则对任何模式都生效,包括 --dangerous。
    if (in.rule == RuleDecision::Forbidden) {
        return make(ExecVerdict::Forbidden, SandboxMode::FullAccess, "rule_forbidden");
    }
    // 2. yolo / dangerous:全放行、不沙盒。
    if (in.dangerous_mode || in.mode == PermissionMode::Yolo) {
        return make(ExecVerdict::Allow, SandboxMode::FullAccess, "yolo");
    }
    // 3. prompt 规则。
    if (in.rule == RuleDecision::Prompt) {
        return make(ExecVerdict::Prompt,
                    in.escalation_requested ? SandboxMode::FullAccess : approved_sandbox(in), "rule_prompt");
    }
    // 4. 模型显式申请越权:批准后不沙盒。
    if (in.escalation_requested && in.session_allow != SessionAllowKind::Bypass) {
        return make(ExecVerdict::Prompt, SandboxMode::FullAccess, "escalation_requested");
    }
    // 5. 会话级前缀记忆(升级审批通过的那种):不沙盒。
    if (in.session_allow == SessionAllowKind::Bypass && in.kind != CommandKind::Dangerous) {
        return make(ExecVerdict::Allow, SandboxMode::FullAccess, "session_allow");
    }
    // 6. 全局 allow 规则:绕过沙盒。plan 模式例外 —— 只读约束优先。
    if (in.rule == RuleDecision::Allow) {
        if (in.mode == PermissionMode::Plan) {
            if (in.sandbox_available) return make(ExecVerdict::Allow, SandboxMode::ReadOnly, "rule_allow");
            return make(ExecVerdict::Prompt, SandboxMode::FullAccess, "plan_mode");
        }
        return make(ExecVerdict::Allow, SandboxMode::FullAccess, "rule_allow");
    }
    // 项目文件和较宽的会话前缀不能悄悄放行新出现的危险参数。
    if (in.kind == CommandKind::Dangerous) {
        return make(ExecVerdict::Prompt,
                    in.escalation_requested ? SandboxMode::FullAccess : approved_sandbox(in), "dangerous_command");
    }
    // 7. 项目 allow 规则 / 普通会话记忆:免确认但走模式沙盒。
    if (in.rule == RuleDecision::AllowSandboxed || in.session_allow == SessionAllowKind::Sandboxed) {
        const bool from_session = in.session_allow == SessionAllowKind::Sandboxed;
        if (in.sandbox_available) {
            const SandboxMode s = in.mode == PermissionMode::Plan ? SandboxMode::ReadOnly
                                                                   : SandboxMode::WorkspaceWrite;
            return make(ExecVerdict::Allow, s, from_session ? "session_allow" : "rule_allow_sandboxed");
        }
        // 在沙盒内记住的批准不能在沙盒失效后自动升级为完整访问。
        return make(ExecVerdict::Prompt, SandboxMode::FullAccess, "unknown_command_without_sandbox");
    }
    // 9. 已知安全:放行,尽量放进沙盒。
    if (in.kind == CommandKind::KnownSafe) {
        return make(ExecVerdict::Allow, mode_sandbox(in.mode, in.sandbox_available), "known_safe");
    }
    // 10. 未知命令。
    if (in.mode == PermissionMode::Auto) {
        if (in.sandbox_available) {
            return make(ExecVerdict::Allow, SandboxMode::WorkspaceWrite, "unknown_command_sandboxed");
        }
        return make(ExecVerdict::Prompt, SandboxMode::FullAccess, "unknown_command_without_sandbox");
    }
    // 11. default / plan:照旧确认。
    return make(ExecVerdict::Prompt, SandboxMode::FullAccess,
                in.mode == PermissionMode::Plan ? "plan_mode" : "default_mode");
}

} // namespace acecode::sandbox
