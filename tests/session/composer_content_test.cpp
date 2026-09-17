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
