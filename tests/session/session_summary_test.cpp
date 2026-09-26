#include <gtest/gtest.h>

#include "session/session_manager.hpp"
#include "session/session_storage.hpp"

#include <filesystem>
#include <random>
#include <string>

namespace fs = std::filesystem;

// 会话摘要(meta.summary)= 没有标题时侧栏 / 顶部标题栏显示的会话名字。
// 回归背景(bug 表现):会话 20260923-163126-e7e3 的首条 user 消息是 @session 引用
// 展开后的 9k 字符长文(content),用户真正敲的是 metadata.display_text 里的
// "@规划 AgentLoop 文件拆分与目录结构 继续"。旧实现按 content 截摘要,侧栏标题就成了
// "Referenced ACECode session context follows. Treat it as prior conversation..."。

namespace {

fs::path temp_cwd(const std::string& hint) {
    auto dir = fs::temp_directory_path() /
        ("acecode_session_summary_" + hint + "_" +
         std::to_string(std::random_device{}()));
    fs::remove_all(dir);
    fs::create_directories(dir);
    fs::remove_all(acecode::SessionStorage::get_project_dir(dir.string()));
    return dir;
}

struct ProjectCleanup {
    explicit ProjectCleanup(std::string cwd)
        : project_dir(acecode::SessionStorage::get_project_dir(cwd)) {}
    ~ProjectCleanup() { fs::remove_all(project_dir); }
    std::string project_dir;
};

acecode::ChatMessage user_message(std::string content, std::string display_text = {}) {
    acecode::ChatMessage msg;
    msg.role = "user";
    msg.content = std::move(content);
    msg.metadata = nlohmann::json::object();
    if (!display_text.empty()) {
        msg.metadata["display_text"] = std::move(display_text);
    }
    return msg;
}

// @session 引用展开后的模型侧提示(daemon 的 session_reference_context 形态)。
std::string referenced_session_prompt() {
    return "Referenced ACECode session context follows. Treat it as prior conversation "
           "context for the current request.\n\n[Referenced session]\nTitle: x\n" +
           std::string(9000, 'x') +
           "\n[End referenced session]\n\nCurrent user request:\n@规划 AgentLoop 文件拆分与目录结构 继续";
}

const char* kDisplayText = "@规划 AgentLoop 文件拆分与目录结构 继续";

bool is_utf8_continuation(unsigned char c) { return (c & 0xC0u) == 0x80u; }

} // namespace

// 触发场景:用户消息带 display_text(引用 / skill / 选区展开前的原文)。
// 期望行为:内存摘要与落盘的 meta.summary 都是显示文本,而不是展开后的长文。
TEST(SessionSummary, PrefersDisplayTextOverExpandedContent) {
    const auto cwd = temp_cwd("display_text");
    ProjectCleanup cleanup(cwd.string());

    acecode::SessionManager sm;
    sm.start_session(cwd.string(), "test-provider", "test-model", "20260924-000001-aaaa");
    sm.on_message(user_message(referenced_session_prompt(), kDisplayText));

    EXPECT_EQ(sm.current_summary(), kDisplayText);
    const auto meta = acecode::SessionStorage::read_meta(
        acecode::SessionStorage::meta_path(cleanup.project_dir, "20260924-000001-aaaa"));
    EXPECT_EQ(meta.summary, kDisplayText);
    EXPECT_EQ(meta.summary.find("Referenced ACECode"), std::string::npos);
}

// 触发场景:display_text 只有空白(客户端没填)。
// 期望行为:回退到 content,摘要不能变成空串。
TEST(SessionSummary, BlankDisplayTextFallsBackToContent) {
    acecode::ChatMessage msg = user_message("真正的问题", "   \n");
    EXPECT_EQ(acecode::SessionStorage::visible_user_message_text(msg), "真正的问题");
    acecode::ChatMessage plain = user_message("没有 display_text");
    EXPECT_EQ(acecode::SessionStorage::visible_user_message_text(plain), "没有 display_text");
}

