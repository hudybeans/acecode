// 覆盖 src/tool/apply_patch_tool.cpp(openspec add-gpt-apply-patch-adaptation)的
// 端到端行为(真实临时目录)。场景编号:
//   T1  混合补丁(相对路径,按 ctx.cwd 解析):Add / Update / Delete 全部落盘,
//       输出 A/M/D 行,summary=Patched "3 files",每个 hunk 带 file,metadata.files
//   T2  单文件 Update:summary=Edited + 绝对路径;hunks 非空
//   T3  Move:源文件消失、目标文件带新内容,输出 "M new (from old)",metadata type=move
//   T4  校验先于落盘:第二段 old_lines 不存在 → 第一段的 Add 不落盘
//   T5  Add 目标已存在且非空 → 拒绝;空白文件 → 允许覆盖
//   T6  CRLF 文件 Update 后仍是 CRLF
//   T7  检查点回调按 Add / Update / Delete 的路径各调用一次(Delete 也要记,/rewind 才能恢复)
//   T8  缺 input → missing parameter;信封缺失 → verification failed;patchText 别名可用
//   T9  落盘后 MtimeTracker 有编辑基线(后续 file_edit 不会被「未读过」挡住)
//   T10 同一补丁两段 Update 同一文件:第二段基于第一段结果匹配
//   T11 全部路径在会话 scratch 目录 → exclude_from_turn_change_summary

#include <gtest/gtest.h>

#include "tool/apply_patch_tool.hpp"
#include "tool/mtime_tracker.hpp"
#include "tool/tool_executor.hpp"
#include "utils/utf8_path.hpp"

#include <nlohmann/json.hpp>

#include <atomic>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using acecode::ToolContext;
using acecode::ToolImpl;
using acecode::ToolResult;
using acecode::create_apply_patch_tool;

namespace {

fs::path fresh_dir() {
    static std::atomic<int> seq{0};
    auto dir = fs::temp_directory_path() /
               ("acecode_apply_patch_tool_" + std::to_string(++seq));
    fs::remove_all(dir);
    fs::create_directories(dir);
    return dir;
}

void write_file(const fs::path& path, const std::string& content) {
    fs::create_directories(path.parent_path());
    std::ofstream ofs(path, std::ios::binary);
    ofs << content;
}

std::string read_file(const fs::path& path) {
    std::ifstream ifs(path, std::ios::binary);
    return std::string((std::istreambuf_iterator<char>(ifs)),
                       std::istreambuf_iterator<char>());
}

ToolResult run_patch(const ToolContext& ctx, const std::string& patch,
                     const char* key = "input") {
    ToolImpl tool = create_apply_patch_tool();
    nlohmann::json args;
    args[key] = patch;
    return tool.execute(args.dump(), ctx);
}

std::string metric(const acecode::ToolSummary& s, const std::string& k) {
    for (const auto& kv : s.metrics) {
        if (kv.first == k) return kv.second;
    }
    return {};
}

std::string abs_utf8(const fs::path& p) {
    return acecode::path_to_utf8(p.lexically_normal());
}

} // namespace

