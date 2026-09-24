#include <gtest/gtest.h>
#include "session/composer_content.hpp"
#include "session/session_serializer.hpp"

using nlohmann::json;

TEST(ComposerContent, OrderedReferencesRoundTripWithoutEditorOrUntrustedFields) {
    const auto input = json::parse(R"({"version":1,"editor":"slate","parts":[
        {"type":"text","text":"Use "},
        {"type":"skill","name":"review","token":"$review"},
        {"type":"text","text":" on "},
        {"type":"attachment","key":"local-1","id":"att_1","name":"a.pdf","kind":"file","blob_url":"https://untrusted.test"},
        {"type":"text","text":" and "},
        {"type":"path","path":"src/main.cpp","token":"@src/main.cpp","directory":false}
    ]})");
    auto result = acecode::normalize_composer_content(input);
    ASSERT_TRUE(result.ok) << result.error;
    EXPECT_EQ(result.text, "Use $review on  and @src/main.cpp");
    EXPECT_EQ(result.content["parts"].size(), 6u);
    EXPECT_FALSE(result.content.contains("editor"));
    EXPECT_FALSE(result.content["parts"][3].contains("blob_url"));
    acecode::ChatMessage message;
    message.role = "user";
    message.content = result.text;
    message.metadata["composer_content"] = result.content;
    const auto restored = acecode::deserialize_message(acecode::serialize_message(message));
    EXPECT_EQ(restored.metadata["composer_content"], result.content);
}

TEST(ComposerContent, RejectsMalformedUnknownAndOversizedStructures) {
    for (const auto& value : {
             json{}, json::array(), json{{"version", 2}, {"parts", json::array()}},
             json{{"version", 1}, {"parts", json::array({json{{"type", "html"}, {"html", "x"}}})}},
             json{{"version", 1}, {"parts", json::array({json{{"type", "text"}, {"text", 7}}})}},
             json{{"version", 1}, {"parts", json::array({json{{"type", "path"}, {"path", "x"}}})}}}) {
        EXPECT_FALSE(acecode::normalize_composer_content(value).ok) << value.dump();
    }
    json too_many = {{"version", 1}, {"parts", json::array()}};
    for (int i = 0; i < 4097; ++i) too_many["parts"].push_back({{"type", "text"}, {"text", ""}});
    EXPECT_FALSE(acecode::normalize_composer_content(too_many).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(json{
        {"version", 1}, {"parts", json::array({json{{"type", "text"}, {"text", std::string(2 * 1024 * 1024 + 1, 'x')}}})}}).ok);
}

TEST(ComposerContent, AttachmentIdentityRequiresVerifiedSubmissionAndHydratesTrustedMetadata) {
    auto result = acecode::normalize_composer_content(json::parse(R"({"version":1,"parts":[
        {"type":"text","text":"before"},
        {"type":"attachment","key":"local-1","id":"att_1","name":"fake","kind":"image","path":"C:/forged"},
        {"type":"text","text":"after"}
    ]})"));
    ASSERT_TRUE(result.ok);
    std::string error;
    EXPECT_FALSE(acecode::resolve_composer_content_attachments(result.content, json::array(), error));
    EXPECT_NE(error.find("submitted attachment"), std::string::npos);
    ASSERT_TRUE(acecode::resolve_composer_content_attachments(result.content, json::array({json{
        {"id", "att_1"}, {"name", "report.pdf"}, {"kind", "file"}, {"mime_type", "application/pdf"},
        {"path", "C:/snapshot"}, {"metadata", {{"source_path", "C:/report.pdf"}}}
    }}), error));
    EXPECT_EQ(result.content["parts"][1]["key"], "local-1");
    EXPECT_EQ(result.content["parts"][1]["name"], "report.pdf");
    EXPECT_EQ(result.content["parts"][1]["kind"], "file");
    EXPECT_EQ(result.content["parts"][1]["path"], "C:/report.pdf");
    EXPECT_EQ(result.content["parts"][2]["text"], "after");
}