// 触发场景:中文长输入(无空格可作词边界)。
// 期望行为:摘要不超过 80 字节 + "...",截断点落在字符边界(不切半个汉字)。
// 80 字节是既有阈值:约 26 个汉字 / 80 个 ASCII 字符,与大模型标题「至多 24 字」量级一致。
TEST(SessionSummary, BoundedAndUtf8SafeForCjkText) {
    std::string source;
    for (int i = 0; i < 200; ++i) source += "标";  // 600 字节
    const std::string summary = acecode::SessionStorage::summarize_user_message_text(source);

    ASSERT_GE(summary.size(), 3u);
    EXPECT_LE(summary.size(), 80u + 3u);
    EXPECT_EQ(summary.substr(summary.size() - 3), "...");
    const std::string prefix = summary.substr(0, summary.size() - 3);
    EXPECT_EQ(prefix.size(), 78u);  // 26 个三字节汉字
    EXPECT_EQ(source.compare(0, prefix.size(), prefix), 0);
    EXPECT_FALSE(is_utf8_continuation(static_cast<unsigned char>(source[prefix.size()])));
}

// 触发场景:英文长输入。
// 期望行为:在 60~80 字节之间的最后一个空格处断词,尾部空格不带进 "..." 前面。
TEST(SessionSummary, EnglishTextBreaksAtWordBoundary) {
    std::string source;
    for (int i = 0; i < 30; ++i) source += "word ";  // 150 字节
    const std::string summary = acecode::SessionStorage::summarize_user_message_text(source);

    EXPECT_EQ(summary.substr(summary.size() - 3), "...");
    const std::string prefix = summary.substr(0, summary.size() - 3);
    EXPECT_LE(prefix.size(), 80u);
    EXPECT_GT(prefix.size(), 60u);
    EXPECT_NE(prefix.back(), ' ');
    EXPECT_EQ(prefix.substr(prefix.size() - 4), "word");
}

// 触发场景:多行输入(换行 / 制表 / 连续空格 / 首尾空白)。
// 期望行为:标题是单行的,空白折成一个空格,首尾空白丢弃;未超长时不加 "..."。
TEST(SessionSummary, CollapsesWhitespaceIntoSingleLine) {
    EXPECT_EQ(
        acecode::SessionStorage::summarize_user_message_text("  第一行\r\n\n\t第二行   结尾  \n"),
        "第一行 第二行 结尾");
    EXPECT_EQ(acecode::SessionStorage::summarize_user_message_text("短标题"), "短标题");
}

// 触发场景:旧 meta 没有 summary(或 message_count 为 0),list_sessions 打开 JSONL 补齐。
// 期望行为:补齐口径与内存摘要一致 —— 取显示文本而不是展开后的 content。
TEST(SessionSummary, ListSessionsBackfillsSummaryFromDisplayText) {
    const auto cwd = temp_cwd("backfill");
    ProjectCleanup cleanup(cwd.string());
    const std::string id = "20260924-000002-bbbb";
    fs::create_directories(cleanup.project_dir);

    ASSERT_TRUE(acecode::SessionStorage::append_message(
        acecode::SessionStorage::session_path(cleanup.project_dir, id),
        user_message(referenced_session_prompt(), kDisplayText)));

    acecode::SessionMeta meta;
    meta.id = id;
    meta.cwd = cwd.string();
    meta.created_at = "2026-09-24T00:00:00Z";
    meta.updated_at = "2026-09-24T00:00:00Z";
    meta.provider = "test-provider";
    meta.model = "test-model";
    ASSERT_TRUE(acecode::SessionStorage::write_meta(
        acecode::SessionStorage::meta_path(cleanup.project_dir, id), meta));

    const auto sessions = acecode::SessionStorage::list_sessions(cleanup.project_dir);
    ASSERT_EQ(sessions.size(), 1u);
    EXPECT_EQ(sessions[0].id, id);
    EXPECT_EQ(sessions[0].summary, kDisplayText);
}
