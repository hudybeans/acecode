// 覆盖 src/tool_preamble/tool_preamble.cpp 的纯逻辑(openspec add-tool-preamble):
//   1. 推理加粗抠取 / 标题规整 / 推理首句兜底(reasoning 模式)
//   2. <text_preamble> 流式扫描器(prompt 模式):整段、任意字节切分、缺闭合、
//      空标签、大小写、type 解析、前导空白吞掉、超长正文封顶、reset
//   3. strip_text_preamble_tags(渲染层剥标签)与扫描器同款规则
// 回归背景:参数版(每次调用必填 preamble 参数)被用户否掉,改成模型在阶段变化
// 时用标签写一句;标签正文只进 loading,不进正文气泡,落盘正文保留原文。

#include <gtest/gtest.h>

#include "tool_preamble/tool_preamble.hpp"

#include <string>
#include <vector>

using namespace acecode::tool_preamble;

namespace {

struct Collected {
    std::string visible;
    std::vector<TextPreamble> preambles;
};

void absorb(Collected& into, TextPreambleScanner::Output out) {
    into.visible += out.visible;
    for (auto& p : out.preambles) into.preambles.push_back(std::move(p));
}

// 按给定块大小喂完整段文本再 flush,返回汇总结果。
Collected scan_in_chunks(const std::string& text, std::size_t chunk) {
    TextPreambleScanner scanner;
    Collected got;
    for (std::size_t i = 0; i < text.size(); i += chunk) {
        absorb(got, scanner.feed(text.substr(i, chunk)));
    }
    absorb(got, scanner.flush());
    return got;
}

}  // namespace

// 场景:推理摘要 / 首句相关的纯字符串逻辑(reasoning 模式沿用)。
// 期望:第一对闭合加粗;空加粗跳过找下一对;没有闭合返回空;规整会去掉包裹
// 记号 / 列表记号 / 尾标点并按 code point 截断;推理首句去掉 "Okay, " 之类填充。
TEST(ToolPreambleText, ReasoningHelpers) {
    EXPECT_EQ(extract_first_bold_span("**Reading registry sections**\n\nI'm looking at the loader."),
              "Reading registry sections");
    EXPECT_EQ(extract_first_bold_span("** ** **Second**"), "Second");
    EXPECT_EQ(extract_first_bold_span("**never closed"), "");
    EXPECT_EQ(normalize_title_line("  - \"Reading   the loader\":  ", 60), "Reading the loader");
    EXPECT_EQ(normalize_title_line("abcdefghij", 4), "abcd\xE2\x80\xA6");
    EXPECT_EQ(title_from_reasoning("**Reading registry sections.**\n\nOkay, the user wants..."),
              "Reading registry sections");
    EXPECT_EQ(title_from_reasoning("Okay, I need to inspect the loader first. Then compare."),
              "inspect the loader first");
    EXPECT_EQ(title_from_reasoning(""), "");
    EXPECT_TRUE(is_valid_mode("prompt"));
    EXPECT_TRUE(is_valid_mode("reasoning"));
    EXPECT_FALSE(is_valid_mode("sidecar"));
    EXPECT_FALSE(is_valid_mode("auto"));
}

// 场景:一段增量里就是完整标签 + 空行 + 正文。期望:标签正文成为前言(kind=read),
// 可见正文只有后面那句,标签后紧跟的 "\n\n" 被吞掉。
TEST(ToolPreambleScanner, WholeTagInOneDeltaBecomesPreambleNotText) {
    TextPreambleScanner scanner;
    const auto out = scanner.feed(
        "<text_preamble type=\"read\">Reading the loader</text_preamble>\n\nNow calling tools.");
    ASSERT_EQ(out.preambles.size(), 1u);
    EXPECT_EQ(out.preambles[0].title, "Reading the loader");
    EXPECT_EQ(out.preambles[0].kind, "read");
    EXPECT_EQ(out.visible, "Now calling tools.");
}

// 场景:同一段文本按 1 / 2 / 3 / 7 字节切块喂给扫描器(模拟任意 token 边界,
// 包括切在 "<text_pre" 与 "</text_pre" 中间)。期望:每种切法得到的前言与可见正文
// 都和一次性喂入完全一致 —— 这是「参数版比它先出现」以外最容易出错的地方。
TEST(ToolPreambleScanner, SplitAtAnyByteBoundaryIsStable) {
    const std::string text =
        "Hello <text_preamble type='write'>Editing config.cpp</text_preamble>\nDone";
    const Collected whole = scan_in_chunks(text, text.size());
    ASSERT_EQ(whole.preambles.size(), 1u);
    EXPECT_EQ(whole.preambles[0].title, "Editing config.cpp");
    EXPECT_EQ(whole.preambles[0].kind, "write");
    EXPECT_EQ(whole.visible, "Hello Done");
    for (const std::size_t chunk : {1u, 2u, 3u, 7u}) {
        const Collected got = scan_in_chunks(text, chunk);
        ASSERT_EQ(got.preambles.size(), 1u) << "chunk=" << chunk;
        EXPECT_EQ(got.preambles[0].title, whole.preambles[0].title) << "chunk=" << chunk;
        EXPECT_EQ(got.preambles[0].kind, whole.preambles[0].kind) << "chunk=" << chunk;
        EXPECT_EQ(got.visible, whole.visible) << "chunk=" << chunk;
    }
    // 中文正文同样不会被切坏(多字节序列在增量边界上也照常拼接)。
    const std::string cjk =
        "<text_preamble type=\"read\">正在读取注册表段落</text_preamble>\n\n继续。";
    for (const std::size_t chunk : {1u, 2u, 5u}) {
        const Collected got = scan_in_chunks(cjk, chunk);
        ASSERT_EQ(got.preambles.size(), 1u);
        EXPECT_EQ(got.preambles[0].title, "正在读取注册表段落");
        EXPECT_EQ(got.visible, "继续。");
    }
}

