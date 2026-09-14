#pragma once

// 沙盒运行时(openspec add-auto-mode-sandbox):会话持有配置,进程共享后端探测,
// 按模式构造策略、生成 /sandbox 与 system prompt 用的状态文本。
//
// 探测结果缓存的意义不只是省开销:system prompt 的 `Shell sandbox:` 行读它,
// 同一回合内不能翻转,否则打穿 prompt cache 前缀。configure() 后重置缓存。

#include "exec_decision.hpp"
#include "sandbox_backend.hpp"
#include "sandbox_policy.hpp"

#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace acecode::sandbox {

struct SandboxRuntimeConfig {
    bool enabled = true;
    bool network_access = false;
    std::vector<std::string> writable_roots;
    bool exclude_tmpdir = false;
};

class SandboxRuntime {
public:
    static SandboxRuntime& instance();

    void configure(SandboxRuntimeConfig cfg);
    SandboxRuntimeConfig config() const;

    // 缓存的后端探测(首次调用真探测)。
    BackendProbe probe();
    // config.enabled && 后端可用(测试覆盖优先)。
    bool available();
    bool network_enforced();

    // 测试用:强制可用 / 不可用(nullopt = 取消覆盖)。
    void set_availability_override_for_tests(std::optional<bool> value);

    SandboxPolicyOptions policy_options() const;
    SandboxPolicy policy_for(SandboxMode mode, const std::string& write_root) const;
    ExecSandboxRequest request_for(SandboxMode mode, const std::string& write_root);
    // 决策之后、执行之前准备保护路径。失败只报告不可用,绝不在这里执行未沙盒命令。
    std::string prepare_request(ExecSandboxRequest& request);
    void mark_unavailable(const std::string& reason);
    // 丢掉本会话缓存的探测结论(含 mark_unavailable 的粘性标记),下次 probe()
    // 重新读取进程级探测结果。/sandbox on 用它恢复。
    void reset_probe();

    // 给 /sandbox 用的多行状态;给 system prompt 用的单行摘要在
    // system_prompt.cpp 里按 SystemPromptSandboxState 拼。
    std::string status_text(PermissionMode mode, const std::string& write_root,
                            bool session_disabled);

private:
    mutable std::mutex mu_;
    SandboxRuntimeConfig cfg_;
    std::optional<BackendProbe> probe_;
    std::optional<bool> override_;
};

inline SandboxRuntime& runtime() { return SandboxRuntime::instance(); }

} // namespace acecode::sandbox
