#include <gtest/gtest.h>

#include "web/saved_model_reasoning_sync.hpp"
#include "config/config_mutation.hpp"

#include <chrono>
#include <condition_variable>
#include <future>
#include <mutex>

using namespace acecode;
using namespace acecode::web;
using namespace std::chrono_literals;

namespace {
ModelProfile profile(const std::string& name = "Moonlight") {
    ModelProfile model;
    model.name = name;
    model.model = "moonlight";
    model.provider = "openai";
    model.base_url = "https://models.example.test/v1";
    model.api_key = "test-key";
    model.models_dev_provider_id = "acemodel";
    model.capabilities_source = "manual";
    model.capabilities = {"vision", "tool_use"};
    return model;
}

ParsedOpenAiModels discovery() {
    return parse_openai_models(nlohmann::json::parse(R"({
        "data": [
            {"id":"moonlight","reasoning":{"supported_efforts":["low","medium","high","max"],"default_effort":"medium"}},
            {"id":"starrylight","reasoning":{"supported_efforts":["low","high"],"default_effort":"high"}}
        ]
    })"));
}

struct WorkerGate {
    std::mutex mutex;
    std::condition_variable changed;
    int probes = 0;
    int applied = 0;
    bool release = false;

    bool wait_for(int expected_probes, int expected_applied = 0) {
        std::unique_lock<std::mutex> lock(mutex);
        return changed.wait_for(lock, 3s, [&] {
            return probes >= expected_probes && applied >= expected_applied;
        });
    }
};
} // namespace

TEST(SavedModelReasoningSync, GroupsConnectionsAndFiltersExplicitNames) {
    auto first = profile();
    auto second = profile("Starrylight");
    second.model = "starrylight";
    auto credential = profile("Other credential");
    credential.api_key = "another-test-key";
    auto headers = profile("Other headers");
    headers.request_headers["X-Test"] = "other";
    auto unsupported = profile("Anthropic");
    unsupported.provider = "anthropic";
    auto full = profile("Full URL");
    full.endpoint_mode = "full_url";
    auto managed = profile("Copilot");
    managed.provider = "copilot";
    const std::vector<ModelProfile> profiles{
        first, second, credential, headers, unsupported, full, managed};
    const auto batches = group_model_reasoning_sync(profiles);
    ASSERT_EQ(batches.size(), 3u);
    EXPECT_EQ(batches[0].profiles.size(), 2u);
    EXPECT_EQ(group_model_reasoning_sync(profiles, {"Starrylight"}).size(), 1u);
    EXPECT_TRUE(group_model_reasoning_sync(profiles, {"deleted"}).empty());
}

TEST(SavedModelReasoningSync, FillsMissingEffortsAndIsIdempotent) {
    auto before = profile();
    before.context_window = 123456;
    before.max_output_tokens = 1234;
    std::vector<ModelProfile> current{before};
    ASSERT_TRUE(merge_model_reasoning_sync(current, {before}, discovery()));
    ASSERT_TRUE(current[0].reasoning);
    EXPECT_EQ(current[0].reasoning->supported_efforts.size(), 4u);
    EXPECT_TRUE(current[0].reasoning->default_enabled);
    EXPECT_EQ(current[0].reasoning->default_effort, "medium");
    EXPECT_EQ(current[0].context_window, before.context_window);
    EXPECT_EQ(current[0].max_output_tokens, before.max_output_tokens);
    EXPECT_EQ(current[0].api_key, before.api_key);
    EXPECT_EQ(current[0].capabilities, (std::vector<std::string>{"vision", "tool_use", "reasoning"}));
    std::string error;
    EXPECT_TRUE(validate_saved_models(current, before.name, error)) << error;
    EXPECT_FALSE(merge_model_reasoning_sync(current, current, discovery()));
}

TEST(SavedModelReasoningSync, PreservesExplicitChoicesAndRepairsEmptyLegacyDeclaration) {
    auto before = profile();
    ModelReasoningOptions old;
    old.supported = true;
    old.enabled = false;
    old.effort = "high";
    old.supported_efforts = {"low", "high"};
    old.supports_max_tokens = true;
    old.max_tokens = 512;
    before.reasoning = old;
    before.capabilities.push_back("reasoning");
    std::vector<ModelProfile> current{before};
    ASSERT_TRUE(merge_model_reasoning_sync(current, {before}, discovery()));
    EXPECT_EQ(current[0].reasoning->enabled, false);
    EXPECT_EQ(current[0].reasoning->effort, "high");
    EXPECT_EQ(current[0].reasoning->max_tokens, 512);
    EXPECT_TRUE(current[0].reasoning->supports_max_tokens);

    before.reasoning->supported_efforts.clear();
    before.reasoning->effort.reset();
    before.reasoning->enabled.reset();
    current = {before};
    ASSERT_TRUE(merge_model_reasoning_sync(current, {before}, discovery()));
    EXPECT_TRUE(current[0].reasoning->default_enabled);
    EXPECT_FALSE(current[0].reasoning->enabled.has_value());
}

TEST(SavedModelReasoningSync, DropsUnsupportedEffortButKeepsMandatoryReasoning) {
    auto before = profile();
    auto old = *discovery().reasoning.at("moonlight");
    old.effort = "xhigh";
    old.supported_efforts.push_back("xhigh");
    old.mandatory = true;
    before.reasoning = old;
    before.capabilities.push_back("reasoning");
    std::vector<ModelProfile> current{before};
    ASSERT_TRUE(merge_model_reasoning_sync(current, {before}, discovery()));
    EXPECT_FALSE(current[0].reasoning->effort.has_value());
    EXPECT_TRUE(current[0].reasoning->mandatory);
    EXPECT_TRUE(current[0].reasoning->default_enabled);
}