// T1:一份补丁新建 new.txt、修改 src/a.txt、删除 old.txt,路径全部相对 cwd。
// 期望:三个文件状态正确;输出首行 "Success. Updated the following files:" 后跟
// "A new.txt" / "M src/a.txt" / "D old.txt";summary verb=Patched object="3 files",
// +/- 为总计(新建 2 行 + 修改新增 1 行 = 3,修改删 1 行 + 删除 1 行 = 2);
// 每个 hunk 的 file 是各自的绝对路径;metadata.files 三项 type 分别 add/update/delete。
TEST(ApplyPatchTool, AppliesMixedPatchWithRelativePaths) {
    const fs::path dir = fresh_dir();
    write_file(dir / "src" / "a.txt", "keep\nold line\nend\n");
    write_file(dir / "old.txt", "bye\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Add File: new.txt\n"
        "+hello\n"
        "+world\n"
        "*** Update File: src/a.txt\n"
        "@@\n"
        " keep\n"
        "-old line\n"
        "+new line\n"
        " end\n"
        "*** Delete File: old.txt\n"
        "*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;

    EXPECT_EQ(read_file(dir / "new.txt"), "hello\nworld\n");
    EXPECT_EQ(read_file(dir / "src" / "a.txt"), "keep\nnew line\nend\n");
    EXPECT_FALSE(fs::exists(dir / "old.txt"));

    EXPECT_NE(r.output.find("Success. Updated the following files:"), std::string::npos);
    EXPECT_NE(r.output.find("\nA new.txt"), std::string::npos);
    EXPECT_NE(r.output.find("\nM src/a.txt"), std::string::npos);
    EXPECT_NE(r.output.find("\nD old.txt"), std::string::npos);

    ASSERT_TRUE(r.summary.has_value());
    EXPECT_EQ(r.summary->verb, "Patched");
    EXPECT_EQ(r.summary->object, "3 files");
    EXPECT_EQ(metric(*r.summary, "+"), "3");
    EXPECT_EQ(metric(*r.summary, "-"), "2");

    ASSERT_TRUE(r.hunks.has_value());
    ASSERT_FALSE(r.hunks->empty());
    std::vector<std::string> hunk_files;
    for (const auto& hunk : *r.hunks) hunk_files.push_back(hunk.file);
    EXPECT_NE(std::find(hunk_files.begin(), hunk_files.end(), abs_utf8(dir / "new.txt")),
              hunk_files.end());
    EXPECT_NE(std::find(hunk_files.begin(), hunk_files.end(), abs_utf8(dir / "src" / "a.txt")),
              hunk_files.end());
    EXPECT_NE(std::find(hunk_files.begin(), hunk_files.end(), abs_utf8(dir / "old.txt")),
              hunk_files.end());

    ASSERT_TRUE(r.metadata.contains("files"));
    ASSERT_EQ(r.metadata["files"].size(), 3u);
    EXPECT_EQ(r.metadata["files"][0]["type"], "add");
    EXPECT_EQ(r.metadata["files"][1]["type"], "update");
    EXPECT_EQ(r.metadata["files"][2]["type"], "delete");
    EXPECT_EQ(r.metadata["files"][0]["additions"], 2);
    EXPECT_FALSE(r.metadata.value("exclude_from_turn_change_summary", false));

    fs::remove_all(dir);
}

// T2:只改一个文件(绝对路径)。
// 期望:summary verb=Edited、object=该文件绝对路径(与 file_edit 同款,Web 变更
// 面板按它归组);hunks 非空且 file 与 object 一致;输出的 M 行用模型写的原路径。
TEST(ApplyPatchTool, SingleFileUpdateSummaryMirrorsFileEdit) {
    const fs::path dir = fresh_dir();
    const fs::path target = dir / "one.txt";
    write_file(target, "alpha\nbeta\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Update File: " + abs_utf8(target) + "\n"
        "@@\n"
        "-beta\n"
        "+BETA\n"
        "*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    EXPECT_EQ(read_file(target), "alpha\nBETA\n");
    ASSERT_TRUE(r.summary.has_value());
    EXPECT_EQ(r.summary->verb, "Edited");
    EXPECT_EQ(r.summary->object, abs_utf8(target));
    EXPECT_EQ(metric(*r.summary, "+"), "1");
    EXPECT_EQ(metric(*r.summary, "-"), "1");
    ASSERT_TRUE(r.hunks.has_value());
    ASSERT_EQ(r.hunks->size(), 1u);
    EXPECT_EQ(r.hunks->front().file, abs_utf8(target));

    fs::remove_all(dir);
}

// T3:Update + Move to。
// 期望:源文件被删除,目标文件是应用补丁后的内容;输出行 "M dst.txt (from src.txt)";
// metadata type=move 且带 move_path / from_path;summary object 指向目标。
TEST(ApplyPatchTool, MoveWritesTargetAndRemovesSource) {
    const fs::path dir = fresh_dir();
    write_file(dir / "src.txt", "one\ntwo\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Update File: src.txt\n"
        "*** Move to: nested/dst.txt\n"
        "@@\n"
        "-two\n"
        "+TWO\n"
        "*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    EXPECT_FALSE(fs::exists(dir / "src.txt"));
    EXPECT_EQ(read_file(dir / "nested" / "dst.txt"), "one\nTWO\n");
    EXPECT_NE(r.output.find("(from src.txt)"), std::string::npos) << r.output;
    ASSERT_TRUE(r.summary.has_value());
    EXPECT_EQ(r.summary->verb, "Edited");
    EXPECT_EQ(r.summary->object, abs_utf8(dir / "nested" / "dst.txt"));
    ASSERT_EQ(r.metadata["files"].size(), 1u);
    EXPECT_EQ(r.metadata["files"][0]["type"], "move");
    EXPECT_EQ(r.metadata["files"][0]["from_path"], abs_utf8(dir / "src.txt"));

    fs::remove_all(dir);
}

// T4:第一段是合法 Add,第二段 Update 的 old_lines 在文件里不存在。
// 期望:整份补丁失败,错误文案带 "apply_patch verification failed" 与
// "Failed to find expected lines",且第一段的 new.txt **没有**被创建。
// 回归:逐段边校验边落盘的实现会留下半份补丁。
TEST(ApplyPatchTool, VerificationFailureWritesNothing) {
    const fs::path dir = fresh_dir();
    write_file(dir / "a.txt", "real content\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Add File: new.txt\n"
        "+hello\n"
        "*** Update File: a.txt\n"
        "@@\n"
        "-does not exist\n"
        "+whatever\n"
        "*** End Patch\n");
    EXPECT_FALSE(r.success);
    EXPECT_NE(r.output.find("apply_patch verification failed"), std::string::npos) << r.output;
    EXPECT_NE(r.output.find("Failed to find expected lines in a.txt"), std::string::npos) << r.output;
    EXPECT_FALSE(fs::exists(dir / "new.txt"));
    EXPECT_EQ(read_file(dir / "a.txt"), "real content\n");

    fs::remove_all(dir);
}

// T5:Add 目标已存在。
// 期望:非空文件 → 拒绝并提示改用 Update / 先 Delete,文件内容不动;只含空白
// 的文件 → 允许覆盖(与 file_edit 空 old_string 的语义一致)。
TEST(ApplyPatchTool, AddRefusesNonEmptyExistingFileButFillsBlankOne) {
    const fs::path dir = fresh_dir();
    write_file(dir / "full.txt", "data\n");
    write_file(dir / "blank.txt", "\n\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult refused = run_patch(ctx,
        "*** Begin Patch\n*** Add File: full.txt\n+x\n*** End Patch\n");
    EXPECT_FALSE(refused.success);
    EXPECT_NE(refused.output.find("already exists and is not empty"), std::string::npos)
        << refused.output;
    EXPECT_NE(refused.output.find("*** Update File: full.txt"), std::string::npos);
    EXPECT_EQ(read_file(dir / "full.txt"), "data\n");

    const ToolResult filled = run_patch(ctx,
        "*** Begin Patch\n*** Add File: blank.txt\n+x\n*** End Patch\n");
    ASSERT_TRUE(filled.success) << filled.output;
    EXPECT_EQ(read_file(dir / "blank.txt"), "x\n");

    fs::remove_all(dir);
}

// T6:CRLF 文件。
// 期望:补丁按 LF 书写也能命中(文件工具内部统一 LF),写回后仍是 CRLF,
// 没有混入 LF。
TEST(ApplyPatchTool, PreservesCrlfLineEndings) {
    const fs::path dir = fresh_dir();
    write_file(dir / "win.txt", "one\r\ntwo\r\nthree\r\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n*** Update File: win.txt\n@@\n one\n-two\n+TWO\n three\n*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    EXPECT_EQ(read_file(dir / "win.txt"), "one\r\nTWO\r\nthree\r\n");

    fs::remove_all(dir);
}

// T7:检查点回调。
// 期望:track_file_write_before 对 Add 目标、Update 目标、Delete 目标各调用一次
// (Delete 也要记,否则 /rewind 无法恢复被删文件);Move 场景对源与目标都调用。
TEST(ApplyPatchTool, CheckpointHookCoversEveryTouchedPath) {
    const fs::path dir = fresh_dir();
    write_file(dir / "u.txt", "x\n");
    write_file(dir / "d.txt", "y\n");
    write_file(dir / "m.txt", "z\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);
    std::vector<std::string> tracked;
    ctx.track_file_write_before = [&](const std::string& path) { tracked.push_back(path); };

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Add File: a.txt\n+new\n"
        "*** Update File: u.txt\n@@\n-x\n+X\n"
        "*** Delete File: d.txt\n"
        "*** Update File: m.txt\n*** Move to: moved.txt\n@@\n-z\n+Z\n"
        "*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;

    auto seen = [&](const fs::path& p) {
        return std::find(tracked.begin(), tracked.end(), abs_utf8(p)) != tracked.end();
    };
    EXPECT_TRUE(seen(dir / "a.txt"));
    EXPECT_TRUE(seen(dir / "u.txt"));
    EXPECT_TRUE(seen(dir / "d.txt"));
    EXPECT_TRUE(seen(dir / "m.txt"));
    EXPECT_TRUE(seen(dir / "moved.txt"));

    fs::remove_all(dir);
}

// T8:参数与格式错误。
// 期望:没有 input(也没有别名)→ "Required parameter missing: input";信封缺失 →
// "apply_patch verification failed";用 patchText 别名传补丁一样能执行。
TEST(ApplyPatchTool, ArgumentAndFormatErrors) {
    const fs::path dir = fresh_dir();
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    ToolImpl tool = create_apply_patch_tool();
    const ToolResult missing = tool.execute("{}", ctx);
    EXPECT_FALSE(missing.success);
    EXPECT_NE(missing.output.find("Required parameter missing: input"), std::string::npos);

    const ToolResult broken = run_patch(ctx, "*** Add File: a.txt\n+x\n");
    EXPECT_FALSE(broken.success);
    EXPECT_NE(broken.output.find("apply_patch verification failed"), std::string::npos);
    EXPECT_FALSE(fs::exists(dir / "a.txt"));

    const ToolResult alias = run_patch(ctx,
        "*** Begin Patch\n*** Add File: alias.txt\n+ok\n*** End Patch\n", "patchText");
    ASSERT_TRUE(alias.success) << alias.output;
    EXPECT_EQ(read_file(dir / "alias.txt"), "ok\n");

    fs::remove_all(dir);
}

// T9:落盘后的编辑基线。
// 期望:MtimeTracker::validate_read_baseline_for_edit 对新内容返回 Ok —— 模型
// 接着用 file_edit 改同一个文件时不会被「File has not been read yet」挡住。
TEST(ApplyPatchTool, RecordsWriteBaselineForFollowUpEdits) {
    const fs::path dir = fresh_dir();
    const fs::path target = dir / "b.txt";
    write_file(target, "v1\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n*** Update File: b.txt\n@@\n-v1\n+v2\n*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    const auto check = acecode::MtimeTracker::instance().validate_read_baseline_for_edit(
        abs_utf8(target), "v2\n");
    EXPECT_EQ(check.status, acecode::MtimeTracker::ReadBaselineStatus::Ok);

    fs::remove_all(dir);
}

// T10:同一补丁里两段 Update 同一个文件(GPT 模型常见输出)。
// 期望:第二段基于第一段的结果匹配并成功;最终内容两段都生效。
// 回归:逐段按磁盘内容校验时第二段永远找不到第一段改出来的行。
TEST(ApplyPatchTool, SecondUpdateOfSameFileSeesFirstUpdate) {
    const fs::path dir = fresh_dir();
    write_file(dir / "c.txt", "a\nb\n");
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n"
        "*** Update File: c.txt\n@@\n-a\n+A\n"
        "*** Update File: c.txt\n@@\n A\n-b\n+B\n"
        "*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    EXPECT_EQ(read_file(dir / "c.txt"), "A\nB\n");

    fs::remove_all(dir);
}

// T11:补丁只碰会话 scratch 目录(.acecode/tmp/session-x)下的文件。
// 期望:metadata.exclude_from_turn_change_summary=true,与 file_write 写 scratch
// 的语义一致(不进本轮"修改文件"摘要)。
TEST(ApplyPatchTool, ScratchOnlyPatchIsExcludedFromTurnSummary) {
    const fs::path dir = fresh_dir();
    const fs::path scratch = dir / ".acecode" / "tmp" / "session-test";
    fs::create_directories(scratch);
    ToolContext ctx;
    ctx.cwd = abs_utf8(dir);
    ctx.scratch_dir = abs_utf8(scratch);

    const ToolResult r = run_patch(ctx,
        "*** Begin Patch\n*** Add File: .acecode/tmp/session-test/helper.py\n+print(1)\n*** End Patch\n");
    ASSERT_TRUE(r.success) << r.output;
    EXPECT_TRUE(r.metadata.value("exclude_from_turn_change_summary", false));

    fs::remove_all(dir);
}
