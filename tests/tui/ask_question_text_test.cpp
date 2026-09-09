#include <gtest/gtest.h>

#include "tui/ask_question_layout.hpp"
#include "tui/ask_question_text.hpp"

#include <string>
#include <string_view>

using acecode::tui::ask_question_codepoint_width;
using acecode::tui::ask_question_display_width;
using acecode::tui::ask_question_text_width;
using acecode::tui::ask_question_wrap;

TEST(AskQuestionTextTest, MeasuresAsciiAndChineseCells) {
    EXPECT_EQ(ask_question_text_width("abc"), 3);
    EXPECT_EQ(ask_question_text_width(u8"中文"), 4);
    EXPECT_EQ(ask_question_display_width(u8"A中B"), 4);
}

TEST(AskQuestionTextTest, CombiningMarksDoNotAddCells) {
    EXPECT_EQ(ask_question_text_width(u8"e\u0301"), 1);
    EXPECT_EQ(ask_question_codepoint_width(u8"\u0301"), 0);
}

TEST(AskQuestionTextTest, WideSymbolsUseTwoCells) {
    EXPECT_EQ(ask_question_codepoint_width(u8"界"), 2);
    EXPECT_EQ(ask_question_codepoint_width(u8"表"), 2);
}

TEST(AskQuestionTextTest, InvalidUtf8ConsumesOneByteAndRemainsBounded) {
    const std::string invalid("a\x80\xc0\xe4\xb8", 5);
    EXPECT_EQ(ask_question_text_width(invalid), 5);
    EXPECT_EQ(ask_question_codepoint_width(std::string_view("\x80", 1)), 1);
}

TEST(AskQuestionTextTest, WrappingPreservesCodepointBoundaries) {
    const auto lines = ask_question_wrap(u8"A中文B", 3);
    ASSERT_EQ(lines.size(), 2u);
    EXPECT_EQ(lines[0], "A中");
    EXPECT_EQ(lines[1], u8"文B");
    for (const auto& line : lines) {
        EXPECT_LE(ask_question_text_width(line), 3);
    }
}

TEST(AskQuestionTextTest, WrappingKeepsExplicitLines) {
    const auto lines = ask_question_wrap("first\n\nthird", 20);
    ASSERT_EQ(lines.size(), 3u);
    EXPECT_EQ(lines[0], "first");
    EXPECT_TRUE(lines[1].empty());
    EXPECT_EQ(lines[2], "third");
}