TEST(ComposerContent, DraftPlaceholderIsValidButCannotBeSubmitted) {
    auto result = acecode::normalize_composer_content(json::parse(R"({"version":1,"parts":[
        {"type":"attachment","key":"local-1","name":"a.pdf","kind":"file"}
    ]})"));
    ASSERT_TRUE(result.ok);
    std::string error;
    EXPECT_FALSE(acecode::resolve_composer_content_attachments(result.content, json::array(), error));
}

namespace {

json pasted_content(const json& parts) {
    return json{{"version", 1}, {"parts", parts}};
}

json text_part(const std::string& text) {
    return json{{"type", "text"}, {"text", text}};
}

json pasted_part(const std::string& text, const std::string& key = "paste-1") {
    return json{{"type", "pasted_text"}, {"key", key}, {"text", text}};
}

} // namespace

// 触发场景:用户在输入框写「分析下面日志」,再粘贴一段长日志(内联粘贴块)。
// 期望:编辑器文本(text)不含粘贴块,草稿回填 / 输入历史只看到手打的内容;
// 提交正文(submission_text)= 编辑器文本 + "\n\n" + 粘贴原文;key 原样保留。
TEST(ComposerContent, PastedTextStaysOutOfEditorTextButJoinsSubmissionWithBlankLine) {
    const auto result = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("分析下面日志"), pasted_part("L1\nL2", "paste-key")})));
    ASSERT_TRUE(result.ok) << result.error;
    EXPECT_EQ(result.text, "分析下面日志");
    EXPECT_EQ(result.submission_text, "分析下面日志\n\nL1\nL2");
    EXPECT_FALSE(result.leads_with_pasted_text);
    ASSERT_EQ(result.content["parts"].size(), 2u);
    EXPECT_EQ(result.content["parts"][1]["type"], "pasted_text");
    EXPECT_EQ(result.content["parts"][1]["key"], "paste-key");
    EXPECT_EQ(result.content["parts"][1]["text"], "L1\nL2");
}

// 触发场景:粘贴块夹在文字两侧,或者只有一个粘贴块。
// 期望:块与相邻的非空片段之间都插 "\n\n";单个块就是原文,不多出分隔符。
// 这三组样例与前端 composerContent.test.js 的 composerContentSubmissionText
// 用例逐字节一致 —— 两端各实现一次分隔规则,靠同一组样例防止漂移。
TEST(ComposerContent, PastedTextSeparatorAppliesOnBothSides) {
    const auto both = acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part("A", "k1"), text_part("B"), pasted_part("C", "k2")})));
    ASSERT_TRUE(both.ok) << both.error;
    EXPECT_EQ(both.submission_text, "A\n\nB\n\nC");
    EXPECT_EQ(both.text, "B");

    const auto single = acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part("A")})));
    ASSERT_TRUE(single.ok) << single.error;
    EXPECT_EQ(single.submission_text, "A");
    EXPECT_EQ(single.text, "");

    // 相邻的普通片段(文字 + skill token)之间不插分隔符,保持旧行为。
    const auto plain = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("Use "), json{{"type", "skill"}, {"name", "review"}, {"token", "$review"}},
        text_part(""), pasted_part("X")})));
    ASSERT_TRUE(plain.ok) << plain.error;
    EXPECT_EQ(plain.submission_text, "Use $review\n\nX");
}

// 触发场景:编辑器为空(或只有空 text 部件),消息只由粘贴块打头。
// 期望:leads_with_pasted_text 为 true,路由据此跳过 skill / opencode 展开;
// 前面有非空文字时为 false。
TEST(ComposerContent, LeadingPastedTextIsFlagged) {
    const auto leading = acecode::normalize_composer_content(pasted_content(json::array({
        text_part(""), pasted_part("/review 这是粘贴的日志")})));
    ASSERT_TRUE(leading.ok) << leading.error;
    EXPECT_TRUE(leading.leads_with_pasted_text);
    EXPECT_EQ(leading.submission_text, "/review 这是粘贴的日志");

    const auto typed = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("/review"), pasted_part("log")})));
    ASSERT_TRUE(typed.ok) << typed.error;
    EXPECT_FALSE(typed.leads_with_pasted_text);

    const auto none = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("hello")})));
    ASSERT_TRUE(none.ok) << none.error;
    EXPECT_FALSE(none.leads_with_pasted_text);
    EXPECT_EQ(none.submission_text, "hello");
}

