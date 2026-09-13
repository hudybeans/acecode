// 沙盒后端的纯字符串部分:Seatbelt policy / sandbox-exec argv / bwrap argv /
// 子进程环境变量。所有平台都编译,单测跨平台跑。

#include "sandbox_backend.hpp"

#include <string>
#include <vector>

namespace acecode::sandbox {

namespace {

// 移植自 Codex codex-rs/sandboxing/src/seatbelt_base_policy.sbpl(deny-default,
// 放行进程 / sysctl / mach-lookup / pty 等基础项)。
const char* kSeatbeltBasePolicy = R"SBPL((version 1)
; ACECode exec sandbox. Base rules ported from openai/codex seatbelt_base_policy.sbpl,
; which itself follows Chromium's macOS sandbox policy.
(deny default)

; child processes inherit the policy of their parent
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))

(allow file-write-data
  (require-all
    (path "/dev/null")
    (vnode-type CHARACTER-DEVICE)))
(allow file-write* (literal "/dev/null") (literal "/dev/tty") (literal "/dev/dtracehelper"))

(allow sysctl-read
  (sysctl-name "hw.activecpu")
  (sysctl-name "hw.busfrequency_compat")
  (sysctl-name "hw.byteorder")
  (sysctl-name "hw.cacheconfig")
  (sysctl-name "hw.cachelinesize_compat")
  (sysctl-name "hw.cpufamily")
  (sysctl-name "hw.cpufrequency_compat")
  (sysctl-name "hw.cputype")
  (sysctl-name "hw.l1dcachesize_compat")
  (sysctl-name "hw.l1icachesize_compat")
  (sysctl-name "hw.l2cachesize_compat")
  (sysctl-name "hw.l3cachesize_compat")
  (sysctl-name "hw.logicalcpu_max")
  (sysctl-name "hw.machine")
  (sysctl-name "hw.model")
  (sysctl-name "hw.memsize")
  (sysctl-name "hw.ncpu")
  (sysctl-name "hw.nperflevels")
  (sysctl-name-prefix "hw.optional.arm.")
  (sysctl-name-prefix "hw.optional.armv8_")
  (sysctl-name "hw.packages")
  (sysctl-name "hw.pagesize_compat")
  (sysctl-name "hw.pagesize")
  (sysctl-name "hw.physicalcpu")
  (sysctl-name "hw.physicalcpu_max")
  (sysctl-name "hw.logicalcpu")
  (sysctl-name "hw.cpufrequency")
  (sysctl-name "hw.tbfrequency_compat")
  (sysctl-name "hw.vectorunit")
  (sysctl-name "machdep.cpu.brand_string")
  (sysctl-name "kern.argmax")
  (sysctl-name "kern.hostname")
  (sysctl-name "kern.maxfilesperproc")
  (sysctl-name "kern.maxproc")
  (sysctl-name "kern.osproductversion")
  (sysctl-name "kern.osrelease")
  (sysctl-name "kern.ostype")
  (sysctl-name "kern.osvariant_status")
  (sysctl-name "kern.osversion")
  (sysctl-name "kern.secure_kernel")
  (sysctl-name "kern.sysv.semmns")
  (sysctl-name "kern.usrstack64")
  (sysctl-name "kern.version")
  (sysctl-name "sysctl.proc_cputype")
  (sysctl-name "vm.loadavg")
  (sysctl-name-prefix "hw.perflevel")
  (sysctl-name-prefix "kern.proc.pgrp.")
  (sysctl-name-prefix "kern.proc.pid.")
  (sysctl-name-prefix "net.routetable.")
)
(allow sysctl-write
  (sysctl-name "kern.grade_cputype"))

