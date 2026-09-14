#pragma once

// 沙盒后端(openspec add-auto-mode-sandbox)。三平台各一个:
//   - Windows:WRITE_RESTRICTED 受限令牌 + 工作区 ACE(对齐 Codex unelevated 档)
//   - macOS:/usr/bin/sandbox-exec + Seatbelt policy(对齐 Codex seatbelt.rs)
//   - Linux:bubblewrap(对齐 Codex bwrap.rs;只用系统已装的,绝不下载)
//
// 纯字符串的 argv / policy 组装函数在所有平台都编译,单测跨平台跑;真正碰
// OS 的探测与令牌 / ACE 操作按平台 #ifdef。

#include "sandbox_policy.hpp"
#include "sandbox_types.hpp"

#include <string>
#include <utility>
#include <vector>

namespace acecode::sandbox {

struct BackendProbe {
    BackendKind kind = BackendKind::None;
    bool available = false;
    bool network_enforced = false;   // 该后端能否真的断网(Windows unelevated 不能)
    std::string reason;              // 不可用时的原因;可用时可为空
    std::string executable_path;     // POSIX: 探测过的绝对后端路径,避免在 cwd 重新找程序
};

// 真探测(不缓存;缓存在 SandboxRuntime)。
BackendProbe probe_backend();

// ---- 纯逻辑(所有平台编译)----

// Seatbelt policy 文本与 sandbox-exec argv 前缀(不含 shell 与命令)。
std::string build_seatbelt_policy(const SandboxPolicy& policy);
std::vector<std::string> build_seatbelt_argv(const SandboxPolicy& policy);

// bubblewrap argv 前缀(不含 shell 与命令),以 "--" 结尾。
std::vector<std::string> build_bwrap_argv(const SandboxPolicy& policy);

// 子进程环境变量:ACECODE_SANDBOX=<backend>,断网时另加 ACECODE_SANDBOX_NETWORK_DISABLED=1。
std::vector<std::pair<std::string, std::string>> sandbox_environment(
    BackendKind kind, const SandboxPolicy& policy, bool network_enforced);

#ifdef _WIN32
// 合成 SID(S-1-5-80-… 服务 SID 派生规则)的字符串形式。
std::string synthetic_sid_string(const SandboxPolicy& policy);

// 创建受限主令牌。返回 HANDLE(void*),失败返回 nullptr 并填 error。
void* create_restricted_token(const SandboxPolicy& policy, std::string* error);

// 每次核对实际 ACL,幂等地补齐策略里的可写根 / 只读子路径 ACE。
// ReadOnly 策略什么都不打,直接 true。
bool ensure_windows_acl_grants(const SandboxPolicy& policy, std::string* error);

// 撤掉指定路径上属于这一策略 SID 的 ACE(内部辅助,未暴露为命令)。
bool remove_windows_acl_grants(const std::string& path, const SandboxPolicy& policy, std::string* error);
#endif

} // namespace acecode::sandbox
