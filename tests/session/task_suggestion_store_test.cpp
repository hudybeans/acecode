#include <gtest/gtest.h>

#include "session/compact_checkpoint.hpp"
#include "session/session_storage.hpp"
#include "session/task_suggestion_store.hpp"
#include "utils/uuid.hpp"

#include <atomic>
#include <filesystem>
#include <thread>
#include <vector>

namespace {
using json = nlohmann::json;

class TaskSuggestionStoreTest : public testing::Test {
protected:
    std::filesystem::path directory = std::filesystem::temp_directory_path() /
        ("acecode_suggestion_test_" + acecode::generate_uuid_v7());
    acecode::TaskSuggestionStore store{directory};
    void TearDown() override {
        std::error_code error;
        std::filesystem::remove_all(directory, error);
    }
};

json side_task(std::string title = "Fix the unrelated cache invalidation") {
    return {{"kind", "side_task"}, {"title", std::move(title)},
        {"description", "A listener remains after the sender was removed."},
        {"prompt", "Inspect the cache event sender and receiver, repair the missing dispatch, "
            "and run the focused event regression tests."},
        {"evidence", json::array({"src/example.cpp:12"})}};
}

acecode::ChatMessage checkpoint(std::string id, std::string trigger = "auto") {
    acecode::CompactCheckpoint value;
    value.id = std::move(id);
    value.trigger = std::move(trigger);
    value.summary = "Work completed, decisions, constraints and remaining steps.";
    value.window_number = 1;
    value.window_id = "current-window";
    value.previous_window_id = "previous-window";
    value.first_window_id = "first-window";
    return acecode::encode_compact_checkpoint(value);
}
} // namespace

TEST_F(TaskSuggestionStoreTest, ReadDoesNotCreateStorageAndSourceScopeIsIsolated) {
    std::string error;
    EXPECT_TRUE(store.list("source-a", &error).empty());
    EXPECT_TRUE(error.empty());
    EXPECT_FALSE(std::filesystem::exists(directory));
    auto proposed = store.propose("source-a", side_task(), &error);
    ASSERT_TRUE(proposed) << error;
    const auto id = proposed->at("id").get<std::string>();
    EXPECT_FALSE(store.get("source-b", id, &error));
    EXPECT_TRUE(store.list("source-b").empty());
    EXPECT_FALSE(store.claim("source-b", id, "worktree", &error).suggestion);
    EXPECT_EQ(error, "suggestion not found");
    EXPECT_EQ(store.get("source-a", id)->at("status"), "pending");
}

TEST_F(TaskSuggestionStoreTest, DismissalAndDeduplicationSurviveReopen) {
    auto first = store.propose("source-a", side_task());
    ASSERT_TRUE(first);
    auto duplicate = store.propose("source-a", side_task());
    ASSERT_TRUE(duplicate);
    EXPECT_EQ(first->at("id"), duplicate->at("id"));
    ASSERT_TRUE(store.dismiss("source-a", first->at("id")));
    acecode::TaskSuggestionStore reopened(directory);
    auto reintroduced = reopened.propose("source-a", side_task());
    ASSERT_TRUE(reintroduced);
    EXPECT_EQ(reintroduced->at("id"), first->at("id"));
    EXPECT_EQ(reintroduced->at("status"), "dismissed");
    EXPECT_EQ(reopened.list("source-a").size(), 1u);
    std::string error;
    EXPECT_FALSE(reopened.claim("source-a", first->at("id"), "worktree", &error).suggestion);
    EXPECT_EQ(error, "suggestion was dismissed");
}

TEST_F(TaskSuggestionStoreTest, ValidatesBoundedDraftsAndLimitsPendingSideTasks) {
    std::string error;
    auto invalid = side_task();
    invalid["prompt"] = std::string(24001, 'x');
    EXPECT_FALSE(store.propose("source-a", invalid, &error));
    EXPECT_FALSE(error.empty());
    EXPECT_FALSE(store.propose("../escape", side_task(), &error));
    invalid = side_task();
    invalid["title"] = 42;
    EXPECT_FALSE(store.propose("source-a", invalid, &error));
    for (int i = 0; i < 3; ++i) {
        ASSERT_TRUE(store.propose("source-a", side_task("Task " + std::to_string(i)), &error)) << error;
    }
    EXPECT_FALSE(store.propose("source-a", side_task("Task 4"), &error));
    EXPECT_NE(error.find("three"), std::string::npos);
    EXPECT_TRUE(store.propose("source-b", side_task("Task 4"), &error));
    auto continuation = side_task("Continue");
    continuation["kind"] = "context_handoff";
    EXPECT_TRUE(store.propose("source-a", continuation, &error));
    EXPECT_EQ(store.list("source-a").size(), 4u);
}

