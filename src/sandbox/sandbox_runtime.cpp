#include "sandbox_runtime.hpp"

#include "utils/logger.hpp"
#include "utils/utf8_path.hpp"

#include <sstream>
#include <filesystem>
#include <fstream>

namespace acecode::sandbox {

SandboxRuntime& SandboxRuntime::instance() {
    static SandboxRuntime rt;
    return rt;
}

void SandboxRuntime::configure(SandboxRuntimeConfig cfg) {
    std::lock_guard<std::mutex> lk(mu_);
    cfg_ = std::move(cfg);
    probe_.reset();
}

SandboxRuntimeConfig SandboxRuntime::config() const {
    std::lock_guard<std::mutex> lk(mu_);
    return cfg_;
}

BackendProbe SandboxRuntime::probe() {
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (probe_) return *probe_;
        if (!cfg_.enabled) {
            BackendProbe disabled;
            disabled.available = false;
            disabled.reason = "disabled by config.sandbox.enabled=false";
            probe_ = disabled;
            return disabled;
        }
    }
    // 真探测放在锁外:Windows 上要创建令牌,Linux 上要 fork bwrap。
    static const BackendProbe process_probe = probe_backend();
    BackendProbe fresh = process_probe;
    std::lock_guard<std::mutex> lk(mu_);
    if (!probe_) {
        probe_ = fresh;
        if (fresh.available) {
            LOG_INFO(std::string("[sandbox] backend available: ") + backend_kind_name(fresh.kind));
        } else {
            LOG_INFO(std::string("[sandbox] backend unavailable (") + backend_kind_name(fresh.kind) +
                     "): " + fresh.reason);
        }
    }
    return *probe_;
}

bool SandboxRuntime::available() {
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (override_) return *override_;
        if (!cfg_.enabled) return false;
    }
    return probe().available;
}

bool SandboxRuntime::network_enforced() {
    return probe().network_enforced;
}

void SandboxRuntime::set_availability_override_for_tests(std::optional<bool> value) {
    std::lock_guard<std::mutex> lk(mu_);
    override_ = value;
}

SandboxPolicyOptions SandboxRuntime::policy_options() const {
    std::lock_guard<std::mutex> lk(mu_);
    SandboxPolicyOptions options;
    options.extra_writable_roots = cfg_.writable_roots;
    options.include_tmpdir = !cfg_.exclude_tmpdir;
    options.network_access = cfg_.network_access;
    return options;
}

SandboxPolicy SandboxRuntime::policy_for(SandboxMode mode, const std::string& write_root) const {
    return make_sandbox_policy(mode, write_root, policy_options());
}

ExecSandboxRequest SandboxRuntime::request_for(SandboxMode mode, const std::string& write_root) {
    ExecSandboxRequest req;
    req.policy = policy_for(mode, write_root);
    if (mode == SandboxMode::FullAccess) {
        req.backend = BackendKind::None;
        req.network_enforced = false;
        return req;
    }
    const BackendProbe p = probe();
    req.backend = p.kind;
    req.network_enforced = p.network_enforced;
    req.backend_executable = p.executable_path;
    return req;
}

void SandboxRuntime::mark_unavailable(const std::string& reason) {
    std::lock_guard<std::mutex> lk(mu_);
    if (!probe_) probe_ = BackendProbe{};
    probe_->available = false;
    probe_->reason = reason;
}

void SandboxRuntime::reset_probe() {
    std::lock_guard<std::mutex> lk(mu_);
    probe_.reset();
}

std::string SandboxRuntime::prepare_request(ExecSandboxRequest& request) {
    if (request.policy.mode == SandboxMode::FullAccess) return {};
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (override_) return *override_ ? std::string{} : "sandbox unavailable (test override)";
    }
    namespace fs = std::filesystem;
    std::string error;
    if (!available()) return probe().reason;
