#include "sandbox_policy.hpp"

#include "utils/utf8_path.hpp"
#include "utils/sha1.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <system_error>

namespace acecode::sandbox {

namespace fs = std::filesystem;

namespace {

std::string canonical_utf8(const std::string& path) {
    if (path.empty()) return {};
    std::error_code ec;
    fs::path p = path_from_utf8(path);
    fs::path c = fs::weakly_canonical(p, ec);
    if (ec || c.empty()) c = fs::absolute(p, ec);
    if (ec || c.empty()) return path;
    std::string out = path_to_utf8(c);
    while (out.size() > path_to_utf8(c.root_path()).size() &&
           (out.back() == '/' || out.back() == '\\')) out.pop_back();
    return out;
}

std::string temporary_write_root(const std::string& write_root,
                                  const SandboxPolicyOptions& options) {
    if (!options.include_tmpdir) return {};
    const auto base = options.tmpdir_override.empty() ? system_temp_dir()
                                                     : canonical_utf8(options.tmpdir_override);
    if (base.empty()) return {};
#ifdef _WIN32
    // 系统 TEMP 可能含几十万个无关文件。SetNamedSecurityInfoW 会递归传播 ACL,
    // 不能把它直接作为默认写根。目录名绑定规范化工作区,重启/重开会话后仍复用
    // 同一策略身份,避免因随机临时目录让整个工作区反复新增 ACE。
    auto identity = canonical_utf8(write_root);
    for (char& c : identity) {
        if (c >= 'a' && c <= 'z') c -= 'a' - 'A';
        if (c == '\\') c = '/';
    }
    // 保留预期路径,不要在这里跟随专用目录上的 junction;prepare_request 会核验。
    return path_to_utf8(path_from_utf8(base) / "acecode-sandbox" / sha1_hex(identity));
#else
    return base;
#endif
}

bool exists_any(const fs::path& p) {
    std::error_code ec;
    return fs::exists(p, ec) && !ec;
}

std::string trim(std::string s) {
    while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == ' ' || s.back() == '\t')) s.pop_back();
    std::size_t i = 0;
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) ++i;
    return s.substr(i);
}

void add_protected_git_entries(const fs::path& git_dir, std::vector<std::string>& out) {
    for (const char* name : {"hooks", "config", "config.worktree", "modules"}) {
        const fs::path p = git_dir / name;
        out.push_back(path_to_utf8(p));
    }
    std::error_code ec;
    const fs::path worktrees = git_dir / "worktrees";
    if (fs::is_directory(worktrees, ec) && !ec) {
        for (const auto& entry : fs::directory_iterator(worktrees, ec)) {
            if (ec) break;
            const fs::path cfg = entry.path() / "config.worktree";
            out.push_back(path_to_utf8(cfg));
        }
    }
}

void add_root(std::vector<WritableRoot>& roots, const std::string& raw,
              const std::vector<std::string>& extra_ro) {
    const std::string root = canonical_utf8(raw);
    if (root.empty()) return;
    for (const auto& existing : roots) {
        if (existing.root == root) return;
    }
    WritableRoot wr;
    wr.root = root;
    wr.read_only_subpaths = protected_subpaths_under(root);
    for (const auto& ro : extra_ro) wr.read_only_subpaths.push_back(ro);
    std::sort(wr.read_only_subpaths.begin(), wr.read_only_subpaths.end());
    wr.read_only_subpaths.erase(std::unique(wr.read_only_subpaths.begin(), wr.read_only_subpaths.end()),
                                wr.read_only_subpaths.end());
    roots.push_back(std::move(wr));
}

} // namespace

std::vector<std::string> protected_subpaths_under(const std::string& root) {
    std::vector<std::string> out;
    if (root.empty()) return out;
    const fs::path base = path_from_utf8(root);
    std::error_code ec;
    const fs::path git = base / ".git";
    if (fs::is_directory(git, ec) && !ec) {
        add_protected_git_entries(git, out);
    } else if (fs::is_regular_file(git, ec) && !ec) {
        out.push_back(path_to_utf8(git));
    }
    // 根本身就是一个 .git 目录(链接 worktree 的 common dir 作为可写根时)。
    if (base.filename() == ".git" && fs::is_directory(base, ec) && !ec) {
        add_protected_git_entries(base, out);
    }
    // 链接 worktree 的 gitdir(<main>/.git/worktrees/<name>)。
    if (base.parent_path().filename() == "worktrees" &&
        base.parent_path().parent_path().filename() == ".git") {
        const fs::path cfg = base / "config.worktree";
        out.push_back(path_to_utf8(cfg));
    }
    const fs::path rules = base / ".acecode" / "rules";
    out.push_back(path_to_utf8(rules));
    for (auto& p : out) p = canonical_utf8(p);
    std::sort(out.begin(), out.end());
    out.erase(std::unique(out.begin(), out.end()), out.end());
    return out;
}

