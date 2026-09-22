#pragma once

// 「工具前言」设置(Settings > 开发者模式 > 工具前言,openspec add-tool-preamble)
// 的 REST 纯函数层:GET 快照与 PUT 解析。IO / 锁 / 下发在 routes_tool_preamble.cpp。

#include "../../config/config.hpp"

#include <nlohmann/json.hpp>

#include <string>
#include <vector>

namespace acecode::web {

// GET /api/config/tool-preamble 的响应体:
//   {enabled, mode, sidecar_model, sidecar_wait_ms, modes:[prompt,reasoning,sidecar],
//    saved_models:[name...]}
// saved_models 给设置页的旁路模型下拉用(空串 = 沿用会话模型,由前端表达)。
nlohmann::json tool_preamble_snapshot(
    const ToolPreambleConfig& cfg,
    const std::vector<std::string>& saved_model_names);

// 解析 PUT body。语义是 patch:缺省键沿用 current;出现的键必须类型正确且合法
// (mode ∈ prompt|reasoning|sidecar;sidecar_model 为空或存在于 saved_model_names;
// sidecar_wait_ms ∈ [0, 15000])。失败时 out 不变、error 是给用户看的文案。
bool parse_tool_preamble_request(
    const nlohmann::json& body,
    const ToolPreambleConfig& current,
    const std::vector<std::string>& saved_model_names,
    ToolPreambleConfig& out,
    std::string& error);

} // namespace acecode::web
