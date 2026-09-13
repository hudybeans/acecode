#pragma once

// 沙盒拒绝判定(openspec add-auto-mode-sandbox,对齐 Codex sandboxing/src/denial.rs):
// 命令在沙盒里失败,能否归因到沙盒限制。判得出来就给模型一段固定的升级提示,
// 引导它带 with_escalated_permissions + justification 重试,而不是换花样绕。

#include "sandbox_policy.hpp"

#include <string>

namespace acecode::sandbox {

// exit_code 0 / 2 / 126 / 127 不算;其余在 output 里大小写不敏感找拒绝特征词。
bool is_likely_sandbox_denied(int exit_code, const std::string& output);

// 附在工具输出末尾的升级提示。network_enforced=false 时不提网络。
std::string escalation_hint(const SandboxPolicy& policy, bool network_enforced);

} // namespace acecode::sandbox
