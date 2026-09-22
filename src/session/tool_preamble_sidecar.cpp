#include "tool_preamble_sidecar.hpp"

#include "../provider/copilot_provider.hpp"
#include "../provider/cwd_model_override.hpp"
#include "../provider/model_resolver.hpp"
#include "../provider/provider_factory.hpp"
#include "../utils/logger.hpp"

#include <utility>

namespace acecode {

namespace {

std::optional<ModelProfile> explicit_profile(const AppConfig& cfg,
                                             const std::string& name) {
    if (name.empty()) return std::nullopt;
    for (const auto& entry : cfg.saved_models) {
        if (entry.name != name) continue;
        ModelProfile profile = entry;
        if (profile.provider == "openai" && !profile.stream_timeout_ms.has_value()) {
            profile.stream_timeout_ms = cfg.openai.stream_timeout_ms;
        }
        return profile;
    }
    return std::nullopt;
}

} // namespace

std::optional<ModelProfile> resolve_tool_preamble_sidecar_profile(
    const AppConfig& cfg,
    const std::string& session_model_name,
    const std::string& cwd) {
    const std::string& configured = cfg.agent_loop.tool_preamble.sidecar_model;
    if (!configured.empty()) {
        if (auto profile = explicit_profile(cfg, configured)) return profile;
        LOG_WARN("[tool_preamble] sidecar_model '" + configured +
                 "' not found in saved_models; falling back to the session model");
    }
    if (auto profile = explicit_profile(cfg, session_model_name)) return profile;
    std::optional<std::string> cwd_override;
    if (!cwd.empty()) cwd_override = load_cwd_model_override(cwd);
    return resolve_effective_model(cfg, cwd_override, std::nullopt);
}

std::shared_ptr<LlmProvider> create_tool_preamble_sidecar_provider(
    ModelProfile profile,
    const AppConfig& cfg) {
    if (profile.provider == "openai" &&
        (!profile.stream_timeout_ms.has_value() ||
         *profile.stream_timeout_ms > kToolPreambleSidecarTimeoutMs)) {
        profile.stream_timeout_ms = kToolPreambleSidecarTimeoutMs;
    }
    auto provider = create_provider_from_entry(profile, &cfg);
    if (auto copilot = std::dynamic_pointer_cast<CopilotProvider>(provider)) {
        copilot->try_silent_auth();
    }
    return provider;
}

std::optional<std::string> generate_tool_preamble_title(
    LlmProvider& provider,
    const tool_preamble::SidecarSummaryInput& input) {
    const auto messages = tool_preamble::build_sidecar_messages(input);
    ChatResponse response = provider.chat(messages, {});
    if (response.finish_reason == "error") return std::nullopt;
    const std::string title = tool_preamble::sanitize_sidecar_title(response.content);
    if (title.empty()) return std::nullopt;
    return title;
}

} // namespace acecode
