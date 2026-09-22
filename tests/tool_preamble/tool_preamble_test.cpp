// 覆盖 src/tool_preamble/tool_preamble.{hpp,cpp} 的纯字符串逻辑(openspec
// add-tool-preamble):
//   1. extract_first_bold_span:Codex TUI extract_first_bold 同款的加粗抠取
//   2. title_from_reasoning:加粗优先 → 首句兜底 → 去口头填充 → 截断
//   3. title_from_assistant_text:提示驱动模式下「哪句正文算前言」
//   4. sanitize_sidecar_title:小模型原始输出的清洗与拒收
//   5. build_sidecar_messages:旁路请求材料的截断与结构
//   6. normalize_title_line / truncate_code_points 的 UTF-8 安全性

#include <gtest/gtest.h>

#include "tool_preamble/tool_preamble.hpp"

#include <string>

using namespace acecode::tool_preamble;

// 场景:OpenAI Responses / Codex app-server 风格的推理摘要,首行是 **标题**,
// 后面跟散文。期望:抠出标题本体(不含星号、已 trim)。
TEST(ToolPreambleBold, ExtractsFirstClosedBoldSpan) {
    EXPECT_EQ(extract_first_bold_span("**Reading registry sections**\n\nI'm looking at the loader."),
              "Reading registry sections");
    EXPECT_EQ(extract_first_bold_span("prefix text **  Checking loader  ** tail"),
              "Checking loader");
}

// 场景:加粗没有闭合(流式期间只到了 "**Reading regi")或内文为空("****")。
// 期望:未闭合返回空(等下一段 delta 再试),空内文跳过后继续找下一对。
TEST(ToolPreambleBold, UnclosedOrEmptyBoldIsSkipped) {
    EXPECT_EQ(extract_first_bold_span("**Reading regi"), "");
    EXPECT_EQ(extract_first_bold_span("**** **Real title** rest"), "Real title");
    EXPECT_EQ(extract_first_bold_span("no bold here"), "");
}

// 场景:reasoning 模式,摘要带加粗标题。期望:标题就是加粗内文,不受后面
// 散文影响;末尾句号被去掉。
TEST(ToolPreambleReasoning, PrefersBoldTitle) {
    EXPECT_EQ(title_from_reasoning("**Reading registry sections.**\n\nOkay, the user wants..."),
              "Reading registry sections");
}

// 场景:DeepSeek / Anthropic 风格的原始思维链,没有加粗,首句是 "Okay, the user
// wants me to check the expert loader. Then I..."。期望:去掉 "Okay, " 这类填充
// 后取首句 "the user wants me to check the expert loader"。
TEST(ToolPreambleReasoning, FallsBackToFirstSentenceWithoutFillers) {
    EXPECT_EQ(title_from_reasoning("Okay, the user wants me to check the expert loader. Then I need to look at the registry."),
              "the user wants me to check the expert loader");
    // 中文填充与中文句末标点同样生效。
    EXPECT_EQ(title_from_reasoning("\xE5\xA5\xBD\xE7\x9A\x84\xEF\xBC\x8C\xE5\x85\x88\xE7\x9C\x8B\xE6\xB3\xA8\xE5\x86\x8C\xE8\xA1\xA8\xE3\x80\x82\xE7\x84\xB6\xE5\x90\x8E..."),
              "\xE5\x85\x88\xE7\x9C\x8B\xE6\xB3\xA8\xE5\x86\x8C\xE8\xA1\xA8");   // 好的，先看注册表。然后... → 先看注册表
}

// 场景:首句超过 kReasoningTitleMaxCodePoints(60)。期望:按 code point 截断并
// 追加省略号,不会切断多字节字符;空推理 → 空标题。
TEST(ToolPreambleReasoning, TruncatesLongSentenceAndRejectsEmpty) {
    const std::string long_sentence(120, 'x');
    const std::string title = title_from_reasoning(long_sentence);
    EXPECT_EQ(title.substr(0, 60), std::string(60, 'x'));
    EXPECT_EQ(title.substr(60), "\xE2\x80\xA6");
    EXPECT_EQ(title_from_reasoning(""), "");
    EXPECT_EQ(title_from_reasoning("   \n  "), "");
}

// 场景:提示驱动模式,模型按要求在工具调用前写了一句前言(可能带引号 /
// 末尾句号)。期望:规整后的那句话就是标题。
TEST(ToolPreamblePrompt, ShortSingleLineQualifies) {
    EXPECT_EQ(title_from_assistant_text("Reading the registry loader and expert config."),
              "Reading the registry loader and expert config");
    EXPECT_EQ(title_from_assistant_text("\"Checking how sub-agents inherit the turn limit\"\n"),
              "Checking how sub-agents inherit the turn limit");
}

// 场景:正文是多段落说明、含代码块、或超过 160 个 code point 的长句。
// 期望:不算前言(返回空),这些正文保持普通气泡显示。
TEST(ToolPreamblePrompt, LongOrMultiLineTextIsNotAPreamble) {
    EXPECT_EQ(title_from_assistant_text("First line.\n\nSecond paragraph explains more."), "");
    EXPECT_EQ(title_from_assistant_text("Running:\n```\nls\n```"), "");
    EXPECT_EQ(title_from_assistant_text(std::string(161, 'a')), "");
    EXPECT_EQ(title_from_assistant_text(""), "");
}

