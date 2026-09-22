#pragma once

// 工具前言 sidecar 模式的 provider 侧(openspec add-tool-preamble):
// 解析用哪个 saved model 出标题、构造一次性 provider、调一次 chat 拿标签。
// 与 session_auto_title 同套路:独立的 ephemeral provider,不写会话 binding。
// 纯字符串部分在 src/tool_preamble/tool_preamble.hpp。

#include "../config/config.hpp"
#include "../provider/llm_provider.hpp"
#include "../tool_preamble/tool_preamble.hpp"

#include <memory>
#include <optional>
#include <string>

namespace acecode {

// 解析顺序:config.agent_loop.tool_preamble.sidecar_model(显式指定,找不到
// 则 WARN 后继续往下)> 会话当前模型 > cwd 覆盖 / 默认模型。全部落空返回 nullopt
// (此时 sidecar 静默不出标题,工具批次退回模板汇总)。
std::optional<ModelProfile> resolve_tool_preamble_sidecar_profile(
    const AppConfig& cfg,
    const std::string& session_model_name,
    const std::string& cwd);

// 一次性 provider:openai 系的流超时封顶到 kToolPreambleSidecarTimeoutMs,
// 一个心跳标签不该拖住主回合。
inline constexpr int kToolPreambleSidecarTimeoutMs = 8000;
std::shared_ptr<LlmProvider> create_tool_preamble_sidecar_provider(
    ModelProfile profile,
    const AppConfig& cfg);

// 调一次 chat 出标题;provider 报错 / 输出不可用 → nullopt。
std::optional<std::string> generate_tool_preamble_title(
    LlmProvider& provider,
    const tool_preamble::SidecarSummaryInput& input);

} // namespace acecode
