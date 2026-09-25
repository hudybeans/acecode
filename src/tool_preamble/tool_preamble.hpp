#pragma once

// 具体进度提示(openspec add-tool-preamble,设置 > 常规 > 工作模式 > 适合日常工作):
// 等待时 loading 行只说「正在做什么」,不带参数(参数留在工具行),代替
// 「正在推理」「正在调用工具 bash」这类笼统或技术化的文案。文案来源按优先级:
//   1. 推理加粗标题:provider 流回的推理摘要里第一对 **加粗**(OpenAI Responses /
//      Codex app-server / Gemini 的摘要都以此开头),只对本模型步有效;
//   2. 工具模板:按本批次的原生工具名拼现在进行时短语(「正在读取 3 个文件并搜索代码」);
//   3. 场景文案:回合开头「正在分析你的请求」,一批工具跑完后按这批工具的类型
//      (「正在分析文件内容」「正在分析命令输出」…),正文开始流出时「正在撰写回复」。
// 不要求模型额外输出任何东西。曾经的三版(先说一句话 / 必填 preamble 参数 /
// <text_preamble> 标签)都靠模型配合,grok 等模型不照做,已全部撤掉;标签扫描器
// 保留,只用来把历史里残留的标签从界面上剥掉。
// 本文件只放纯字符串逻辑(无 IO / 无 provider 依赖),进 acecode_testable 单测。

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

namespace acecode::tool_preamble {

// 文案来源(agent_progress.preamble.source / tool_start.preamble_source /
// metadata.tool_preamble.source)。
inline constexpr const char* kSourceReasoning = "reasoning";
inline constexpr const char* kSourceTemplate = "template";
inline constexpr const char* kSourceContext = "context";
// assistant(tool_calls) 消息 metadata 子键:{"title","source","kind"},只作记录。
inline constexpr const char* kMetadataKey = "tool_preamble";

// 历史标签的标签名与 type 取值(扫描器只用来剥标签)。kind 由工具类型决定
// (读 / 写),透传给界面,「读放大镜 / 写笔触」效果留给以后接。
inline constexpr const char* kTagName = "text_preamble";
inline constexpr const char* kKindRead = "read";
inline constexpr const char* kKindWrite = "write";

// 场景文案。
inline constexpr const char* kActivityPrefix = "\xE6\xAD\xA3\xE5\x9C\xA8";  // 正在
inline constexpr const char* kInitialActivityLabel =
    "\xE6\xAD\xA3\xE5\x9C\xA8\xE5\x88\x86\xE6\x9E\x90\xE4\xBD\xA0\xE7\x9A\x84\xE8\xAF\xB7\xE6\xB1\x82";  // 正在分析你的请求
inline constexpr const char* kRespondingActivityLabel =
    "\xE6\xAD\xA3\xE5\x9C\xA8\xE6\x92\xB0\xE5\x86\x99\xE5\x9B\x9E\xE5\xA4\x8D";  // 正在撰写回复

// 标题长度上限(Unicode code point)。加粗摘要 60;标签正文 200(扫描器规整用)。
inline constexpr std::size_t kReasoningTitleMaxCodePoints = 60;
inline constexpr std::size_t kTextPreambleMaxCodePoints = 200;
// 标签体流了这么多字节还没闭合、也没换行,就按到此为止处理(防模型忘了闭合
// 把整段回答都吞进 loading)。
inline constexpr std::size_t kTextPreambleMaxBodyBytes = 1200;

// Codex TUI extract_first_bold 同款:第一对闭合的 `**…**`,内文 trim 后非空
// 即返回;没有闭合或内文为空则继续往后找;找不到返回空串。
std::string extract_first_bold_span(const std::string& text);

// 通用规整:换行 / 制表符压成空格、折叠连续空白、去掉包裹的引号 / 反引号 /
// 加粗记号 / 标题井号 / 列表记号、去掉末尾的冒号 / 句号 / 省略号,再按
// code point 截断(截断处追加 "…")。返回空串表示没有可用文本。
std::string normalize_title_line(const std::string& text, std::size_t max_code_points);

// 按 code point 截断(前缀 + "…")。
std::string truncate_code_points(const std::string& text, std::size_t max_code_points);

// ---- 工具模板 ----

// 本批次(同一模型步的全部工具调用,原生名)的现在进行时文案,不带任何参数:
// 同类合并计数(「正在读取 3 个文件」),两类用「并」连接,三类及以上取前两类
// 加「等」;MCP 与没列出的工具归入「调用工具」。空列表返回空串。
std::string batch_activity_label(const std::vector<std::string>& native_tool_names);
// 这批工具跑完、模型在想下一步时的文案,按第一类工具定(「正在分析文件内容」)。
std::string after_batch_activity_label(const std::vector<std::string>& native_tool_names);
// 本批次的读写属性:有写类工具即 write;全是读类工具为 read;否则空串。
std::string batch_activity_kind(const std::vector<std::string>& native_tool_names);

// ---- 历史里残留的 <text_preamble> 标签:流式识别并剥掉 ----

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
