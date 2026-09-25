#pragma once

// 工具前言(openspec add-tool-preamble):模型在多步工具任务里给用户的一句
// 「正在做什么」,等待时显示在 loading 行上,代替笼统的「正在处理」。两种来源,
// 由 config.agent_loop.tool_preamble.mode 选择:
//   prompt    提示驱动:系统提示要求模型在第一次工具调用前、以及阶段 / 计划
//             变化时,用 <text_preamble type="read|write">一句话</text_preamble>
//             标出一句前言。daemon 在流式期间识别这个标签:标签正文进 loading,
//             不进正文气泡;标签本身留在落盘的 assistant 正文里(模型会模仿自己
//             的历史输出,剥掉历史反而让它几轮后忘记格式),渲染层再剥。
//   reasoning 推理服务内置摘要:从 provider 流回的推理摘要里抠第一对 **加粗**
//             (OpenAI Responses / Codex app-server / Gemini 的摘要都以此开头),
//             没有加粗则取推理首句兜底(Codex TUI extract_first_bold 同款)。
// 两种来源都只维护一条「当前阶段前言」:新前言替换旧的,未加标签的可见正文
// 出现即清空;它随每个工具批次以 metadata.tool_preamble = {source, title, kind}
// 落盘,并经 tool_start.preamble / agent_progress 送到界面。落定之后不再显示。
// 本文件只放纯字符串逻辑(无 IO / 无 provider 依赖),进 acecode_testable 单测。

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

namespace acecode::tool_preamble {

inline constexpr const char* kModePrompt = "prompt";
inline constexpr const char* kModeReasoning = "reasoning";
// assistant 消息 metadata 子键:{"title": "...", "source": "prompt|reasoning", "kind": "read|write|"}
inline constexpr const char* kMetadataKey = "tool_preamble";

// 提示驱动模式的标签名与 type 取值。kind 目前只解析并透传(tool_start.preamble_kind /
// metadata.kind / agent_progress.preamble.kind),界面上的「读放大镜 / 写笔触」效果
// 留给以后接。
inline constexpr const char* kTagName = "text_preamble";
inline constexpr const char* kKindRead = "read";
inline constexpr const char* kKindWrite = "write";

// 标题长度上限(Unicode code point)。加粗摘要 60;标签正文放宽到 200 ——
// 「已核实的结果 + 下一步」天然比一句短语长,再长界面自己截。
inline constexpr std::size_t kReasoningTitleMaxCodePoints = 60;
inline constexpr std::size_t kTextPreambleMaxCodePoints = 200;
// 标签体流了这么多字节还没闭合、也没换行,就按到此为止处理(防模型忘了闭合
// 把整段回答都吞进 loading)。
inline constexpr std::size_t kTextPreambleMaxBodyBytes = 1200;

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

// 按 code point 截断(前缀 + "…")。
std::string truncate_code_points(const std::string& text, std::size_t max_code_points);

// ---- prompt 模式:流式识别 <text_preamble> 标签 ----

struct TextPreamble {
    std::string title;   // 规整后的标签正文(空 = 标签没有可用内容)
    std::string kind;    // "read" / "write" / ""(没写 type 或写了别的)
};

// 流式扫描器:把模型正文的增量切成「可见正文」与「前言」。
//   - `<text_preamble type="read">…</text_preamble>` 整段不进可见正文;闭合标签
//     一到就产出一条 TextPreamble(所以 loading 能在工具调用流出来之前换文案)。
//   - 开标签可能被切在任意字节处:尾部是 "<text_preamble" 的前缀时先扣住,
//     等下一段增量再判;不是标签的 "<" 原样放行。
//   - 宽松:没写 type 也认;`</text_preamble>` 缺失时正文遇到换行就当闭合;
//     正文超过 kTextPreambleMaxBodyBytes 仍未闭合也当闭合;`<text_preamble/>`
//     空标签直接跳过;标签名大小写不敏感。
//   - 流开头与每个闭合标签之后紧跟的空白(通常是 "\n\n")一并吞掉,免得界面
//     为一段空白建一条空气泡;第一个非空白可见字符之后恢复原样透传。
//   - flush():流结束时把扣住的字节结清 —— 没闭合的标签正文仍算前言,
//     只是半截开标签("<text_pre")按普通文本放行。
class TextPreambleScanner {
public:
    struct Output {
        std::string visible;                 // 可以直接当 token 下发的正文
        std::vector<TextPreamble> preambles; // 本次增量里闭合的标签(通常 0 或 1 条)
    };

    Output feed(std::string_view delta);
    Output flush();
    void reset();

private:
    void drain(Output& out, bool at_end);
    void emit_visible(Output& out, std::string_view text);
    void close_tag(Output& out, std::string_view body);

    std::string pending_;      // 扣住的字节:半截开标签,或未闭合的标签正文
    bool in_tag_ = false;      // pending_ 是不是标签正文
    std::string kind_;         // 当前开标签的 type
    bool swallow_leading_ws_ = true;
};

// 整段文本剥掉标签(渲染层用:TUI 回放 / on_message 的完整正文、导出等;Web 端
// 在 toolPreamble.js 里有同款)。就是「喂给一个新扫描器再 flush」。
std::string strip_text_preamble_tags(const std::string& text);

} // namespace acecode::tool_preamble
