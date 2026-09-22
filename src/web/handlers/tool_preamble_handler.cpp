#include "tool_preamble_handler.hpp"

#include "../../tool_preamble/tool_preamble.hpp"

#include <algorithm>

namespace acecode::web {

nlohmann::json tool_preamble_snapshot(
    const ToolPreambleConfig& cfg,
    const std::vector<std::string>& saved_model_names) {
    return nlohmann::json{
        {"enabled", cfg.enabled},
        {"mode", cfg.mode},
        {"sidecar_model", cfg.sidecar_model},
        {"sidecar_wait_ms", cfg.sidecar_wait_ms},
        {"modes", nlohmann::json::array({
            tool_preamble::kModePrompt,
            tool_preamble::kModeReasoning,
            tool_preamble::kModeSidecar,
        })},
        {"saved_models", saved_model_names},
    };
}

bool parse_tool_preamble_request(
    const nlohmann::json& body,
    const ToolPreambleConfig& current,
    const std::vector<std::string>& saved_model_names,
    ToolPreambleConfig& out,
    std::string& error) {
    if (!body.is_object()) {
        error = "expected a JSON object";
        return false;
    }
    ToolPreambleConfig next = current;
    if (body.contains("enabled")) {
        if (!body["enabled"].is_boolean()) {
            error = "enabled must be a boolean";
            return false;
        }
        next.enabled = body["enabled"].get<bool>();
    }
    if (body.contains("mode")) {
        if (!body["mode"].is_string()) {
            error = "mode must be a string";
            return false;
        }
        const std::string mode = body["mode"].get<std::string>();
        if (!tool_preamble::is_valid_mode(mode)) {
            error = "mode must be one of prompt, reasoning, sidecar";
            return false;
        }
        next.mode = mode;
    }
    if (body.contains("sidecar_model")) {
        if (body["sidecar_model"].is_null()) {
            next.sidecar_model.clear();
        } else if (!body["sidecar_model"].is_string()) {
            error = "sidecar_model must be a string";
            return false;
        } else {
            const std::string name = body["sidecar_model"].get<std::string>();
            if (!name.empty() &&
                std::find(saved_model_names.begin(), saved_model_names.end(), name) ==
                    saved_model_names.end()) {
                error = "sidecar_model is not a saved model";
                return false;
            }
            next.sidecar_model = name;
        }
    }
    if (body.contains("sidecar_wait_ms")) {
        if (!body["sidecar_wait_ms"].is_number_integer()) {
            error = "sidecar_wait_ms must be an integer";
            return false;
        }
        const int v = body["sidecar_wait_ms"].get<int>();
        if (v < 0 || v > 15000) {
            error = "sidecar_wait_ms must be between 0 and 15000";
            return false;
        }
        next.sidecar_wait_ms = v;
    }
    out = next;
    return true;
}

} // namespace acecode::web
