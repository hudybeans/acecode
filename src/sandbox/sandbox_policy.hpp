#pragma once

// 沙盒策略模型(openspec add-auto-mode-sandbox,对齐 Codex protocol.rs 的
// SandboxPolicy / WritableRoot):一次 bash 执行允许写哪些根、根下哪些子路径
// 只读、是否放行网络。三平台后端共用这一份,后端只负责把它翻译成令牌 ACE /
// seatbelt 子句 / bwrap 参数。

#include "sandbox_types.hpp"

#include <string>
#include <vector>

namespace acecode::sandbox {

struct WritableRoot {
    std::string root;                              // 绝对路径(已 weakly_canonical)
    std::vector<std::string> read_only_subpaths;   // 根下必须保持只读的子路径
};

struct SandboxPolicy {
    SandboxMode mode = SandboxMode::FullAccess;
    std::vector<WritableRoot> writable_roots;      // 仅 WorkspaceWrite 非空
    bool network_access = false;
    // Windows WorkspaceWrite 的专用临时目录;空 = 不覆盖子进程临时环境。
    std::string temporary_directory;
};

// AgentLoop 注入到 ToolContext 的"这次 bash 怎么跑":策略 + 用哪个后端 +
// 该后端能否断网(决定提示文案)。policy.mode == FullAccess = 不沙盒。
struct ExecSandboxRequest {
    SandboxPolicy policy;
    BackendKind backend = BackendKind::None;
    bool network_enforced = false;
    std::string backend_executable;
};

struct SandboxPolicyOptions {
    std::vector<std::string> extra_writable_roots; // config.sandbox.writable_roots
    bool include_tmpdir = true;                    // !config.sandbox.exclude_tmpdir
    bool network_access = false;
    std::string tmpdir_override;                   // 测试用的系统临时根;空 = 系统临时目录
};

// 计算 WorkspaceWrite 的可写根:write_root(会话写边界根 / cwd)+ 额外根 +
// 临时目录 + 链接 worktree 的 gitdir 与 common dir。每个根下的
// `.git/hooks`、`.git/config`、`.git/config.worktree`、`.git/modules`、
// `.git/worktrees/*/config.worktree`、`.acecode/rules` 列为只读子路径。
std::vector<WritableRoot> compute_writable_roots(const std::string& write_root,
                                                 const SandboxPolicyOptions& options);

SandboxPolicy make_sandbox_policy(SandboxMode mode, const std::string& write_root,
                                  const SandboxPolicyOptions& options);

// 受保护子路径名单(相对某个 .git 目录 / 工作区根)。
std::vector<std::string> protected_subpaths_under(const std::string& root);

// 解析 `<root>/.git` 是文件时的 `gitdir:` 指针,返回 gitdir 与 common dir 的
// 绝对路径(都不存在时返回空)。
struct LinkedGitDirs {
    std::string gitdir;      // <main>/.git/worktrees/<name>
    std::string common_dir;  // <main>/.git
};
LinkedGitDirs resolve_linked_git_dirs(const std::string& root);

std::string system_temp_dir();

// 供 system prompt / /sandbox 用的一行摘要:"workspace-write; writable: a, b; network: blocked"。
std::string describe_policy(const SandboxPolicy& policy, bool network_enforced);

} // namespace acecode::sandbox
