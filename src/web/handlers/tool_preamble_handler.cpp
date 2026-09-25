#include "tool_preamble_handler.hpp"

#include "../../tool_preamble/tool_preamble.hpp"

namespace acecode::web {

nlohmann::json tool_preamble_snapshot(const ToolPreambleConfig& cfg) {
    return nlohmann::json{
        {"enabled", cfg.enabled},
        {"mode", cfg.mode},
        {"modes", nlohmann::json::array({
            tool_preamble::kModePrompt,
            tool_preamble::kModeReasoning,
        })},
    };
}

bool parse_tool_preamble_request(
    const nlohmann::json& body,
    const ToolPreambleConfig& current,
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
            error = "mode must be one of prompt, reasoning";
            return false;
        }
        next.mode = mode;
    }
    out = next;
    return true;
}

} // namespace acecode::web
