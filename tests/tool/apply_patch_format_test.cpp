// 覆盖 src/tool/apply_patch_format.{hpp,cpp}(openspec add-gpt-apply-patch-adaptation)
// 的纯逻辑:Codex 补丁语言解析与 Update 内容推导。场景编号:
//   P1  混合补丁(Add / Update+Move / Delete)解析出三个 hunk
//   P2  CRLF + heredoc 包裹 / markdown 围栏包裹都能解析
//   P3  缺信封 / 未知行前缀 / 无变更的 Update 段 → 带位置的错误
//   P4  空信封 = success 且零 hunk;Add 段空行 = 空内容行;EOF 标记;首 chunk 省略 @@
//   D1  精确替换、锚点 seek、锚点找不到、old_lines 找不到的错误文案
//   D2  四级容错:去尾空白 / 去两端空白 / Unicode 标点归一
//   D3  EOF 锚定优先从末尾对齐;纯新增追加到末尾;多 chunk 倒序应用;尾部空行重试
//   D4  结尾换行:原文有则有、原文空则加、原文无则不加
//   A1  参数取值优先级 input > patchText > patch
//   A2  header 摘要与 extract_target_paths(相对路径按 cwd 解析、Move 目标、去重)

#include <gtest/gtest.h>

#include "tool/apply_patch_format.hpp"
#include "utils/utf8_path.hpp"

#include <nlohmann/json.hpp>

#include <filesystem>
#include <string>
#include <vector>

using namespace acecode::apply_patch;

namespace {

const char* kMixedPatch =
    "*** Begin Patch\n"
    "*** Add File: hello.txt\n"
    "+Hello world\n"
    "+second line\n"
    "*** Update File: src/app.py\n"
    "*** Move to: src/main.py\n"
    "@@ def greet():\n"
    " context\n"
    "-    print(\"Hi\")\n"
    "+    print(\"Hello, world!\")\n"
    "*** Delete File: obsolete.txt\n"
    "*** End Patch\n";

std::vector<std::string> lines(std::initializer_list<const char*> items) {
    return std::vector<std::string>(items.begin(), items.end());
}

UpdateChunk chunk(std::vector<std::string> old_lines,
                  std::vector<std::string> new_lines,
                  std::string context = {},
                  bool eof = false) {
    UpdateChunk c;
    c.old_lines = std::move(old_lines);
    c.new_lines = std::move(new_lines);
    c.change_context = std::move(context);
    c.is_end_of_file = eof;
    return c;
}

} // namespace

// P1:一份补丁依次 Add / Update(带 Move)/ Delete。
// 期望:三个 hunk 按出现顺序,类型与路径一一对应;Add 内容每行以换行结尾;
// Update 的 chunk 带锚点 "def greet():",old_lines = [context, print Hi],
// new_lines = [context, print Hello]。
TEST(ApplyPatchFormat, ParsesMixedOperationsInOrder) {
    const auto result = parse_patch(kMixedPatch);
    ASSERT_TRUE(result.success) << result.error;
    ASSERT_EQ(result.patch.hunks.size(), 3u);

    const auto& add = result.patch.hunks[0];
    EXPECT_EQ(add.kind, HunkKind::Add);
    EXPECT_EQ(add.path, "hello.txt");
    EXPECT_EQ(add.contents, "Hello world\nsecond line\n");

    const auto& update = result.patch.hunks[1];
    EXPECT_EQ(update.kind, HunkKind::Update);
    EXPECT_EQ(update.path, "src/app.py");
    EXPECT_EQ(update.move_path, "src/main.py");
    ASSERT_EQ(update.chunks.size(), 1u);
    EXPECT_EQ(update.chunks[0].change_context, "def greet():");
    EXPECT_EQ(update.chunks[0].old_lines, lines({"context", "    print(\"Hi\")"}));
    EXPECT_EQ(update.chunks[0].new_lines, lines({"context", "    print(\"Hello, world!\")"}));
    EXPECT_FALSE(update.chunks[0].is_end_of_file);

    const auto& del = result.patch.hunks[2];
    EXPECT_EQ(del.kind, HunkKind::Delete);
    EXPECT_EQ(del.path, "obsolete.txt");
}

