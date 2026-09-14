#include <gtest/gtest.h>

#include "tool/tool_executor.hpp"
#include "tool/ask_user_question_tool.hpp"

TEST(ToolResultAttachments, FormatToolResultCarriesAttachmentContentParts) {
    acecode::ToolResult result;
    result.output = "created image";
    result.success = true;
    result.attachments = nlohmann::json::array({
        {
            {"id", "att_img"},
            {"session_id", "sid"},
            {"name", "plot.png"},
            {"kind", "image"},
            {"mime_type", "image/png"},
            {"path", "C:/tmp/plot.png"},
            {"blob_url", "/api/sessions/sid/attachments/att_img/blob"},
            {"size_bytes", 3},
        },
    });

    auto msg = acecode::ToolExecutor::format_tool_result("call-img", result);

    EXPECT_EQ(msg.role, "tool");
    EXPECT_EQ(msg.content, "created image");
    EXPECT_EQ(msg.tool_call_id, "call-img");
    ASSERT_TRUE(msg.content_parts.is_array());
    ASSERT_EQ(msg.content_parts.size(), 1u);
    EXPECT_EQ(msg.content_parts[0]["type"], "image");
    EXPECT_EQ(msg.content_parts[0]["attachment"]["id"], "att_img");
    EXPECT_EQ(msg.content_parts[0]["attachment"]["blob_url"],
              "/api/sessions/sid/attachments/att_img/blob");
}

TEST(ToolResultAttachments, FormatToolResultCarriesUiMetadata) {
    acecode::ToolResult result;
    result.output = "User has answered your questions: \"Q?\"=\"A\"";
    result.success = true;
    result.metadata = {
        {"ask_user_question_result", {
            {"items", nlohmann::json::array({
                {{"question", "Q?"}, {"answer", "A"}}
            })}
        }}
    };

    auto msg = acecode::ToolExecutor::format_tool_result("call-ask", result);

    ASSERT_TRUE(msg.metadata.is_object());
    ASSERT_TRUE(msg.metadata.contains("ask_user_question_result"));
    const auto& items = msg.metadata["ask_user_question_result"]["items"];
    ASSERT_TRUE(items.is_array());
    ASSERT_EQ(items.size(), 1u);
    EXPECT_EQ(items[0]["question"], "Q?");
    EXPECT_EQ(items[0]["answer"], "A");
}

TEST(ToolResultAttachments, CancelledAskResultPersistsFeedbackWithoutChangingOutput) {
    const auto result = acecode::make_rejected_ask_result();
    const auto message = acecode::ToolExecutor::format_tool_result("call-cancel", result);

    EXPECT_FALSE(result.success);
    EXPECT_EQ(message.role, "tool");
    EXPECT_EQ(message.tool_call_id, "call-cancel");
    EXPECT_EQ(message.content, "[Error] User declined to answer questions.");
    ASSERT_TRUE(message.metadata.contains("ask_user_question_result"));
    EXPECT_EQ(message.metadata.at("ask_user_question_result"),
              (nlohmann::json{{"cancelled", true}, {"items", nlohmann::json::array()}}));
    EXPECT_TRUE(acecode::format_ask_user_question_result_display(message.metadata).empty());
}