TEST(SavedModelReasoningSync, MissingInvalidOrEmptyDeclarationsPreserveExistingValues) {
    const auto before = profile();
    for (const char* data : {
        R"({"data":[]})",
        R"({"data":[{"id":"moonlight"}]})",
        R"({"data":[{"id":"moonlight","reasoning":{"supported_efforts":[]}}]})",
        R"({"data":[{"id":"moonlight","reasoning":{"supported_efforts":["unknown"]}}]})"
    }) {
        std::vector<ModelProfile> current{before};
        EXPECT_FALSE(merge_model_reasoning_sync(current, {before},
            parse_openai_models(nlohmann::json::parse(data))));
        EXPECT_TRUE(model_profiles_equal(current[0], before));
    }
}

TEST(SavedModelReasoningSync, DoesNotOverwriteEditsOrResurrectDeletedModels) {
    const auto before = profile();
    for (int edit = 0; edit < 5; ++edit) {
        auto changed = before;
        if (edit == 0) changed.api_key = "rotated";
        if (edit == 1) changed.base_url += "/new";
        if (edit == 2) changed.name = "Renamed";
        if (edit == 3) changed.model = "starrylight";
        if (edit == 4) changed.context_window = 32000;
        std::vector<ModelProfile> current{changed};
        EXPECT_FALSE(merge_model_reasoning_sync(current, {before}, discovery()));
        EXPECT_TRUE(model_profiles_equal(current[0], changed));
    }
    std::vector<ModelProfile> deleted;
    EXPECT_FALSE(merge_model_reasoning_sync(deleted, {before}, discovery()));
    EXPECT_TRUE(deleted.empty());
}

TEST(SavedModelReasoningSync, RequestsReturnDuringBlockedProbeAndCoalescePendingWork) {
    WorkerGate gate;
    auto second = profile("Starrylight");
    second.model = "starrylight";
    SavedModelReasoningSync sync(
        [&] { return std::vector<ModelProfile>{profile(), second}; },
        [&](const ModelReasoningSyncBatch& batch, const ParsedOpenAiModels&) {
            EXPECT_EQ(batch.profiles.size(), 2u);
            std::lock_guard<std::mutex> lock(gate.mutex);
            ++gate.applied;
            gate.changed.notify_all();
        },
        [&](const ModelProbeRequest&, const std::atomic<bool>& cancel) {
            std::unique_lock<std::mutex> lock(gate.mutex);
            ++gate.probes;
            gate.changed.notify_all();
            const auto deadline = std::chrono::steady_clock::now() + 3s;
            while (!gate.release && !cancel.load() &&
                   std::chrono::steady_clock::now() < deadline) gate.changed.wait_for(lock, 5ms);
            return OpenAiModelsProbeResult{discovery(), {}, {}};
        });
    sync.request();
    ASSERT_TRUE(gate.wait_for(1));
    auto enqueue = std::async(std::launch::async, [&] {
        for (int i = 0; i < 20; ++i) sync.request();
    });
    EXPECT_EQ(enqueue.wait_for(1s), std::future_status::ready);
    {
        std::lock_guard<std::mutex> lock(gate.mutex);
        gate.release = true;
    }
    gate.changed.notify_all();
    EXPECT_TRUE(gate.wait_for(2, 2));
    sync.stop();
    EXPECT_EQ(gate.probes, 2);
}

TEST(SavedModelReasoningSync, FailedConnectionDoesNotBlockOtherConnections) {
    WorkerGate gate;
    auto second = profile("Other");
    second.api_key = "other";
    SavedModelReasoningSync sync(
        [&] { return std::vector<ModelProfile>{profile(), second}; },
        [&](const ModelReasoningSyncBatch&, const ParsedOpenAiModels&) {
            std::lock_guard<std::mutex> lock(gate.mutex);
            ++gate.applied;
            gate.changed.notify_all();
        },
        [&](const ModelProbeRequest&, const std::atomic<bool>&) {
            std::lock_guard<std::mutex> lock(gate.mutex);
            ++gate.probes;
            if (gate.probes == 1) throw std::runtime_error("upstream failed");
            return OpenAiModelsProbeResult{discovery(), {}, {}};
        });
    sync.request();
    EXPECT_TRUE(gate.wait_for(2, 1));
    sync.stop();
    EXPECT_EQ(gate.applied, 1);
}

TEST(SavedModelReasoningSync, StopCancelsProbeAndNeverAppliesOrStartsPendingWork) {
    WorkerGate gate;
    SavedModelReasoningSync sync(
        [] { return std::vector<ModelProfile>{profile()}; },
        [&](const ModelReasoningSyncBatch&, const ParsedOpenAiModels&) { ++gate.applied; },
        [&](const ModelProbeRequest&, const std::atomic<bool>& cancel) {
            std::unique_lock<std::mutex> lock(gate.mutex);
            ++gate.probes;
            gate.changed.notify_all();
            const auto deadline = std::chrono::steady_clock::now() + 3s;
            while (!cancel.load() && std::chrono::steady_clock::now() < deadline)
                gate.changed.wait_for(lock, 5ms);
            return OpenAiModelsProbeResult{discovery(), {}, {}};
        });
    sync.request();
    ASSERT_TRUE(gate.wait_for(1));
    sync.request();
    sync.stop();
    sync.request();
    EXPECT_EQ(gate.probes, 1);
    EXPECT_EQ(gate.applied, 0);
}