// 场景:模型忘了闭合标签,正文换行后直接写别的。期望:换行处当作闭合,前言是
// 第一行,后面的文字照常可见;标签后紧跟的换行(先写标签再换行写正文)不算闭合。
TEST(ToolPreambleScanner, MissingCloseTagEndsAtNewline) {
    const Collected got = scan_in_chunks("<text_preamble>Scanning tests\nThen text", 4);
    ASSERT_EQ(got.preambles.size(), 1u);
    EXPECT_EQ(got.preambles[0].title, "Scanning tests");
    EXPECT_EQ(got.preambles[0].kind, "");
    EXPECT_EQ(got.visible, "Then text");

    const Collected multiline = scan_in_chunks(
        "<text_preamble type=\"read\">\nReading A\n</text_preamble>\n\nBody", 3);
    ASSERT_EQ(multiline.preambles.size(), 1u);
    EXPECT_EQ(multiline.preambles[0].title, "Reading A");
    EXPECT_EQ(multiline.visible, "Body");
}

// 场景:标签正文按换行提前闭合后,模型又补写了 `</text_preamble>`(常见:
// "<text_preamble>Reading A\n</text_preamble>\n\nText" 分段到达)。
// 期望:孤立的闭合标签被丢掉,不出现在可见正文里。
TEST(ToolPreambleScanner, StrayCloseTagIsDropped) {
    for (const std::size_t chunk : {1u, 6u, 64u}) {
        const Collected got = scan_in_chunks(
            "<text_preamble>Reading A\n</text_preamble>\n\nText", chunk);
        ASSERT_EQ(got.preambles.size(), 1u) << "chunk=" << chunk;
        EXPECT_EQ(got.preambles[0].title, "Reading A") << "chunk=" << chunk;
        EXPECT_EQ(got.visible, "Text") << "chunk=" << chunk;
    }
}

// 场景:流在标签正文中途结束(模型被中断 / 忘了闭合且没换行)。
// 期望:flush 把已有正文当前言;半截开标签 "<text_pre" 则按普通文本放行。
TEST(ToolPreambleScanner, FlushSettlesHeldBytes) {
    TextPreambleScanner scanner;
    Collected got;
    absorb(got, scanner.feed("<text_preamble type=\"read\">Reading"));
    EXPECT_TRUE(got.preambles.empty());
    EXPECT_TRUE(got.visible.empty());
    absorb(got, scanner.flush());
    ASSERT_EQ(got.preambles.size(), 1u);
    EXPECT_EQ(got.preambles[0].title, "Reading");

    TextPreambleScanner partial;
    Collected held;
    absorb(held, partial.feed("Look: <text_pre"));
    EXPECT_EQ(held.visible, "Look: ");
    absorb(held, partial.flush());
    EXPECT_EQ(held.visible, "Look: <text_pre");
    EXPECT_TRUE(held.preambles.empty());
}

// 场景:长得像但不是我们的标签:"<text_preambleX>" / "<textarea>",以及正文里
// 的普通 "<"。期望:全部原样可见,不产生前言。
TEST(ToolPreambleScanner, LookalikesPassThrough) {
    const Collected got = scan_in_chunks("a < b, <textarea>x</textarea>, <text_preambleX>y", 5);
    EXPECT_TRUE(got.preambles.empty());
    EXPECT_EQ(got.visible, "a < b, <textarea>x</textarea>, <text_preambleX>y");
}

// 场景:空标签 `<text_preamble/>`、正文为空的标签、只有标点的标签。
// 期望:不产生前言,后面的正文照常可见(空标签后的空白也吞掉)。
TEST(ToolPreambleScanner, EmptyTagsAreSkipped) {
    const Collected self_closing = scan_in_chunks("<text_preamble/>\nHi", 3);
    EXPECT_TRUE(self_closing.preambles.empty());
    EXPECT_EQ(self_closing.visible, "Hi");
    const Collected empty_body = scan_in_chunks(
        "<text_preamble type=\"read\"></text_preamble>Hi", 2);
    EXPECT_TRUE(empty_body.preambles.empty());
    EXPECT_EQ(empty_body.visible, "Hi");
    const Collected blank_body = scan_in_chunks("<text_preamble>  \t </text_preamble>Hi", 64);
    EXPECT_TRUE(blank_body.preambles.empty());
    EXPECT_EQ(blank_body.visible, "Hi");
}

