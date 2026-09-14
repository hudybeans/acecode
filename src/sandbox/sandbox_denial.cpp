#include "sandbox_denial.hpp"

#include <algorithm>
#include <cctype>
#include <csignal>

namespace acecode::sandbox {

namespace {

std::string lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return s;
}

} // namespace

bool is_likely_sandbox_denied(int exit_code, const std::string& output) {
    if (exit_code == 0) return false;
    // 2 = 用法错误,126 = 不可执行,127 = 找不到命令:都不是沙盒的锅。
    if (exit_code == 2 || exit_code == 126 || exit_code == 127) return false;
#ifndef _WIN32
    if (exit_code == 128 + SIGSYS) return true;
#endif
    const std::string text = lower(output);
    static const char* kNeedles[] = {
        "operation not permitted",
        "permission denied",
        "read-only file system",
        "access is denied",
        "access denied",
        "拒绝访问",
        "seccomp",
        // 裸 "sandbox" 刻意不收:本仓库自己就有 src/sandbox/,一次编译错误的
        // 输出里全是 sandbox_*.cpp,非零退出就会被当成沙盒拒绝、误导模型去
        // 申请越权。只认后端自己报错时的拼写。
        "sandbox-exec",
        "sandbox: deny",
        "seatbelt",
        "bwrap:",
        "landlock",
        "failed to write file",
        "eacces",
        "eperm",
    };
    for (const char* needle : kNeedles) {
        if (text.find(needle) != std::string::npos) return true;
    }
    return false;
}

std::string escalation_hint(const SandboxPolicy& policy, bool network_enforced) {
    std::string hint = "\n[Sandbox] This command ran inside the ";
    hint += sandbox_mode_name(policy.mode);
    hint += " sandbox and the failure looks like a sandbox denial. ";
    if (policy.mode == SandboxMode::ReadOnly) {
        hint += "The policy has no writable roots. ";
    } else if (policy.mode == SandboxMode::WorkspaceWrite) {
        hint += "The policy permits content writes under: ";
        bool first = true;
        for (const auto& r : policy.writable_roots) {
            if (!first) hint += ", ";
            first = false;
            hint += r.root;
        }
        if (first) hint += "(none)";
        hint += " (git hooks/config and .acecode/rules are excluded from content writes). ";
    }
    if (network_enforced) {
        hint += policy.network_access ? "Network access is allowed. " : "Network access is blocked. ";
    }
    hint += "If the command needs to write elsewhere";
    if (network_enforced && !policy.network_access) hint += " or use the network";
    hint += ", call bash again with with_escalated_permissions=true and a one-sentence "
            "justification; the user will be asked to approve running it outside the sandbox. "
            "Do not try to work around the sandbox by other means.";
    return hint;
}

} // namespace acecode::sandbox