// P2:模型把 Codex 的 shell 调用形态原样塞进参数(heredoc 包裹)且用 CRLF;
// 或者外面套了 markdown 代码围栏。
// 期望:两种包裹都被剥掉,解析结果与裸补丁一致。
TEST(ApplyPatchFormat, AcceptsHeredocAndCodeFenceWrappers) {
    const std::string heredoc =
        "apply_patch <<'EOF'\r\n"
        "*** Begin Patch\r\n"
        "*** Add File: a.txt\r\n"
        "+one\r\n"
        "*** End Patch\r\n"
        "EOF\r\n";
    const auto wrapped = parse_patch(heredoc);
    ASSERT_TRUE(wrapped.success) << wrapped.error;
    ASSERT_EQ(wrapped.patch.hunks.size(), 1u);
    EXPECT_EQ(wrapped.patch.hunks[0].contents, "one\n");

    const std::string fenced =
        "```\n*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch\n```\n";
    const auto fence = parse_patch(fenced);
    ASSERT_TRUE(fence.success) << fence.error;
    ASSERT_EQ(fence.patch.hunks.size(), 1u);
    EXPECT_EQ(fence.patch.hunks[0].kind, HunkKind::Delete);
}

// P3:三种格式错误。
// 期望:缺 Begin 标记 → 错误提到 '*** Begin Patch';Update 段里出现既不以
// 空格 / - / + / @@ / *** 开头也非空的行 → 错误带行号且引用那一行(模型能定位);
// Update 段只有锚点没有变更行 → 报 "no change lines"。
TEST(ApplyPatchFormat, ReportsPositionedErrors) {
    const auto missing = parse_patch("*** Add File: a.txt\n+x\n*** End Patch\n");
    EXPECT_FALSE(missing.success);
    EXPECT_NE(missing.error.find("*** Begin Patch"), std::string::npos);

    const auto unknown = parse_patch(
        "*** Begin Patch\n"
        "*** Update File: a.txt\n"
        "@@\n"
        "-old\n"
        "bogus line without prefix\n"
        "*** End Patch\n");
    EXPECT_FALSE(unknown.success);
    EXPECT_NE(unknown.error.find("line 5"), std::string::npos) << unknown.error;
    EXPECT_NE(unknown.error.find("bogus line without prefix"), std::string::npos);

    const auto no_change = parse_patch(
        "*** Begin Patch\n*** Update File: a.txt\n@@ anchor\n*** End Patch\n");
    EXPECT_FALSE(no_change.success);
    EXPECT_NE(no_change.error.find("no change lines"), std::string::npos);
}

// P4:边界形态。
// 期望:只有信封 → success 且 hunks 为空(由工具层报 empty patch);Add 段里
// 没带 `+` 的空行是段落分隔符,忽略(opencode 同款;带 `+` 的空行才是空内容行);
// Update 段 header 与首个 @@ 之间的空行不会开出只含空上下文的 chunk,段尾的
// 空行 chunk 也被丢掉(否则会去文件里找一行空行,找不到整份补丁失败);
// `*** End of File` 置位 EOF;第一个 chunk 允许省略 @@(隐式空锚点)。
TEST(ApplyPatchFormat, EnvelopeOnlyBlankLinesEofAndImplicitChunk) {
    const auto empty = parse_patch("*** Begin Patch\n*** End Patch\n");
    ASSERT_TRUE(empty.success) << empty.error;
    EXPECT_TRUE(empty.patch.hunks.empty());

    const auto blank = parse_patch(
        "*** Begin Patch\n*** Add File: a.txt\n+first\n\n+\n+third\n*** End Patch\n");
    ASSERT_TRUE(blank.success) << blank.error;
    EXPECT_EQ(blank.patch.hunks[0].contents, "first\n\nthird\n");

    const auto separators = parse_patch(
        "*** Begin Patch\n*** Update File: u.txt\n\n@@ ctx\n-a\n+b\n\n\n*** Delete File: d.txt\n*** End Patch\n");
    ASSERT_TRUE(separators.success) << separators.error;
    ASSERT_EQ(separators.patch.hunks.size(), 2u);
    ASSERT_EQ(separators.patch.hunks[0].chunks.size(), 1u);
    EXPECT_EQ(separators.patch.hunks[0].chunks[0].change_context, "ctx");
    EXPECT_EQ(separators.patch.hunks[0].chunks[0].old_lines, lines({"a", "", ""}));

    const auto eof = parse_patch(
        "*** Begin Patch\n*** Update File: a.txt\n-tail\n+new tail\n*** End of File\n*** End Patch\n");
    ASSERT_TRUE(eof.success) << eof.error;
    ASSERT_EQ(eof.patch.hunks[0].chunks.size(), 1u);
    EXPECT_TRUE(eof.patch.hunks[0].chunks[0].change_context.empty());
    EXPECT_TRUE(eof.patch.hunks[0].chunks[0].is_end_of_file);
    EXPECT_EQ(eof.patch.hunks[0].chunks[0].old_lines, lines({"tail"}));
}

