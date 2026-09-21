#include <gtest/gtest.h>

#include "session/compact_notice.hpp"
#include "session/session_serializer.hpp"
#include "session/system_notice.hpp"

TEST(SystemNotice, RoundTripsStructuredDetailsAndExistingMetadata) {
    acecode::ChatMessage message;
    message.role = "system";
    message.content = "[Goal] Started: keep original content";
    message.metadata = acecode::make_system_notice_metadata("goal_started",
        {{"goal", {{"objective", "keep original content"}, {"tokens_used", 0}, {"token_budget", nullptr}}}},
        {{"transcript_only", true}, {"goal_audit", true}});
    const auto restored = acecode::deserialize_message(acecode::serialize_message(message));
    EXPECT_EQ(restored.content, message.content);
    EXPECT_EQ(restored.metadata, message.metadata);
    EXPECT_EQ(restored.metadata["system_notice"]["version"], 1);
    EXPECT_TRUE(restored.metadata["system_notice"]["params"]["goal"]["token_budget"].is_null());
}

TEST(SystemNotice, CompactionCarriesExplicitStageAndCompleteDiagnostics) {
    const std::string diagnostic(3000, 'x');
    const auto metadata = acecode::make_compact_notice_metadata("operation", "error", false,
        {{"error", diagnostic}});
    const auto compact = acecode::decode_compact_notice(metadata);
    ASSERT_TRUE(compact.has_value());
    EXPECT_FALSE(compact->complete);
    EXPECT_EQ(compact->stage, "error");
    EXPECT_EQ(metadata["system_notice"]["code"], "context_compact_failed");
    EXPECT_EQ(metadata["system_notice"]["params"]["error"], diagnostic);
    EXPECT_EQ(acecode::make_compact_notice_metadata("operation", "summary", true)
        ["system_notice"]["code"], "context_compacted");
}
