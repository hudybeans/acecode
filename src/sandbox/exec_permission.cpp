#include "exec_permission.hpp"

#include <algorithm>
#include <cctype>

namespace acecode::sandbox {

std::string validate_escalation_arguments(const nlohmann::json& args) {
    if (!args.is_object()) return "Tool arguments must be an object.";
    if (args.contains("with_escalated_permissions") && !args["with_escalated_permissions"].is_boolean()) {
        return "with_escalated_permissions must be a boolean.";
    }
    if (args.contains("justification") && !args["justification"].is_string()) {
        return "justification must be a string.";
    }
    if (args.value("with_escalated_permissions", false)) {
        const auto reason = args.value("justification", std::string{});
        if (std::none_of(reason.begin(), reason.end(), [](unsigned char c) { return !std::isspace(c); })) {
            return "with_escalated_permissions=true requires a non-empty justification.";
        }
    }
    return {};
}

void ExecPermission::set_availability(bool available) {
    input.sandbox_available = available;
    decision = decide_exec(input);
    std::string display;
    for (const auto& prefix : prefixes) {
        if (!display.empty()) display += "; ";
        display += prefix;
    }
    arguments["permission"] = {
        {"reason", decision.reason}, {"sandbox", sandbox_mode_name(decision.sandbox)},
        {"always_allow_prefix", display}, {"classification", command_kind_name(classification.kind)}};
}

ExecPermission evaluate_exec_permission(const std::string& arguments,
                                        const PermissionManager& permissions,
                                        const ExecRules& rules, bool sandbox_available,
                                        CommandPlatform platform) {
    ExecPermission result;
    result.arguments = nlohmann::json::parse(arguments, nullptr, false);
    result.error = validate_escalation_arguments(result.arguments);
    if (!result.error.empty()) return result;
    if (!result.arguments.contains("command") || !result.arguments["command"].is_string() ||
        result.arguments["command"].get<std::string>().empty()) {
        result.error = "command must be a non-empty string.";
        return result;
    }
    const auto command = result.arguments["command"].get<std::string>();
    result.classification = classify_command(command, platform);
    auto rule = rules.evaluate(result.classification);
    const auto configured = permissions.matched_rule("bash", "", command);
    if (configured == RuleAction::Deny) rule.decision = RuleDecision::Forbidden;
    else if (configured == RuleAction::Allow && rule.decision == RuleDecision::NoMatch &&
             result.classification.split_safely) rule.decision = RuleDecision::Allow;

    if (result.classification.split_safely) {
        for (const auto& segment : result.classification.segments) {
            auto prefix = always_allow_prefix_for_segment(segment);
            if (prefix.empty()) { result.prefixes.clear(); break; }
            result.prefixes.push_back(std::move(prefix));
        }
    }
    const auto remembered = permissions.session_command_allow(result.prefixes);
    result.input.mode = permissions.mode();
    result.input.dangerous_mode = permissions.is_dangerous();
    result.input.kind = result.classification.kind;
    result.input.rule = rule.decision;
    result.input.escalation_requested = result.arguments.value("with_escalated_permissions", false);
    result.input.session_allow = remembered == SessionCommandAllow::Bypass ? SessionAllowKind::Bypass :
        remembered == SessionCommandAllow::Sandboxed ? SessionAllowKind::Sandboxed : SessionAllowKind::None;
    result.set_availability(sandbox_available);
    return result;
}

bool is_exec_rules_path(const std::string& path) {
    std::string normalized = "/" + path;
    std::replace(normalized.begin(), normalized.end(), '\\', '/');
#ifdef _WIN32
    for (char& c : normalized) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
#endif
    normalized += '/';
    return normalized.find("/.acecode/rules/") != std::string::npos;
}

} // namespace acecode::sandbox
