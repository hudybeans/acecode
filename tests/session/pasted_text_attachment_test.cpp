// 大段粘贴落为附件文件的纯逻辑:上传元数据解析、来源判定、首页草稿附件回收。
#include <gtest/gtest.h>

#include "session/pasted_text_attachment.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <random>
#include <string>

using nlohmann::json;
namespace fs = std::filesystem;

namespace {

struct TempDir {
    fs::path path;
    TempDir() {
        std::random_device rd;
        path = fs::temp_directory_path() /
               ("acecode_pasted_text_test_" + std::to_string(rd()));
        fs::create_directories(path);
    }
    ~TempDir() {
        std::error_code ec;
        fs::remove_all(path, ec);
    }
};

void write_file(const fs::path& path, const std::string& text) {
    fs::create_directories(path.parent_path());
    std::ofstream out(path, std::ios::binary);
    out << text;
}

fs::path draft_attachment_dir(const fs::path& project_dir) {
    return project_dir / "attachments" / acecode::kWorkspaceDraftAttachmentOwner;
}

json draft_referencing(const std::string& id) {
    return json{{"text", ""}, {"composer_content", {{"version", 1}, {"parts", json::array({
        json{{"type", "attachment"}, {"key", "paste-1"}, {"id", id}, {"name", "pasted.txt"},
             {"kind", "file"}, {"store", "workspace_draft"}, {"store_scope", "__no_workspace__"}},
    })}}}};
}

} // namespace

// 触发场景:会话 / 首页附件上传请求体里带(或不带)origin 与 paste 描述。
// 期望:不带 origin 时什么都不写(普通附件逐字节不变);origin=pasted_text 且
// mime 为 text/plain(允许带 charset 参数,或由 .txt 文件名推导)时写入
// metadata.origin 与 metadata.pasted_text(未知键丢弃、title 不进附件记录);
// 未知 origin、非 text/plain、负数行数、part > parts、只给 part 不给 parts、
// 没有 origin 却带 paste 一律拒绝(路由据此返回 400)。
TEST(PastedTextAttachment, UploadMetadataAcceptsPastedTextOriginOnly) {
    json metadata = json::object();
    std::string error;
    ASSERT_TRUE(acecode::apply_pasted_text_upload_metadata(
        json{{"name", "a.png"}, {"mime_type", "image/png"}}, metadata, error));
    EXPECT_TRUE(metadata.empty());

    ASSERT_TRUE(acecode::apply_pasted_text_upload_metadata(json{
        {"name", "pasted-text-20260924-101010.txt"}, {"mime_type", "text/plain"},
        {"origin", "pasted_text"},
        {"paste", {{"title", "日志"}, {"chars", 1200}, {"lines", 30}, {"part", 1}, {"parts", 2},
                   {"extra", true}}}}, metadata, error)) << error;
    EXPECT_EQ(metadata["origin"], "pasted_text");
    EXPECT_EQ(metadata["pasted_text"],
              (json{{"chars", 1200}, {"lines", 30}, {"part", 1}, {"parts", 2}}));

    json by_name = json::object();
    ASSERT_TRUE(acecode::apply_pasted_text_upload_metadata(
        json{{"name", "p.txt"}, {"origin", "pasted_text"}}, by_name, error)) << error;
    EXPECT_EQ(by_name["pasted_text"], json::object());
    json with_charset = json::object();
    EXPECT_TRUE(acecode::apply_pasted_text_upload_metadata(json{
        {"name", "p"}, {"mime_type", "text/plain; charset=utf-8"}, {"origin", "pasted_text"}},
        with_charset, error)) << error;

    const auto rejected = [](const json& body) {
        json out = json::object();
        std::string reason;
        const bool ok = acecode::apply_pasted_text_upload_metadata(body, out, reason);
        return !ok && !reason.empty();
    };
    const json base{{"name", "p.txt"}, {"mime_type", "text/plain"}, {"origin", "pasted_text"}};
    EXPECT_TRUE(rejected(json{{"name", "p.txt"}, {"mime_type", "text/plain"}, {"origin", "clipboard"}}));
    EXPECT_TRUE(rejected(json{{"name", "p.md"}, {"mime_type", "text/markdown"}, {"origin", "pasted_text"}}));
    auto negative = base;
    negative["paste"] = {{"lines", -1}};
    EXPECT_TRUE(rejected(negative));
    auto inverted = base;
    inverted["paste"] = {{"part", 3}, {"parts", 2}};
    EXPECT_TRUE(rejected(inverted));
    auto lone_part = base;
    lone_part["paste"] = {{"part", 1}};
    EXPECT_TRUE(rejected(lone_part));
    EXPECT_TRUE(rejected(json{{"name", "p.txt"}, {"mime_type", "text/plain"},
                              {"paste", {{"lines", 1}}}}));
}

