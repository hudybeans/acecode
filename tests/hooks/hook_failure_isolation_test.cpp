#include <gtest/gtest.h>

#include "hooks/hook_manager.hpp"
#include "hooks/hook_runtime.hpp"
#include "utils/encoding.hpp"

#include <atomic>
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

acecode::NormalizedHook eligible_hook(const std::string& id) {
    acecode::NormalizedHook hook;
    hook.id = id;
    hook.source_id = "isolation-test";
    hook.event_name = acecode::kCodexHookEventPostToolUse;
    hook.matcher = "bash";
    hook.kind = acecode::HookHandlerKind::Command;
    hook.command.command = id;
    hook.trust_status = acecode::HookTrustStatus::Trusted;
    return hook;
}

} // namespace

TEST(HookFailureIsolation, ActivePayloadReplacesInvalidNestedValuesAndKeys) {
    acecode::HookRegistrySnapshot registry;
    registry.feature_enabled = true;
    registry.hooks = {eligible_hook("active")};
    std::string captured;
    acecode::HookManager manager(registry, {}, acecode::HookShellRunner(
        [&](const std::string&, const std::string& input, int, const std::string&) {
            captured = input;
            acecode::HookProcessResult result;
            result.started = true;
            result.exit_code = 0;
            return result;
        }));
    acecode::HookDispatchRequest request;
    request.event_name = acecode::kCodexHookEventPostToolUse;
    request.matcher_value = "bash";
    const std::string invalid = std::string(58, 'a') + "\xC0\xB4\xD4\xB4";
    request.payload = {{"tool_response", {{"output", invalid}}},
                       {std::string("bad\xED\xA0\x80"), "value"}};
    EXPECT_THROW((void)request.payload.dump(), nlohmann::json::type_error);
    EXPECT_EQ(manager.dispatch_codex(request).invoked_count, 1u);
    ASSERT_TRUE(nlohmann::json::accept(captured));
    EXPECT_TRUE(acecode::is_valid_utf8(captured));
    EXPECT_NE(captured.find(u8"\uFFFD"), std::string::npos);
    EXPECT_EQ(request.payload["tool_response"]["output"], invalid);
}

TEST(HookFailureIsolation, RunnerExceptionsPreserveDecisionsAndContinueOtherHooks) {
    acecode::HookRegistrySnapshot registry;
    registry.feature_enabled = true;
    registry.hooks = {eligible_hook("deny"), eligible_hook("throw-standard"),
                      eligible_hook("throw-unknown"), eligible_hook("last")};
    std::vector<std::string> invoked;
    acecode::HookManager manager(registry, {}, acecode::HookShellRunner(
        [&](const std::string& command, const std::string&, int, const std::string&) {
            invoked.push_back(command);
            if (command == "throw-standard") throw std::runtime_error("runner failed");
            if (command == "throw-unknown") throw 42;
            acecode::HookProcessResult result;
            result.started = true;
            result.exit_code = command == "deny" ? 2 : 0;
            result.stderr_text = command == "deny" ? "denied by test" : "";
            return result;
        }));
    acecode::HookDispatchRequest request;
    request.event_name = acecode::kCodexHookEventPostToolUse;
    request.matcher_value = "bash";
    const auto result = manager.dispatch_codex(request);
    EXPECT_EQ(invoked.size(), 4u);
    EXPECT_EQ(result.invoked_count, 4u);
    EXPECT_TRUE(result.denied);
    EXPECT_EQ(result.reason, "denied by test");
    ASSERT_EQ(result.diagnostics.size(), 2u);
    EXPECT_EQ(result.diagnostics[0].code, "HOOK_FAILED");
    EXPECT_NE(result.diagnostics[0].message.find("runner failed"), std::string::npos);
    EXPECT_EQ(result.diagnostics[1].code, "HOOK_FAILED");
}

TEST(HookFailureIsolation, LegacySyncAndAsyncWorkersRecoverAfterExceptions) {
    for (auto mode : {acecode::HookMode::Sync, acecode::HookMode::Async}) {
        acecode::HookConfig config;
        config.enabled = true;
        acecode::HookDefinition hook;
        hook.id = "legacy";
        hook.event = acecode::kHookEventAssistantMessageCompleted;
        hook.mode = mode;
        hook.command.command = "legacy-runner";
        config.events[hook.event].push_back(hook);
        std::atomic<int> invocations{0};
        std::atomic<int> valid_payloads{0};
        acecode::HookManager manager(config,
            [&](const acecode::HookCommandSpec&, const std::string& input,
                int, const std::string&) {
                if (nlohmann::json::accept(input)) ++valid_payloads;
                const int call = ++invocations;
                if (call == 1) throw std::runtime_error("legacy failed");
                if (call == 2) throw 42;
                acecode::HookProcessResult result;
                result.started = true;
                result.exit_code = 0;
                return result;
            });
        for (int i = 0; i < 3; ++i) {
            EXPECT_EQ(manager.dispatch(hook.event, {{"output", "\xC0\x80"}}, ""), 1u);
        }
        manager.shutdown(std::chrono::seconds(5));
        EXPECT_EQ(invocations.load(), 3);
        EXPECT_EQ(valid_payloads.load(), 3);
    }
}
