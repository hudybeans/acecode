#pragma once

#include "exec_decision.hpp"
#include <nlohmann/json.hpp>

namespace acecode::sandbox {

// 权限门和独立 bash 调用共享参数校验,确保错误请求不会先弹确认。
std::string validate_escalation_arguments(const nlohmann::json& args);

struct ExecPermission {
    ExecDecisionInput input;
    ExecDecision decision;
    CommandClassification classification;
    std::vector<std::string> prefixes;
    nlohmann::json arguments;
    std::string error;

    void set_availability(bool available);
};

ExecPermission evaluate_exec_permission(const std::string& arguments,
                                        const PermissionManager& permissions,
                                        const ExecRules& rules, bool sandbox_available,
                                        CommandPlatform platform = host_command_platform());

// 不依赖 cwd 的规则目录名称检测;调用者同时检查解析后的绝对路径。
bool is_exec_rules_path(const std::string& path);

} // namespace acecode::sandbox