// 场景:旁路小模型的输出五花八门:带 "Title:" 标签、带引号、多行解释、
// 或 provider 报错文本。期望:取第一个非空行并清洗;错误标记判无效。
TEST(ToolPreambleSidecar, SanitizesModelOutput) {
    EXPECT_EQ(sanitize_sidecar_title("Title: \"Reading registry sections\"\nBecause the agent..."),
              "Reading registry sections");
    EXPECT_EQ(sanitize_sidecar_title("\n- **Checking the loader**\n"), "Checking the loader");
    EXPECT_EQ(sanitize_sidecar_title("[Error] Request failed with status 500"), "");
    EXPECT_EQ(sanitize_sidecar_title("[Aborted]"), "");
    EXPECT_EQ(sanitize_sidecar_title(""), "");
}

// 场景:构造旁路请求。期望:一条 system + 一条 user;user 里有用户请求、
// assistant 正文与工具调用列表;超长材料被截断(400 / 200 code point),
// 超过 8 个调用只列前 8 个并注明剩余数量。
TEST(ToolPreambleSidecar, BuildsBoundedRequestMessages) {
    SidecarSummaryInput input;
    input.user_request = std::string(600, 'u');
    input.assistant_text = "Let me look.";
    for (int i = 0; i < 10; ++i) {
        input.calls.push_back({"file_read", "{\"file_path\":\"" + std::string(300, 'p') + "\"}"});
    }
    const auto messages = build_sidecar_messages(input);
    ASSERT_EQ(messages.size(), 2u);
    EXPECT_EQ(messages[0].role, "system");
    EXPECT_NE(messages[0].content.find("Output the label only"), std::string::npos);
    EXPECT_EQ(messages[1].role, "user");
    const std::string& body = messages[1].content;
    EXPECT_NE(body.find("User request:"), std::string::npos);
    EXPECT_NE(body.find(std::string(400, 'u') + "\xE2\x80\xA6"), std::string::npos);
    EXPECT_EQ(body.find(std::string(401, 'u')), std::string::npos);
    EXPECT_NE(body.find("Let me look."), std::string::npos);
    EXPECT_NE(body.find("- file_read: "), std::string::npos);
    EXPECT_NE(body.find("... and 2 more"), std::string::npos);
    EXPECT_EQ(body.find(std::string(201, 'p')), std::string::npos);
}

// 场景:材料为空(旁路在第一个工具名露头时就启动,可能只有工具名)。
// 期望:占位文案而不是空段,不抛异常。
TEST(ToolPreambleSidecar, EmptyMaterialsUsePlaceholders) {
    SidecarSummaryInput input;
    const auto messages = build_sidecar_messages(input);
    ASSERT_EQ(messages.size(), 2u);
    EXPECT_NE(messages[1].content.find("(not available)"), std::string::npos);
    EXPECT_NE(messages[1].content.find("(none)"), std::string::npos);
    EXPECT_NE(messages[1].content.find("(unknown)"), std::string::npos);
}

// 场景:规整标题行 —— 列表记号 / 井号 / 包裹引号 / 末尾冒号 / 内部换行。
// 期望:全部去掉,连续空白折叠成一个空格。
TEST(ToolPreambleNormalize, StripsMarkdownDecorations) {
    EXPECT_EQ(normalize_title_line("## \xE2\x80\x9CReading  the\nloader\xE2\x80\x9D:", 60),
              "Reading the loader");   // “Reading  the\nloader”: → Reading the loader
    EXPECT_EQ(normalize_title_line("1. **Checking tests**...", 60), "Checking tests");
    EXPECT_EQ(normalize_title_line("   ", 60), "");
}

// 场景:按 code point 截断中文(每字 3 字节)。期望:恰好保留 N 个字,不留
// 半个 UTF-8 序列,截断处追加 "…";不超限时原样返回。
TEST(ToolPreambleNormalize, TruncationIsUtf8Safe) {
    const std::string han = "\xE6\xB3\xA8";   // 注
    std::string text;
    for (int i = 0; i < 10; ++i) text += han;
    const std::string cut = truncate_code_points(text, 4);
    EXPECT_EQ(cut, han + han + han + han + "\xE2\x80\xA6");
    EXPECT_EQ(truncate_code_points(text, 10), text);
    EXPECT_EQ(truncate_code_points("abc", 10), "abc");
}

// 场景:mode 校验。期望:三个规范名有效,其它(含大小写变体)无效。
TEST(ToolPreambleMode, ValidatesCanonicalNames) {
    EXPECT_TRUE(is_valid_mode("prompt"));
    EXPECT_TRUE(is_valid_mode("reasoning"));
    EXPECT_TRUE(is_valid_mode("sidecar"));
    EXPECT_FALSE(is_valid_mode("Prompt"));
    EXPECT_FALSE(is_valid_mode(""));
    EXPECT_FALSE(is_valid_mode("auto"));
}