// D1:精确匹配与锚点。
// 期望:old_lines 精确命中时替换;带锚点时先找锚点行,再从其后匹配(锚点前的
// 同名行不算);锚点找不到 → "Failed to find context 'X' in <path>";old_lines
// 找不到 → "Failed to find expected lines in <path>:" 后附原文本。
TEST(ApplyPatchFormat, DerivesContentsWithExactMatchAndAnchors) {
    const std::string original = "a\nb\nc\nb\nd\n";
    const auto exact = derive_new_contents("f.txt", {chunk({"c"}, {"C"})}, original);
    ASSERT_TRUE(exact.success) << exact.error;
    EXPECT_EQ(exact.content, "a\nb\nC\nb\nd\n");

    // 锚点 "c" 之后的第一个 "b"(第 4 行)被替换,第 2 行不动。
    const auto anchored = derive_new_contents("f.txt", {chunk({"b"}, {"B"}, "c")}, original);
    ASSERT_TRUE(anchored.success) << anchored.error;
    EXPECT_EQ(anchored.content, "a\nb\nc\nB\nd\n");

    const auto no_anchor = derive_new_contents("f.txt", {chunk({"b"}, {"B"}, "zzz")}, original);
    EXPECT_FALSE(no_anchor.success);
    EXPECT_EQ(no_anchor.error, "Failed to find context 'zzz' in f.txt");

    const auto missing = derive_new_contents("f.txt", {chunk({"x", "y"}, {"z"})}, original);
    EXPECT_FALSE(missing.success);
    EXPECT_EQ(missing.error, "Failed to find expected lines in f.txt:\nx\ny");
}

// D2:四级容错。
// 期望:补丁行多了尾部空格 → 第二级(去尾空白)命中;缩进不同 → 第三级(去两端
// 空白)命中;文件里是弯引号而补丁是 ASCII 引号 → 第四级(Unicode 归一)命中。
// 替换写入的是补丁给的新行,不是文件里的旧形态。
TEST(ApplyPatchFormat, FuzzyMatchingPasses) {
    const auto rstrip = derive_new_contents("f.txt", {chunk({"line  "}, {"LINE"})}, "line\n");
    ASSERT_TRUE(rstrip.success) << rstrip.error;
    EXPECT_EQ(rstrip.content, "LINE\n");

    const auto trim = derive_new_contents("f.txt", {chunk({"line"}, {"LINE"})}, "    line\n");
    ASSERT_TRUE(trim.success) << trim.error;
    EXPECT_EQ(trim.content, "LINE\n");

    const std::string curly = u8"say(“Hi”)\n";
    const auto unicode = derive_new_contents("f.txt", {chunk({"say(\"Hi\")"}, {"say(\"Bye\")"})}, curly);
    ASSERT_TRUE(unicode.success) << unicode.error;
    EXPECT_EQ(unicode.content, "say(\"Bye\")\n");

    EXPECT_EQ(normalize_unicode_punctuation(u8"‘a’ “b” c—d e…f g h"),
              "'a' \"b\" c-d e...f g h");
}

// D3:EOF 锚定、纯新增、多 chunk、尾部空行重试。
// 期望:is_end_of_file 时从文件末尾对齐,所以同样的 old_lines 命中末尾那个
// "x" 而不是开头那个;old_lines 为空的 chunk 追加到文件末尾(上游行为);
// 两个 chunk 各自命中后倒序应用互不干扰;old_lines 尾部多一个空行找不到时
// 去掉空行重试成功。
TEST(ApplyPatchFormat, EofAnchorInsertionMultiChunkAndTrailingBlankRetry) {
    const auto eof = derive_new_contents("f.txt", {chunk({"x"}, {"X"}, {}, true)}, "x\ny\nx\n");
    ASSERT_TRUE(eof.success) << eof.error;
    EXPECT_EQ(eof.content, "x\ny\nX\n");

    const auto append = derive_new_contents("f.txt", {chunk({}, {"tail"})}, "a\nb\n");
    ASSERT_TRUE(append.success) << append.error;
    EXPECT_EQ(append.content, "a\nb\ntail\n");

    const auto multi = derive_new_contents(
        "f.txt", {chunk({"a"}, {"A"}), chunk({"c"}, {"C1", "C2"})}, "a\nb\nc\nd\n");
    ASSERT_TRUE(multi.success) << multi.error;
    EXPECT_EQ(multi.content, "A\nb\nC1\nC2\nd\n");

    const auto retry = derive_new_contents("f.txt", {chunk({"b", ""}, {"B", ""})}, "a\nb\n");
    ASSERT_TRUE(retry.success) << retry.error;
    EXPECT_EQ(retry.content, "a\nB\n");
}

