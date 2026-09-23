#include <gtest/gtest.h>

#include "session/session_manager.hpp"
#include "session/session_storage.hpp"

#include <filesystem>
#include <random>
#include <string>

namespace {

namespace fs = std::filesystem;
using acecode::ChatMessage;
using acecode::SessionManager;
using acecode::SessionMeta;
using acecode::SessionStorage;

class SessionActivityOrder : public testing::Test {
protected:
    void SetUp() override {
        cwd_ = fs::temp_directory_path() /
            ("acecode_activity_order_" + std::to_string(std::random_device{}()));
        fs::create_directories(cwd_);
        project_dir_ = SessionStorage::get_project_dir(cwd_.string());
        fs::create_directories(project_dir_);
        create_session(older_id_, older_time_);
        create_session(newer_id_, newer_time_);
    }

    void TearDown() override {
        fs::remove_all(project_dir_);
        fs::remove_all(cwd_);
    }

    void create_session(const std::string& id, const std::string& time) {
        ChatMessage message;
        message.role = "user";
        message.content = id;
        ASSERT_TRUE(SessionStorage::append_message(
            SessionStorage::session_path(project_dir_, id), message));
        SessionMeta meta;
        meta.id = id;
        meta.cwd = cwd_.string();
        meta.created_at = time;
        meta.updated_at = time;
        meta.message_count = 1;
        meta.turn_count = 1;
        meta.provider = "test-provider";
        meta.model = "test-model";
        ASSERT_TRUE(SessionStorage::write_meta(
            SessionStorage::meta_path(project_dir_, id), meta));
    }

    void resume_older(SessionManager& manager) {
        manager.start_session(cwd_.string(), "test-provider", "test-model");
        ASSERT_EQ(manager.resume_session(older_id_).size(), 1u);
    }

    SessionMeta older_meta() const {
        return SessionStorage::read_meta(
            SessionStorage::meta_path(project_dir_, older_id_));
    }

    void expect_original_order() const {
        EXPECT_EQ(older_meta().updated_at, older_time_);
        const auto sessions = SessionStorage::list_sessions(project_dir_);
        ASSERT_EQ(sessions.size(), 2u);
        EXPECT_EQ(sessions[0].id, newer_id_);
        EXPECT_EQ(sessions[0].updated_at, newer_time_);
        EXPECT_EQ(sessions[1].id, older_id_);
    }