// 触发场景:客户端送来畸形粘贴块 —— text 不是字符串、含 NUL、或是空串。
// 期望:前两种整份拒绝(400);空串块被丢弃,不产生部件也不产生分隔符。
TEST(ComposerContent, PastedTextRejectsNulNonStringAndDropsEmpty) {
    EXPECT_FALSE(acecode::normalize_composer_content(pasted_content(json::array({
        json{{"type", "pasted_text"}, {"key", "k"}, {"text", 42}}}))).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(pasted_content(json::array({
        json{{"type", "pasted_text"}, {"key", "k"}}}))).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part(std::string("a\0b", 3))}))).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(pasted_content(json::array({
        json{{"type", "pasted_text"}, {"key", std::string(257, 'k')}, {"text", "x"}}}))).ok);

    const auto dropped = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("typed"), pasted_part("")})));
    ASSERT_TRUE(dropped.ok) << dropped.error;
    EXPECT_EQ(dropped.content["parts"].size(), 1u);
    EXPECT_EQ(dropped.submission_text, "typed");
}

// 触发场景:带粘贴块的消息写入会话 JSONL 再读回(resume / GET messages)。
// 期望:metadata.composer_content 往返后逐字段相等,粘贴块不丢不改写。
TEST(ComposerContent, PastedTextRoundTripsThroughSerializer) {
    const auto result = acecode::normalize_composer_content(pasted_content(json::array({
        text_part("看这个"), pasted_part("line 1\nline 2\n")})));
    ASSERT_TRUE(result.ok) << result.error;
    acecode::ChatMessage message;
    message.role = "user";
    message.content = result.submission_text;
    message.metadata["composer_content"] = result.content;
    const auto restored = acecode::deserialize_message(acecode::serialize_message(message));
    EXPECT_EQ(restored.metadata["composer_content"], result.content);
    EXPECT_EQ(restored.content, "看这个\n\nline 1\nline 2\n");
}

// 触发场景:内联粘贴块很大。前端保证内联块合计 ≤ 256 KiB(更大的改为文件块),
// 服务端的 2 MiB 统一预算只是兜底。
// 期望:200 KiB 的块通过;3 MiB 的块(超过预算)整份拒绝;两个 1.1 MiB 的块
// 单个都没超,但合计超过预算,同样拒绝(预算是整份共享的)。
TEST(ComposerContent, PastedTextCountsTowardSharedBudget) {
    const auto ok = acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part(std::string(200 * 1024, 'x'))})));
    EXPECT_TRUE(ok.ok) << ok.error;

    const auto huge = acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part(std::string(3 * 1024 * 1024, 'x'))})));
    EXPECT_FALSE(huge.ok);
    EXPECT_NE(huge.error.find("2 MiB"), std::string::npos);

    const auto combined = acecode::normalize_composer_content(pasted_content(json::array({
        pasted_part(std::string(1100 * 1024, 'x'), "k1"),
        pasted_part(std::string(1100 * 1024, 'y'), "k2")})));
    EXPECT_FALSE(combined.ok);
}