(allow iokit-open
  (iokit-registry-entry-class "RootDomainUserClient")
)
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.PowerManagement.control")
  (global-name "com.apple.system.logger")
)
(allow ipc-posix-sem)
(allow ipc-posix-shm-read-data
  ipc-posix-shm-write-create
  ipc-posix-shm-write-unlink
  (ipc-posix-name-regex #"^/__KMP_REGISTERED_LIB_[0-9]+$"))

(allow pseudo-tty)
(allow file-read* file-write* file-ioctl (literal "/dev/ptmx"))
(allow file-read* file-write*
  (require-all
    (regex #"^/dev/ttys[0-9]+")
    (extension "com.apple.sandbox.pty")))
(allow file-ioctl (regex #"^/dev/ttys[0-9]+"))

; ACECode: full disk read (workspace-write / read-only both read everywhere)
(allow file-read*)
)SBPL";

// 移植自 Codex seatbelt_network_policy.sbpl:放行网络时追加。
const char* kSeatbeltNetworkPolicy = R"SBPL(
; network access enabled
(allow network-outbound)
(allow network-inbound)
(allow system-socket)
(allow system-socket
  (require-all
    (socket-domain AF_SYSTEM)
    (socket-protocol 2)
  )
)
(allow mach-lookup
    (global-name "com.apple.bsd.dirhelper")
    (global-name "com.apple.system.opendirectoryd.membership")
    (global-name "com.apple.SecurityServer")
    (global-name "com.apple.networkd")
    (global-name "com.apple.ocspd")
    (global-name "com.apple.trustd.agent")
    (global-name "com.apple.SystemConfiguration.DNSConfiguration")
    (global-name "com.apple.SystemConfiguration.configd")
)
(allow sysctl-read
  (sysctl-name-regex #"^net.routetable")
)
)SBPL";

std::string root_param(std::size_t i) { return "WRITABLE_ROOT_" + std::to_string(i); }
std::string excluded_param(std::size_t i, std::size_t j) {
    return "WRITABLE_ROOT_" + std::to_string(i) + "_EXCLUDED_" + std::to_string(j);
}

} // namespace

std::string build_seatbelt_policy(const SandboxPolicy& policy) {
    std::string out = kSeatbeltBasePolicy;
    if (policy.mode == SandboxMode::WorkspaceWrite) {
        for (std::size_t i = 0; i < policy.writable_roots.size(); ++i) {
            const auto& root = policy.writable_roots[i];
            out += "(allow file-write* (require-all (subpath (param \"" + root_param(i) + "\"))";
            for (std::size_t j = 0; j < root.read_only_subpaths.size(); ++j) {
                out += " (require-not (subpath (param \"" + excluded_param(i, j) + "\")))";
                out += " (require-not (literal (param \"" + excluded_param(i, j) + "\")))";
            }
            out += "))\n";
        }
    }
    if (policy.network_access) out += kSeatbeltNetworkPolicy;
    return out;
}

std::vector<std::string> build_seatbelt_argv(const SandboxPolicy& policy) {
    std::vector<std::string> argv;
    argv.push_back("/usr/bin/sandbox-exec");
    argv.push_back("-p");
    argv.push_back(build_seatbelt_policy(policy));
    if (policy.mode == SandboxMode::WorkspaceWrite) {
        for (std::size_t i = 0; i < policy.writable_roots.size(); ++i) {
            const auto& root = policy.writable_roots[i];
            argv.push_back("-D" + root_param(i) + "=" + root.root);
            for (std::size_t j = 0; j < root.read_only_subpaths.size(); ++j) {
                argv.push_back("-D" + excluded_param(i, j) + "=" + root.read_only_subpaths[j]);
            }
        }
    }
    argv.push_back("--");
    return argv;
}

std::vector<std::string> build_bwrap_argv(const SandboxPolicy& policy) {
    std::vector<std::string> argv;
    argv.push_back("bwrap");
    argv.push_back("--unshare-user");
    argv.push_back("--unshare-pid");
    argv.push_back("--unshare-ipc");
    argv.push_back("--new-session");
    argv.push_back("--ro-bind"); argv.push_back("/"); argv.push_back("/");
    argv.push_back("--dev"); argv.push_back("/dev");
    argv.push_back("--proc"); argv.push_back("/proc");
    if (policy.mode == SandboxMode::WorkspaceWrite) {
        for (const auto& root : policy.writable_roots) {
            argv.push_back("--bind"); argv.push_back(root.root); argv.push_back(root.root);
        }
        // 后绑定的覆盖先绑定的:只读子路径必须排在可写根之后。
        for (const auto& root : policy.writable_roots) {
            for (const auto& ro : root.read_only_subpaths) {
                argv.push_back("--ro-bind"); argv.push_back(ro); argv.push_back(ro);
            }
        }
    }
    if (!policy.network_access) argv.push_back("--unshare-net");
    argv.push_back("--die-with-parent");
    argv.push_back("--");
    return argv;
}

std::vector<std::pair<std::string, std::string>> sandbox_environment(
    BackendKind kind, const SandboxPolicy& policy, bool network_enforced) {
    std::vector<std::pair<std::string, std::string>> env;
    env.emplace_back("ACECODE_SANDBOX", backend_kind_name(kind));
    if (network_enforced && !policy.network_access) {
        env.emplace_back("ACECODE_SANDBOX_NETWORK_DISABLED", "1");
    }
    return env;
}

} // namespace acecode::sandbox