    fs::path cwd_;
    std::string project_dir_;
    const std::string older_id_ = "z-older-session";
    const std::string newer_id_ = "a-newer-session";
    const std::string older_time_ = "2001-01-01T00:00:00Z";
    const std::string newer_time_ = "2002-01-01T00:00:00Z";
};

TEST_F(SessionActivityOrder, FinalizeAndReopenPreserveActivityTimeAndOrder) {
    {
        SessionManager manager;
        resume_older(manager);
        manager.finalize();
    }
    expect_original_order();

    SessionManager reopened;
    resume_older(reopened);
    expect_original_order();
    reopened.finalize();
    expect_original_order();
}

TEST_F(SessionActivityOrder, SwitchingSessionsDoesNotPromoteThePreviousSession) {
    SessionManager manager;
    resume_older(manager);
    manager.end_current_session();
    expect_original_order();
    EXPECT_EQ(manager.resume_session(newer_id_).size(), 1u);
    manager.finalize();
    expect_original_order();
}

TEST_F(SessionActivityOrder, ModelRestorationAndMetadataChangesKeepActivityTime) {
    SessionManager manager;
    resume_older(manager);
    ASSERT_TRUE(manager.set_active_model_state(
        "restored-provider", "restored-model", "saved-model", std::string("high")));
    expect_original_order();
    EXPECT_EQ(older_meta().model_preset, "saved-model");

    ASSERT_TRUE(manager.set_active_provider("changed-provider", "changed-model"));
    expect_original_order();
    EXPECT_EQ(older_meta().model, "changed-model");

    ASSERT_TRUE(manager.try_set_generated_session_title("Generated title"));
    expect_original_order();
    manager.set_session_title("Renamed title");
    expect_original_order();
    EXPECT_EQ(older_meta().title, "Renamed title");

    manager.set_permission_mode("plan", true);
    manager.set_pre_plan_permission_mode("auto", true);
    expect_original_order();
    EXPECT_EQ(older_meta().permission_mode, "plan");
    EXPECT_EQ(older_meta().pre_plan_permission_mode, "auto");

    manager.set_input_draft("Unsent draft");
    expect_original_order();
    EXPECT_EQ(older_meta().input_draft, "Unsent draft");

    acecode::TokenUsage usage;
    usage.prompt_tokens = 10;
    usage.completion_tokens = 2;
    usage.total_tokens = 12;
    usage.has_data = true;
    manager.record_token_usage(usage);
    expect_original_order();
    EXPECT_EQ(older_meta().last_token_usage.prompt_tokens, 10);

    manager.finalize();
    expect_original_order();
}

TEST_F(SessionActivityOrder, NewMessagePromotesSessionAndSurvivesReopen) {
    std::string activity_time;
    {
        SessionManager manager;
        resume_older(manager);
        ChatMessage message;
        message.role = "user";
        message.content = "New conversation activity";
        manager.on_message(message);
        const auto meta = older_meta();
        activity_time = meta.updated_at;
        EXPECT_GT(activity_time, newer_time_);
        EXPECT_EQ(meta.message_count, 2);
        EXPECT_EQ(meta.turn_count, 2);
        manager.finalize();
    }
    SessionManager reopened;
    reopened.start_session(cwd_.string(), "test-provider", "test-model");
    ASSERT_EQ(reopened.resume_session(older_id_).size(), 2u);
    EXPECT_EQ(older_meta().updated_at, activity_time);
    const auto sessions = SessionStorage::list_sessions(project_dir_);
    ASSERT_EQ(sessions.size(), 2u);
    EXPECT_EQ(sessions[0].id, older_id_);
    reopened.finalize();
    EXPECT_EQ(older_meta().updated_at, activity_time);
}

TEST_F(SessionActivityOrder, FailedAppendAndExitPreserveActivityTime) {
    SessionManager manager;
    resume_older(manager);
    const fs::path transcript = SessionStorage::session_path(project_dir_, older_id_);
    ASSERT_TRUE(fs::remove(transcript));
    ASSERT_TRUE(fs::create_directory(transcript));
    ChatMessage message;
    message.role = "user";
    message.content = "Cannot persist";
    manager.on_message(message);
    EXPECT_FALSE(manager.last_error().empty());
    manager.finalize();
    EXPECT_EQ(older_meta().updated_at, older_time_);
    EXPECT_EQ(older_meta().message_count, 1);
    EXPECT_EQ(older_meta().turn_count, 1);
}

TEST_F(SessionActivityOrder, ReplacingHistoryAdvancesTimeEvenWithTheSameMessageCount) {
    SessionManager manager;
    resume_older(manager);
    ChatMessage replacement;
    replacement.role = "user";
    replacement.content = "Replaced history";
    ASSERT_TRUE(manager.replace_active_messages({replacement}));
    const auto meta = older_meta();
    EXPECT_GT(meta.updated_at, newer_time_);
    EXPECT_EQ(meta.message_count, 1);
    EXPECT_EQ(meta.summary, "Replaced history");
    manager.finalize();
    EXPECT_EQ(older_meta().updated_at, meta.updated_at);
}

TEST_F(SessionActivityOrder, PersistingCompactCheckpointAdvancesActivityTime) {
    SessionManager manager;
    resume_older(manager);
    acecode::CompactCheckpoint checkpoint;
    checkpoint.id = "activity-checkpoint";
    checkpoint.summary = "Compacted history";
    ASSERT_TRUE(manager.append_compact_checkpoint(checkpoint));
    const auto meta = older_meta();
    EXPECT_GT(meta.updated_at, newer_time_);
    EXPECT_EQ(meta.message_count, 2);
    manager.finalize();
    EXPECT_EQ(older_meta().updated_at, meta.updated_at);
}

TEST_F(SessionActivityOrder, RecreatingMissingMetadataUsesCreationTime) {
    SessionManager manager;
    resume_older(manager);
    ASSERT_TRUE(fs::remove(SessionStorage::meta_path(project_dir_, older_id_)));
    manager.finalize();
    const auto meta = older_meta();
    EXPECT_EQ(meta.id, older_id_);
    EXPECT_EQ(meta.created_at, older_time_);
    EXPECT_EQ(meta.updated_at, older_time_);
    EXPECT_EQ(meta.message_count, 1);
    expect_original_order();
}

} // namespace