// 触发场景:附件记录的 metadata.origin 为 pasted_text / 其它值 / 缺失。
// 期望:只有 pasted_text 被认作粘贴来源(展开闸门、草稿导入都靠它,不信客户端标记)。
TEST(PastedTextAttachment, RecordOriginDecidesPastedTextSource) {
    acecode::AttachmentRecord record;
    EXPECT_FALSE(acecode::is_pasted_text_attachment(record));
    record.metadata = json{{"origin", "upload"}};
    EXPECT_FALSE(acecode::is_pasted_text_attachment(record));
    record.metadata = json{{"origin", "pasted_text"}, {"pasted_text", {{"lines", 3}}}};
    EXPECT_TRUE(acecode::is_pasted_text_attachment(record));
}

// 触发场景:首页草稿保存后回收草稿附件区。三个附件:被草稿引用的旧附件、
// 未被引用的旧附件(1 小时前)、未被引用的新附件(刚上传)。
// 期望:只删第二个(blob 与 .json 一起删),其余原样保留。
// 回归:没有 10 分钟年龄门时,「刚上传完、引用它的草稿还在 250ms 防抖里」的附件
// 会被一次携带旧草稿的保存删掉,用户刷新后粘贴块变成「上传未完成」。
TEST(PastedTextAttachment, PruneRemovesOnlyOldUnreferencedDraftAttachments) {
    TempDir tmp;
    const auto dir = draft_attachment_dir(tmp.path);
    const auto now = fs::file_time_type::clock::now();
    const auto old_time = now - std::chrono::hours(1);
    for (const std::string id : {"att_1_referenced", "att_2_orphan", "att_3_fresh"}) {
        write_file(dir / (id + ".txt"), "pasted " + id);
        write_file(dir / (id + ".json"), json{{"id", id}}.dump());
    }
    fs::last_write_time(dir / "att_1_referenced.json", old_time);
    fs::last_write_time(dir / "att_2_orphan.json", old_time);

    EXPECT_EQ(acecode::prune_workspace_draft_attachments(
                  tmp.path, draft_referencing("att_1_referenced"),
                  acecode::kWorkspaceDraftAttachmentMinAge, now),
              1u);
    EXPECT_TRUE(fs::exists(dir / "att_1_referenced.txt"));
    EXPECT_TRUE(fs::exists(dir / "att_1_referenced.json"));
    EXPECT_FALSE(fs::exists(dir / "att_2_orphan.txt"));
    EXPECT_FALSE(fs::exists(dir / "att_2_orphan.json"));
    EXPECT_TRUE(fs::exists(dir / "att_3_fresh.txt"));
    EXPECT_TRUE(fs::exists(dir / "att_3_fresh.json"));

    // 引用必须是首页草稿附件(store=workspace_draft):没有 store 的同 id 部件
    // 是会话附件,不能替草稿附件区里的文件续命。
    auto session_part = draft_referencing("att_1_referenced");
    session_part["composer_content"]["parts"][0].erase("store");
    EXPECT_EQ(acecode::prune_workspace_draft_attachments(
                  tmp.path, session_part, acecode::kWorkspaceDraftAttachmentMinAge, now),
              1u);
    EXPECT_FALSE(fs::exists(dir / "att_1_referenced.json"));
}

// 触发场景:草稿附件区目录不存在;目录里有坏掉的元数据、不是附件 id 的文件、
// 子目录;草稿本身不是对象。
// 期望:永不抛异常。坏元数据按文件名(而不是 JSON 里记录的路径)与同名 blob 一起
// 被当作普通未引用附件回收;非附件 id 的文件与子目录不动;目录缺失返回 0。
TEST(PastedTextAttachment, PruneToleratesMissingDirectoryAndBrokenMetadata) {
    TempDir tmp;
    const auto now = fs::file_time_type::clock::now();
    EXPECT_EQ(acecode::prune_workspace_draft_attachments(
                  tmp.path / "missing", json{{"text", ""}}, std::chrono::seconds(0), now),
              0u);

    const auto dir = draft_attachment_dir(tmp.path);
    write_file(dir / "att_broken.json", "{not json");
    write_file(dir / "att_broken.txt", "blob");
    write_file(dir / "not an id!.json", "{}");
    write_file(dir / "notes.md", "x");
    fs::create_directories(dir / "att_subdir.json");
    const auto old_time = now - std::chrono::hours(1);
    fs::last_write_time(dir / "att_broken.json", old_time);
    fs::last_write_time(dir / "not an id!.json", old_time);

    EXPECT_NO_THROW({
        EXPECT_EQ(acecode::prune_workspace_draft_attachments(
                      tmp.path, json("not an object"),
                      acecode::kWorkspaceDraftAttachmentMinAge, now),
                  1u);
    });
    EXPECT_FALSE(fs::exists(dir / "att_broken.json"));
    EXPECT_FALSE(fs::exists(dir / "att_broken.txt"));
    EXPECT_TRUE(fs::exists(dir / "not an id!.json"));
    EXPECT_TRUE(fs::exists(dir / "notes.md"));
    EXPECT_TRUE(fs::is_directory(dir / "att_subdir.json"));
}