LinkedGitDirs resolve_linked_git_dirs(const std::string& root) {
    LinkedGitDirs out;
    if (root.empty()) return out;
    std::error_code ec;
    const fs::path git_file = path_from_utf8(root) / ".git";
    if (!fs::is_regular_file(git_file, ec) || ec) return out;
    std::ifstream ifs(git_file, std::ios::binary);
    std::string line;
    if (!std::getline(ifs, line)) return out;
    line = trim(line);
    const std::string prefix = "gitdir:";
    if (line.compare(0, prefix.size(), prefix) != 0) return out;
    std::string target = trim(line.substr(prefix.size()));
    if (target.empty()) return out;
    fs::path gitdir = path_from_utf8(target);
    if (gitdir.is_relative()) gitdir = path_from_utf8(root) / gitdir;
    if (!fs::is_directory(gitdir, ec) || ec) return out;
    out.gitdir = canonical_utf8(path_to_utf8(gitdir));
    // commondir 文件指向 common dir(通常是 "../.."),缺省按目录结构推。
    fs::path common = gitdir.parent_path().parent_path();
    const fs::path commondir_file = gitdir / "commondir";
    if (fs::is_regular_file(commondir_file, ec) && !ec) {
        std::ifstream cf(commondir_file, std::ios::binary);
        std::string rel;
        if (std::getline(cf, rel)) {
            rel = trim(rel);
            if (!rel.empty()) {
                fs::path candidate = path_from_utf8(rel);
                if (candidate.is_relative()) candidate = gitdir / candidate;
                common = candidate;
            }
        }
    }
    // 只信任 Git 实际登记的 linked worktree。任意 gitdir:/commondir 文本不能新增写根。
    const auto canonical_git = path_from_utf8(out.gitdir);
    if (canonical_git.parent_path().filename() != "worktrees" ||
        canonical_git.parent_path().parent_path().filename() != ".git" ||
        canonical_utf8(path_to_utf8(common)) != canonical_utf8(path_to_utf8(canonical_git.parent_path().parent_path()))) {
        return {};
    }
    std::ifstream backref(canonical_git / "gitdir", std::ios::binary);
    std::string registered_file;
    if (!std::getline(backref, registered_file) ||
        canonical_utf8(trim(registered_file)) != canonical_utf8(path_to_utf8(git_file))) return {};
    if (fs::is_directory(common, ec) && !ec) out.common_dir = canonical_utf8(path_to_utf8(common));
    return out;
}

std::string system_temp_dir() {
    std::error_code ec;
    fs::path tmp = fs::temp_directory_path(ec);
    if (ec || tmp.empty()) return {};
    return canonical_utf8(path_to_utf8(tmp));
}

std::vector<WritableRoot> compute_writable_roots(const std::string& write_root,
                                                 const SandboxPolicyOptions& options) {
    std::vector<WritableRoot> roots;
    if (!write_root.empty()) {
        add_root(roots, write_root, {});
        const LinkedGitDirs linked = resolve_linked_git_dirs(canonical_utf8(write_root));
        if (!linked.gitdir.empty()) add_root(roots, linked.gitdir, {});
        if (!linked.common_dir.empty()) add_root(roots, linked.common_dir, {});
    }
    for (const auto& extra : options.extra_writable_roots) {
        if (!extra.empty() && path_from_utf8(extra).is_absolute()) add_root(roots, extra, {});
    }
    if (options.include_tmpdir) {
        const std::string tmp = temporary_write_root(write_root, options);
        if (!tmp.empty()) add_root(roots, tmp, {});
    }
    // 可写根重叠时,较窄的 allow 也必须排除所有只读子路径(尤其是 Seatbelt)。
    std::vector<std::string> protected_paths;
    for (const auto& root : roots) {
        protected_paths.insert(protected_paths.end(), root.read_only_subpaths.begin(), root.read_only_subpaths.end());
    }
    for (auto& root : roots) {
        for (const auto& ro : protected_paths) {
            const auto relative = path_from_utf8(ro).lexically_relative(path_from_utf8(root.root));
            if (!relative.empty() && *relative.begin() != "..") root.read_only_subpaths.push_back(ro);
        }
        std::sort(root.read_only_subpaths.begin(), root.read_only_subpaths.end());
        root.read_only_subpaths.erase(std::unique(root.read_only_subpaths.begin(), root.read_only_subpaths.end()), root.read_only_subpaths.end());
    }
    return roots;
}

SandboxPolicy make_sandbox_policy(SandboxMode mode, const std::string& write_root,
                                  const SandboxPolicyOptions& options) {
    SandboxPolicy policy;
    policy.mode = mode;
    policy.network_access = options.network_access;
    if (mode == SandboxMode::WorkspaceWrite) {
        policy.writable_roots = compute_writable_roots(write_root, options);
#ifdef _WIN32
        policy.temporary_directory = temporary_write_root(write_root, options);
#endif
    }
    return policy;
}

std::string describe_policy(const SandboxPolicy& policy, bool network_enforced) {
    std::string out = sandbox_mode_name(policy.mode);
    if (policy.mode == SandboxMode::FullAccess) return out;
    if (policy.mode == SandboxMode::WorkspaceWrite) {
        out += "; writable: ";
        bool first = true;
        for (const auto& r : policy.writable_roots) {
            if (!first) out += ", ";
            first = false;
            out += r.root;
        }
        if (first) out += "(none)";
    } else {
        out += "; writable: (none)";
    }
    out += "; network: ";
    if (!network_enforced) out += "not enforced";
    else out += policy.network_access ? "allowed" : "blocked";
    return out;
}

} // namespace acecode::sandbox
