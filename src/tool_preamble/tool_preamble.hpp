#pragma once

// 工具前言(openspec add-tool-preamble):给每个「工具调用批次」配一条短标题,
// 让用户在等待时看到「正在读取注册表段落」这种有指向性的文字,而不是笼统的
// 「正在处理」。三种来源,由 config.agent_loop.tool_preamble.mode 选择:
//   prompt    提示驱动:系统提示要求模型在含工具调用的同一条消息里先写一句
//             8~12 词的前言,那句话就是标题(Codex prompt.md 的 preamble)。
//   reasoning 推理服务内置摘要:从 provider 流回的推理摘要里抠第一对 **加粗**
//             (OpenAI Responses / Codex app-server / Gemini 的摘要都以此开头),
//             没有加粗则取推理首句兜底(Codex TUI extract_first_bold 同款)。
//   sidecar   旁路模型摘要:把本步的用户请求 + assistant 正文 + 即将执行的
//             工具调用喂给一个小模型,让它出 3~8 词的标签。
// 本文件只放纯字符串逻辑(无 IO / 无 provider 依赖),进 acecode_testable 单测。
// 标题以 metadata.tool_preamble = {title, source} 挂在 assistant(tool_calls)
// 消息上落盘,Web / TUI 据此把工具批次折成带标题的分组。

#include "../provider/llm_provider.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace acecode::tool_preamble {

inline constexpr const char* kModePrompt = "prompt";
inline constexpr const char* kModeReasoning = "reasoning";
inline constexpr const char* kModeSidecar = "sidecar";
// assistant 消息 metadata 子键:{"title": "...", "source": "prompt|reasoning|sidecar"}
inline constexpr const char* kMetadataKey = "tool_preamble";

// 标题长度上限(Unicode code point)。加粗摘要 / 旁路输出 60,提示前言 120:
// 提示前言是模型面向用户写的一句话,放宽一些;超过 160 的正文直接不算前言。
inline constexpr std::size_t kReasoningTitleMaxCodePoints = 60;
inline constexpr std::size_t kSidecarTitleMaxCodePoints = 60;
inline constexpr std::size_t kPromptTitleMaxCodePoints = 120;
inline constexpr std::size_t kPromptTextMaxCodePoints = 160;

bool is_valid_mode(const std::string& mode);

// Codex TUI extract_first_bold 同款:第一对闭合的 `**…**`,内文 trim 后非空
// 即返回;没有闭合或内文为空则继续往后找;找不到返回空串。
std::string extract_first_bold_span(const std::string& text);

// 通用规整:换行 / 制表符压成空格、折叠连续空白、去掉包裹的引号 / 反引号 /
// 加粗记号 / 标题井号 / 列表记号、去掉末尾的冒号 / 句号 / 省略号,再按
// code point 截断(截断处追加 "…")。返回空串表示没有可用文本。
std::string normalize_title_line(const std::string& text, std::size_t max_code_points);

// reasoning 模式:加粗优先;否则取推理首行首句,去掉 "Okay," / "好的，" 之类
// 的口头填充,截到 kReasoningTitleMaxCodePoints。不足 2 个 code point 视为无标题。
std::string title_from_reasoning(const std::string& reasoning);

// prompt 模式:assistant 正文是否是一条合格前言 —— 单个非空行、不含代码围栏、
// 不超过 kPromptTextMaxCodePoints;合格则返回规整后的那一行,否则空串
// (长段落保持普通正文,不当标题)。
std::string title_from_assistant_text(const std::string& text);

// sidecar 模式:小模型的原始输出 → 标题。取第一个非空行,去掉 "Title:" /
// "标题：" 之类的前缀标签,provider 错误标记([Error] / [Aborted])一律判无效。
std::string sanitize_sidecar_title(const std::string& raw);

struct SidecarSummaryInput {
    struct Call {
        std::string name;
        std::string args_preview;   // 参数 JSON 的前缀,构造时会再截断
    };
    std::string user_request;       // 最近一条用户消息(可空)
    std::string assistant_text;     // 本步 assistant 正文(可空)
    std::vector<Call> calls;        // 即将执行的工具调用(可能只有流式期间已知的第一个)
};

// 旁路摘要的请求消息:一条 system(角色 + 输出规则)+ 一条 user(本步材料)。
// 材料按 code point 截断:用户请求 / assistant 正文各 400,每个参数预览 200,
// 最多 8 个调用 —— 这是个心跳标签,不值得多花 token。
std::vector<ChatMessage> build_sidecar_messages(const SidecarSummaryInput& input);

// 供调用方构造材料时用的同款截断(前缀 + "…")。
std::string truncate_code_points(const std::string& text, std::size_t max_code_points);

// ---- prompt 模式 = 工具调用参数 ----
// 不是「先说一句话再调工具」(那会先流出一个气泡、批次开始才搬进 loading),而是
// 给每个工具定义注入一个 `preamble` 字符串参数,模型在每次调用里填一句;参数
// 一流出来就当 loading 文案,执行前剥掉,工具本身永远看不到它。
inline constexpr const char* kToolParameterName = "preamble";

// 工具定义自己是否声明了 `preamble` 参数(properties 里已有同名键)。这种工具的
// `preamble` 是它的真实入参(MCP 工具可能撞名):注入跳过它,执行前也不能把它
// 当前言剥掉。
bool definition_declares_preamble(const ToolDef& definition);

// 给每个工具定义注入 `preamble` 参数(properties 里加一项,不进 required)。
// 工具自己已有同名参数则跳过。返回注入的个数。
std::size_t inject_preamble_parameter(std::vector<ToolDef>& definitions);

// 从流式的参数 JSON 前缀里抽 `"preamble":"…"` 的值:键与整个字符串值都已到齐
// 才返回(处理转义),否则空串。只认对象顶层的键(前一个非空白字符是 { 或 ,)。
std::string extract_preamble_from_partial_arguments(const std::string& partial_json);

// 从完整参数 JSON 里取出并剥掉 `preamble`:返回规整后的标题(空 = 没有),
// arguments 被改写为去掉该键的 JSON;非法 JSON / 非对象原样不动。
std::string strip_preamble_parameter(std::string& arguments);

} // namespace acecode::tool_preamble
