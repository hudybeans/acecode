#pragma once

// 沙盒子系统的基础枚举(openspec add-auto-mode-sandbox)。单独放一个轻量头,
// 让 ToolContext(tool_executor.hpp,被全仓库 include)只需要它和策略结构,
// 不用拖进分类器 / 规则 / 决策表。

#include <string>

namespace acecode::sandbox {

// 一次 bash 执行的沙盒模式。FullAccess = 不沙盒。
enum class SandboxMode { FullAccess, WorkspaceWrite, ReadOnly };

inline const char* sandbox_mode_name(SandboxMode m) {
    switch (m) {
        case SandboxMode::FullAccess:     return "full-access";
        case SandboxMode::WorkspaceWrite: return "workspace-write";
        case SandboxMode::ReadOnly:       return "read-only";
    }
    return "full-access";
}

enum class BackendKind { None, WindowsRestrictedToken, MacosSeatbelt, LinuxBwrap };

inline const char* backend_kind_name(BackendKind kind) {
    switch (kind) {
        case BackendKind::None:                   return "none";
        case BackendKind::WindowsRestrictedToken: return "restricted-token";
        case BackendKind::MacosSeatbelt:          return "seatbelt";
        case BackendKind::LinuxBwrap:             return "bwrap";
    }
    return "none";
}

} // namespace acecode::sandbox