TEST_F(TaskSuggestionStoreTest, ConcurrentClaimsHaveOneWinnerAndOneTarget) {
    auto proposed = store.propose("source-a", side_task());
    ASSERT_TRUE(proposed);
    const auto id = proposed->at("id").get<std::string>();
    std::atomic<int> winners{0};
    std::vector<std::thread> threads;
    std::vector<acecode::TaskSuggestionClaimResult> results(8);
    std::vector<std::string> errors(8);
    for (std::size_t i = 0; i < results.size(); ++i) {
        threads.emplace_back([&, i] {
            acecode::TaskSuggestionStore independent(directory);
            results[i] = independent.claim("source-a", id, "worktree", &errors[i]);
            if (results[i].claimed) ++winners;
        });
    }
    for (auto& thread : threads) thread.join();
    EXPECT_EQ(winners.load(), 1);
    auto persisted = store.get("source-a", id);
    ASSERT_TRUE(persisted);
    EXPECT_FALSE(persisted->at("target_session_id").get<std::string>().empty());
    for (std::size_t i = 0; i < results.size(); ++i) {
        ASSERT_TRUE(results[i].suggestion) << errors[i];
        EXPECT_EQ(results[i].suggestion->at("target_session_id"), persisted->at("target_session_id"));
    }
}

TEST_F(TaskSuggestionStoreTest, RetryKeepsTargetLocationAndProvisioningReceipt) {
    auto proposed = store.propose("source-a", side_task());
    ASSERT_TRUE(proposed);
    const auto id = proposed->at("id").get<std::string>();
    auto accepted = store.claim("source-a", id, "worktree");
    ASSERT_TRUE(accepted.claimed);
    const auto target = accepted.suggestion->at("target_session_id");
    ASSERT_TRUE(store.update("source-a", id, [](json& value) {
        value["status"] = "failed";
        value["error"] = "target exists but first input failed";
        value["provisioned_worktree"] = "/tmp/test-worktree";
        return true;
    }));
    std::string error;
    EXPECT_FALSE(store.claim("source-a", id, "current_branch", &error).suggestion);
    auto retry = store.claim("source-a", id, "worktree", &error);
    ASSERT_TRUE(retry.claimed) << error;
    EXPECT_EQ(retry.suggestion->at("target_session_id"), target);
    EXPECT_EQ(retry.suggestion->at("provisioned_worktree"), "/tmp/test-worktree");
    EXPECT_EQ(retry.suggestion->at("error"), "");
    EXPECT_EQ(store.recoverable().size(), 1u);
    EXPECT_FALSE(store.update("source-a", id, [](json& value) {
        value["target_session_id"] = "different-target";
        return true;
    }, &error));
    EXPECT_EQ(store.get("source-a", id)->at("target_session_id"), target);
    ASSERT_TRUE(store.update("source-a", id, [](json& value) {
        value["status"] = "started";
        return true;
    }));
    EXPECT_FALSE(store.claim("source-a", id, "worktree").claimed);
    EXPECT_TRUE(store.recoverable().empty());
}

TEST_F(TaskSuggestionStoreTest, CountsSemanticSummariesAndIgnoresRepairAndDuplicates) {
    std::vector<acecode::ChatMessage> messages = {
        checkpoint("summary-1", "manual"), checkpoint("summary-2", "auto"),
        checkpoint("summary-2", "auto"), checkpoint("repair-1", "repair-compact-fallback"),
    };
    messages.back().metadata["window_number"] = 0;
    messages.back().metadata["window_id"] = "";
    messages.back().metadata["previous_window_id"] = "";
    messages.back().metadata["first_window_id"] = "";
    acecode::ChatMessage visible_failure;
    visible_failure.role = "system";
    visible_failure.content = "Compaction failed";
    visible_failure.metadata = {{"compact_notice", true}, {"compact_notice_stage", "error"}};
    messages.push_back(visible_failure);
    EXPECT_EQ(acecode::count_successful_compactions(messages), 2u);
    EXPECT_FALSE(store.propose_continuation("source-a", messages, 3));
    messages.push_back(checkpoint("summary-3"));
    auto proposed = store.propose_continuation("source-a", messages, 3);
    ASSERT_TRUE(proposed);
    EXPECT_EQ(proposed->at("successful_compactions"), 3u);
    EXPECT_EQ(proposed->at("kind"), "context_handoff");
    EXPECT_FALSE(store.claim("source-a", proposed->at("id"), "worktree").suggestion);
    ASSERT_TRUE(store.dismiss("source-a", proposed->at("id")));
    acecode::TaskSuggestionStore reopened(directory);
    messages.push_back(checkpoint("summary-4"));
    auto repeated = reopened.propose_continuation("source-a", messages, 3);
    ASSERT_TRUE(repeated);
    EXPECT_EQ(repeated->at("id"), proposed->at("id"));
    EXPECT_EQ(repeated->at("status"), "dismissed");
    EXPECT_FALSE(reopened.propose_continuation("source-b", messages, 0));
    EXPECT_TRUE(reopened.list("source-b").empty());
}

