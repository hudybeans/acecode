#include <gtest/gtest.h>
#include "sandbox/sandbox_policy.hpp"
#include "test_support.hpp"
#include <algorithm>

using namespace acecode;
using namespace acecode::sandbox;
namespace fs = std::filesystem;

// 场景:配置根/临时根可选,只读策略不继承任何写授权。
TEST(SandboxPolicy, ComputesRootsAndProtectsMissingSensitivePaths) {
    test::TempTree tree;
    const auto workspace = tree.dir("workspace");
    tree.dir("workspace/.git");
    const auto extra = tree.dir("extra");
    SandboxPolicyOptions options;
    options.include_tmpdir = false;
    options.extra_writable_roots = {path_to_utf8(extra), "relative/path"};
    auto policy = make_sandbox_policy(SandboxMode::WorkspaceWrite, path_to_utf8(workspace), options);
    ASSERT_EQ(policy.writable_roots.size(), 2u);
    const auto& paths = policy.writable_roots[0].read_only_subpaths;
    for (const char* child : {".git/hooks", ".git/config", ".git/config.worktree", ".git/modules", ".acecode/rules"}) {
        EXPECT_NE(std::find(paths.begin(), paths.end(), path_to_utf8(fs::weakly_canonical(workspace / child))), paths.end()) << child;
    }
    EXPECT_TRUE(make_sandbox_policy(SandboxMode::ReadOnly, path_to_utf8(workspace), options).writable_roots.empty());
    options.include_tmpdir = true;
    options.tmpdir_override = path_to_utf8(tree.dir("tmp"));
    EXPECT_EQ(compute_writable_roots(path_to_utf8(workspace), options).size(), 3u);
}

// 场景:真正登记的 linked worktree 可写其 Git 数据;伪造指针不能任意扩大根。
TEST(SandboxPolicy, ValidatesLinkedWorktreeBackReferenceAndCommonDirectory) {
    test::TempTree tree;
    auto workspace = tree.dir("work");
    auto gitdir = tree.dir("main/.git/worktrees/work");
    tree.write(workspace / ".git", "gitdir: " + path_to_utf8(gitdir));
    tree.write(gitdir / "commondir", "../..");
    tree.write(gitdir / "gitdir", path_to_utf8(workspace / ".git"));
    auto linked = resolve_linked_git_dirs(path_to_utf8(workspace));
    EXPECT_EQ(linked.gitdir, path_to_utf8(gitdir));
    EXPECT_EQ(linked.common_dir, path_to_utf8(gitdir.parent_path().parent_path()));
    tree.write(gitdir / "commondir", path_to_utf8(tree.dir("outside")));
    EXPECT_TRUE(resolve_linked_git_dirs(path_to_utf8(workspace)).gitdir.empty());
    tree.write(gitdir / "commondir", "../..");
    tree.write(gitdir / "gitdir", path_to_utf8(tree.root / "unregistered/.git"));
    EXPECT_TRUE(resolve_linked_git_dirs(path_to_utf8(workspace)).gitdir.empty());
}

// 场景:用户把 `.git/hooks` 本身配成额外可写根。期望:它仍出现在自己的只读
// 子路径里 —— 受保护子路径不能靠再声明一个重叠的可写根解开。
TEST(SandboxPolicy, OverlappingRootCannotReenableProtectedSubdirectory) {
    test::TempTree tree;
    auto workspace = tree.dir("work");
    auto hooks = tree.dir("work/.git/hooks");
    SandboxPolicyOptions options;
    options.include_tmpdir = false;
    options.extra_writable_roots = {path_to_utf8(hooks)};
    auto roots = compute_writable_roots(path_to_utf8(workspace), options);
    ASSERT_EQ(roots.size(), 2u);
    EXPECT_NE(std::find(roots[1].read_only_subpaths.begin(), roots[1].read_only_subpaths.end(),
                        path_to_utf8(hooks)), roots[1].read_only_subpaths.end());
}