// 场景:type 的各种写法。期望:引号 / 单引号 / 裸值都认,大小写不敏感;不是
// read / write 的当没写;标签名大小写也不敏感。
TEST(ToolPreambleScanner, KindParsingIsLenient) {
    const auto kind_of = [](const std::string& text) {
        const Collected got = scan_in_chunks(text, 64);
        return got.preambles.empty() ? std::string("<none>") : got.preambles[0].kind;
    };
    EXPECT_EQ(kind_of("<text_preamble type=\"Write\">x</text_preamble>"), "write");
    EXPECT_EQ(kind_of("<text_preamble type=read>x</text_preamble>"), "read");
    EXPECT_EQ(kind_of("<text_preamble type='read' >x</text_preamble>"), "read");
    EXPECT_EQ(kind_of("<text_preamble type=\"verify\">x</text_preamble>"), "");
    EXPECT_EQ(kind_of("<text_preamble>x</text_preamble>"), "");
    EXPECT_EQ(kind_of("<TEXT_PREAMBLE Type=\"READ\">x</TEXT_PREAMBLE>"), "read");
}

// 场景:标签正文带多余空白 / 尾句号,以及超过 200 个 code point 的正文。
// 期望:折叠空白、去尾标点;超长按 code point 截断并补 "…"。
TEST(ToolPreambleScanner, BodyIsNormalizedAndCapped) {
    const Collected got = scan_in_chunks(
        "<text_preamble type=\"read\">  Reading   the loader. </text_preamble>", 64);
    ASSERT_EQ(got.preambles.size(), 1u);
    EXPECT_EQ(got.preambles[0].title, "Reading the loader");

    const std::string long_body(300, 'a');
    const Collected capped = scan_in_chunks(
        "<text_preamble type=\"read\">" + long_body + "</text_preamble>", 64);
    ASSERT_EQ(capped.preambles.size(), 1u);
    EXPECT_EQ(capped.preambles[0].title, std::string(kTextPreambleMaxCodePoints, 'a') + "\xE2\x80\xA6");
}

// 场景:标签正文流了 1300 字节既没闭合也没换行(模型跑偏)。期望:到
// kTextPreambleMaxBodyBytes 就当闭合(前言按 code point 截断),之后的字节回到
// 可见正文,不会把整段回答都吞进 loading。
TEST(ToolPreambleScanner, OversizedBodyWithoutNewlineIsCut) {
    const std::string body(1300, 'b');
    const Collected got = scan_in_chunks("<text_preamble>" + body, 100);
    ASSERT_EQ(got.preambles.size(), 1u);
    EXPECT_EQ(got.preambles[0].title, std::string(kTextPreambleMaxCodePoints, 'b') + "\xE2\x80\xA6");
    EXPECT_EQ(got.visible.size(), 1300u - kTextPreambleMaxBodyBytes);
}

// 场景:流开头的空白与正文中间的空白。期望:只有第一个可见字符之前的空白被
// 吞掉(否则界面会为一段 "\n" 建一条空气泡),之后的换行原样透传;reset 后扣住
// 的半截标签被丢弃。
TEST(ToolPreambleScanner, LeadingWhitespaceSwallowedOnceAndResetDropsHeldBytes) {
    const Collected got = scan_in_chunks("\n\nHello\n\nWorld", 3);
    EXPECT_TRUE(got.preambles.empty());
    EXPECT_EQ(got.visible, "Hello\n\nWorld");

    TextPreambleScanner scanner;
    (void)scanner.feed("<text_preamble>partial");
    scanner.reset();
    Collected after;
    absorb(after, scanner.feed("Hi"));
    absorb(after, scanner.flush());
    EXPECT_TRUE(after.preambles.empty());
    EXPECT_EQ(after.visible, "Hi");
}

// 场景:渲染层整段剥标签(TUI 回放 / on_message 完整正文)。期望:与扫描器同款
// 规则;没有标签的文本逐字节原样返回(含前导空白,不能误伤普通正文);多个标签
// 各自剥掉;整段都是标签时返回空串。
TEST(ToolPreambleStrip, StripsTagsAndLeavesPlainTextUntouched) {
    EXPECT_EQ(strip_text_preamble_tags("  plain\ntext "), "  plain\ntext ");
    EXPECT_EQ(strip_text_preamble_tags(""), "");
    EXPECT_EQ(strip_text_preamble_tags(
                  "<text_preamble type=\"read\">Reading A</text_preamble>\n\nFirst.\n\n"
                  "<text_preamble type=\"write\">Editing B</text_preamble>\n\nSecond."),
              "First.\n\nSecond.");
    EXPECT_EQ(strip_text_preamble_tags(
                  "<text_preamble type=\"read\">Reading A</text_preamble>\n\n"), "");
    EXPECT_EQ(strip_text_preamble_tags("<text_preamble>No close\nVisible"), "Visible");
}