TEST_F(TaskSuggestionStoreTest, ForkEpochResetsOnlyAtExplicitFreshWindowMarker) {
    std::vector<acecode::ChatMessage> history = {
        checkpoint("inherited-1"), checkpoint("inherited-2"), checkpoint("fork-boundary", "repair-manual"),
    };
    history.back().metadata["window_number"] = 0;
    history.back().metadata["window_id"] = "fresh-fork-window";
    history.back().metadata["first_window_id"] = "fresh-fork-window";
    history.back().metadata["previous_window_id"] = "";
    EXPECT_EQ(acecode::count_successful_compactions(history), 0u);
    history.push_back(checkpoint("fork-summary-1", "manual"));
    EXPECT_EQ(acecode::count_successful_compactions(history), 1u);
    EXPECT_FALSE(store.propose_continuation("fork", history, 3));
    EXPECT_EQ(acecode::count_successful_compactions({}), 0u);
}

TEST_F(TaskSuggestionStoreTest, IgnoresMalformedCheckpointWithoutBreakingReminderPolicy) {
    auto invalid = checkpoint("invalid");
    invalid.metadata["trigger"] = 17;
    EXPECT_EQ(acecode::count_successful_compactions({invalid, checkpoint("valid")}), 1u);
}

TEST_F(TaskSuggestionStoreTest, PurgingSourceRemovesOnlyItsSuggestionData) {
    ASSERT_TRUE(store.propose("source-a", side_task()));
    ASSERT_TRUE(store.propose("source-b", side_task()));
    std::string error;
    ASSERT_TRUE(acecode::SessionStorage::purge_session_files(
        directory.u8string(), "source-a", &error)) << error;
    EXPECT_TRUE(store.list("source-a").empty());
    EXPECT_EQ(store.list("source-b").size(), 1u);
}

TEST_F(TaskSuggestionStoreTest, DismissCancelsQueuedAndHidesStartedButRejectsStarting) {
    auto proposed = store.propose("source-a", side_task());
    ASSERT_TRUE(proposed);
    const auto id = proposed->at("id").get<std::string>();
    const auto accepted = store.claim("source-a", id, "current_branch");
    ASSERT_TRUE(accepted.claimed);
    auto cancelled = store.dismiss("source-a", id);
    ASSERT_TRUE(cancelled);
    EXPECT_EQ(cancelled->at("status"), "dismissed");
    EXPECT_EQ(cancelled->at("target_session_id"), accepted.suggestion->at("target_session_id"));

    proposed = store.propose("source-b", side_task());
    ASSERT_TRUE(proposed);
    const auto running_id = proposed->at("id").get<std::string>();
    ASSERT_TRUE(store.claim("source-b", running_id, "current_branch").claimed);
    ASSERT_TRUE(store.update("source-b", running_id, [](json& record) {
        record["status"] = "starting";
        return true;
    }));
    EXPECT_FALSE(store.dismiss("source-b", running_id));
    ASSERT_TRUE(store.update("source-b", running_id, [](json& record) {
        record["status"] = "started";
        record["input_accepted"] = true;
        record["input_persisted"] = false;
        return true;
    }));
    auto hidden = store.dismiss("source-b", running_id);
    ASSERT_TRUE(hidden);
    EXPECT_EQ(hidden->at("status"), "dismissed");
    EXPECT_EQ(hidden->at("input_accepted"), true);
    EXPECT_EQ(hidden->at("input_persisted"), false);
}

TEST_F(TaskSuggestionStoreTest, CancellationAndStartupClaimAreSerialized) {
    auto proposed = store.propose("source-a", side_task());
    ASSERT_TRUE(proposed);
    const auto id = proposed->at("id").get<std::string>();
    ASSERT_TRUE(store.claim("source-a", id, "current_branch").claimed);
    bool cancelled = false;
    bool starting = false;
    std::thread cancel([&] { cancelled = store.dismiss("source-a", id).has_value(); });
    std::thread launch([&] {
        store.update("source-a", id, [&](json& record) {
            if (record["status"] != "queued") return false;
            starting = true;
            record["status"] = "starting";
            return true;
        });
    });
    cancel.join();
    launch.join();
    EXPECT_NE(cancelled, starting);
    EXPECT_EQ(store.get("source-a", id)->at("status"), cancelled ? "dismissed" : "starting");
}