// D4:结尾换行策略(偏离上游"总是补一个"的地方)。
// 期望:原文以换行结尾 → 结果也以换行结尾;原文为空 → 结果补换行;原文无
// 尾换行 → 结果也不加,避免产生无意义的 diff 行。
TEST(ApplyPatchFormat, PreservesTrailingNewlineState) {
    const auto with = derive_new_contents("f.txt", {chunk({"a"}, {"b"})}, "a\n");
    ASSERT_TRUE(with.success);
    EXPECT_EQ(with.content, "b\n");

    const auto without = derive_new_contents("f.txt", {chunk({"a"}, {"b"})}, "a");
    ASSERT_TRUE(without.success);
    EXPECT_EQ(without.content, "b");

    const auto empty = derive_new_contents("f.txt", {chunk({}, {"new"})}, "");
    ASSERT_TRUE(empty.success);
    EXPECT_EQ(empty.content, "new\n");
}

// A1:参数取值。
// 期望:input 优先;缺 input 时接受 patchText / patch 别名(opencode / Codex
// 的两种叫法);非字符串或 JSON 解析失败 → 空串。
TEST(ApplyPatchFormat, PatchTextFromArgumentsPrefersInputThenAliases) {
    EXPECT_EQ(patch_text_from_arguments(R"({"input":"A","patchText":"B"})"), "A");
    EXPECT_EQ(patch_text_from_arguments(R"({"patchText":"B"})"), "B");
    EXPECT_EQ(patch_text_from_arguments(R"({"patch":"C"})"), "C");
    EXPECT_EQ(patch_text_from_arguments(R"({"input":42})"), "");
    EXPECT_EQ(patch_text_from_arguments("not json"), "");
}

// A2:header 摘要与目标路径提取。
// 期望:summarize 只看 header 行(正文里的 "+*** Add File" 不算,Move 挂到前一个
// Update 上);extract_target_paths 把相对路径按 cwd 解析、绝对路径照收、包含
// Move 目标、按出现顺序去重。
TEST(ApplyPatchFormat, SummarizesHeadersAndExtractsTargetPaths) {
    const auto headers = summarize_patch_headers(kMixedPatch);
    ASSERT_EQ(headers.size(), 3u);
    EXPECT_EQ(headers[0].kind, HunkKind::Add);
    EXPECT_EQ(headers[0].path, "hello.txt");
    EXPECT_EQ(headers[1].kind, HunkKind::Update);
    EXPECT_EQ(headers[1].move_path, "src/main.py");
    EXPECT_EQ(headers[2].kind, HunkKind::Delete);

    const std::filesystem::path cwd = std::filesystem::temp_directory_path() / "acecode_patch_cwd";
    const std::string cwd_utf8 = acecode::path_to_utf8(cwd);
    const std::filesystem::path absolute = std::filesystem::temp_directory_path() / "elsewhere.txt";
    const std::string patch =
        "*** Begin Patch\n"
        "*** Update File: src/a.txt\n"
        "*** Move to: src/b.txt\n"
        "-x\n"
        "+y\n"
        "*** Delete File: " + acecode::path_to_utf8(absolute) + "\n"
        "*** Update File: src/a.txt\n"
        "-y\n"
        "+z\n"
        "*** End Patch\n";
    const nlohmann::json args = {{"input", patch}};
    const auto paths = extract_target_paths(args.dump(), cwd_utf8);
    ASSERT_EQ(paths.size(), 3u);
    EXPECT_EQ(paths[0], acecode::path_to_utf8((cwd / "src" / "a.txt").lexically_normal()));
    EXPECT_EQ(paths[1], acecode::path_to_utf8((cwd / "src" / "b.txt").lexically_normal()));
    EXPECT_EQ(paths[2], acecode::path_to_utf8(absolute.lexically_normal()));

    // 解析失败(缺信封)→ 空集合;工具随后会以同一解析器失败,不会落盘。
    const nlohmann::json broken = {{"input", "*** Update File: a\n-x\n+y\n"}};
    EXPECT_TRUE(extract_target_paths(broken.dump(), cwd_utf8).empty());
}