#ifdef _WIN32
    if (!request.policy.temporary_directory.empty()) {
        const auto temporary = path_from_utf8(request.policy.temporary_directory);
        std::error_code ec;
        const auto resolved = fs::weakly_canonical(temporary, ec);
        if (ec || resolved != temporary) {
            return "Sandbox temporary directory was redirected: " + request.policy.temporary_directory;
        }
        fs::create_directories(temporary, ec);
        if (ec) return "Cannot prepare sandbox temporary directory: " + ec.message();
        if (fs::weakly_canonical(temporary, ec) != temporary || ec) {
            return "Sandbox temporary directory was redirected: " + request.policy.temporary_directory;
        }
    }
#endif
    if (request.policy.mode == SandboxMode::WorkspaceWrite) {
        if (request.policy.writable_roots.empty()) return "No sandbox workspace root.";
        for (const auto& writable : request.policy.writable_roots) {
            const auto root = path_from_utf8(writable.root);
            for (const auto& protected_path : writable.read_only_subpaths) {
                std::error_code ec;
                const auto path = path_from_utf8(protected_path);
                const auto resolved = fs::weakly_canonical(path, ec);
                const auto relative = resolved.lexically_relative(root);
                if (ec || relative.empty() || *relative.begin() == "..") {
                    return "Protected path resolves outside the sandbox root: " + protected_path;
                }
                if (fs::exists(path, ec) && !ec) continue;
                if (ec) return "Cannot inspect protected path: " + ec.message();
                // Windows ACL / bwrap bind 都需要实体。预建空的规则、hooks、modules
                // 目录和 config.worktree 文件,封住稍后新建敏感路径的漏洞。
                const bool directory = path.filename() == "rules" || path.filename() == "hooks" ||
                                       path.filename() == "modules";
                fs::create_directories(directory ? path : path.parent_path(), ec);
                if (ec) return "Cannot prepare protected path: " + ec.message();
                if (!directory) {
                    std::ofstream placeholder(path, std::ios::binary | std::ios::app);
                    if (!placeholder) return "Cannot prepare protected file: " + protected_path;
                }
            }
        }
    }
#ifdef _WIN32
    if (!ensure_windows_acl_grants(request.policy, &error)) {
        mark_unavailable(error);
        return error;
    }
#endif
    return {};
}

std::string SandboxRuntime::status_text(PermissionMode mode, const std::string& write_root,
                                        bool session_disabled) {
    const SandboxRuntimeConfig cfg = config();
    const BackendProbe p = probe();
    const bool usable = available() && !session_disabled;
    std::ostringstream oss;
    oss << "Sandbox backend : " << backend_kind_name(p.kind) << "\n";
    oss << "Available       : " << (usable ? "yes" : "no");
    if (session_disabled) oss << " (disabled for this session via /sandbox off)";
    else if (!cfg.enabled) oss << " (config.sandbox.enabled=false)";
    else if (!p.available && !p.reason.empty()) oss << " (" << p.reason << ")";
    oss << "\n";
    oss << "Permission mode : " << PermissionManager::mode_name(mode) << "\n";
    const SandboxMode sm = mode_sandbox(mode, usable);
    oss << "Auto-run policy : " << sandbox_mode_name(sm) << "\n";
    if (sm == SandboxMode::WorkspaceWrite) {
        const SandboxPolicy policy = policy_for(sm, write_root);
        oss << "Writable roots  :";
        if (policy.writable_roots.empty()) oss << " (none)";
        oss << "\n";
        for (const auto& root : policy.writable_roots) {
            oss << "  - " << root.root << "\n";
            for (const auto& ro : root.read_only_subpaths) {
                oss << "      read-only: " << ro << "\n";
            }
        }
    }
    oss << "Network         : ";
    if (!p.network_enforced) oss << "not enforced by this backend";
    else oss << (cfg.network_access ? "allowed" : "blocked");
    oss << "\n";
    if (p.kind == BackendKind::WindowsRestrictedToken && usable) {
        oss << "Windows limits  : delete/rename are not fully restricted; public writable paths remain writable\n";
    }
    oss << "Config          : network_access=" << (cfg.network_access ? "true" : "false")
        << " exclude_tmpdir=" << (cfg.exclude_tmpdir ? "true" : "false")
        << " writable_roots=" << cfg.writable_roots.size() << "\n";
    return oss.str();
}

} // namespace acecode::sandbox