// 触发场景:大段粘贴落成附件文件,composer 里是带 paste 描述的 attachment 部件。
// 期望:paste 的 title/chars/lines/part/parts 保留、未知键丢弃;part > parts、
// 只给一个 part 字段、负数行数被拒绝;resolve 后 name/mime 被服务端记录覆盖,
// paste 仍在(对话记录据此把它渲染成粘贴卡片)。
TEST(ComposerContent, PasteAttachmentDescriptorSurvivesNormalizeAndResolve) {
    const auto attachment = [](const json& paste) {
        return pasted_content(json::array({json{
            {"type", "attachment"}, {"key", "paste-file-1"}, {"id", "att_1"},
            {"name", "pasted.txt"}, {"kind", "file"}, {"mime_type", "text/plain"},
            {"paste", paste}}}));
    };
    auto result = acecode::normalize_composer_content(attachment(json{
        {"title", "error log"}, {"chars", 1000}, {"lines", 20}, {"part", 1}, {"parts", 2},
        {"extra", "dropped"}}));
    ASSERT_TRUE(result.ok) << result.error;
    const auto& paste = result.content["parts"][0]["paste"];
    EXPECT_EQ(paste, (json{{"title", "error log"}, {"chars", 1000}, {"lines", 20},
                           {"part", 1}, {"parts", 2}}));
    // 文件块不进正文:编辑器文本与提交文本都为空,由 file 引用送达模型。
    EXPECT_EQ(result.text, "");
    EXPECT_EQ(result.submission_text, "");

    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"part", 3}, {"parts", 2}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{{"part", 1}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"part", 0}, {"parts", 2}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"part", 1}, {"parts", 1025}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{{"lines", -1}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{{"chars", 1.5}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"title", std::string(1025, 't')}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json("not an object"))).ok);

    std::string error;
    ASSERT_TRUE(acecode::resolve_composer_content_attachments(result.content, json::array({json{
        {"id", "att_1"}, {"name", "pasted-text-20260924-101010.txt"}, {"kind", "file"},
        {"mime_type", "text/plain"}}}), error)) << error;
    EXPECT_EQ(result.content["parts"][0]["name"], "pasted-text-20260924-101010.txt");
    EXPECT_EQ(result.content["parts"][0]["mime_type"], "text/plain");
    EXPECT_EQ(result.content["parts"][0]["paste"]["title"], "error log");
}

// 触发场景:首页(尚无会话)粘贴的文件块存在工作区草稿附件区,部件带
// store:"workspace_draft" + store_scope(workspace hash 或 __no_workspace__)。
// 期望:store 缺 scope、store 值未知、scope 含路径字符都拒绝;scope 合法时保留;
// resolve 命中服务端记录后两个字段都被删掉 —— 发出去的部件一定是会话附件。
TEST(ComposerContent, WorkspaceDraftStoreRequiresScopeAndIsDroppedOnResolve) {
    const auto attachment = [](const json& extra) {
        json part{{"type", "attachment"}, {"key", "paste-file-1"}, {"id", "att_1"},
                  {"name", "pasted.txt"}, {"kind", "file"}};
        for (const auto& [key, value] : extra.items()) part[key] = value;
        return pasted_content(json::array({part}));
    };
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"store", "workspace_draft"}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"store", "other"}, {"store_scope", "abc"}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"store", "workspace_draft"}, {"store_scope", "../x"}})).ok);
    EXPECT_FALSE(acecode::normalize_composer_content(attachment(json{
        {"store", "workspace_draft"}, {"store_scope", ""}})).ok);

    auto no_workspace = acecode::normalize_composer_content(attachment(json{
        {"store", "workspace_draft"}, {"store_scope", "__no_workspace__"}}));
    ASSERT_TRUE(no_workspace.ok) << no_workspace.error;
    EXPECT_EQ(no_workspace.content["parts"][0]["store"], "workspace_draft");
    EXPECT_EQ(no_workspace.content["parts"][0]["store_scope"], "__no_workspace__");

    std::string error;
    ASSERT_TRUE(acecode::resolve_composer_content_attachments(no_workspace.content, json::array({json{
        {"id", "att_1"}, {"name", "pasted.txt"}, {"kind", "file"}, {"mime_type", "text/plain"}}}),
        error)) << error;
    EXPECT_FALSE(no_workspace.content["parts"][0].contains("store"));
    EXPECT_FALSE(no_workspace.content["parts"][0].contains("store_scope"));
}
