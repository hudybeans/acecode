#include <gtest/gtest.h>

#include <algorithm>
#include <string>
#include <vector>

#include "tui/ask_question_layout.hpp"

using acecode::AskOption;
using acecode::AskQuestion;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionEventKind;
using acecode::tui::AskQuestionLayoutInput;
using acecode::tui::AskQuestionLayoutKind;
using acecode::tui::AskQuestionLayoutRow;
using acecode::tui::AskQuestionHitKind;
using acecode::tui::build_ask_question_layout;
using acecode::tui::hit_test_ask_question_layout;
using acecode::tui::hit_test_ask_question_target;
using acecode::tui::ask_question_display_width;
using acecode::tui::ask_question_wrap;

namespace {

AskQuestion question() {
    AskQuestion q;
    q.question = u8"请选择一个很长的问题说明，用于验证动态折行";
    q.header = "Decision";
    q.options = {{"First", u8"这是一个足够长的中文说明，用于验证说明列独立换行"},
                 {"Second (Recommended)", "short"}};
    return q;
}

void answer_all(AskQuestionController& controller, int questions) {
    for (int i = 0; i < questions; ++i) {
        controller.handle({AskQuestionEventKind::ChooseOption, 0});
        controller.handle({AskQuestionEventKind::SelectionFeedbackElapsed});
    }
}

const AskQuestionLayoutRow* find_row(const acecode::tui::AskQuestionLayout& layout,
                                     AskQuestionLayoutKind kind) {
    const auto it = std::find_if(
        layout.rows.begin(), layout.rows.end(),
        [kind](const AskQuestionLayoutRow& row) { return row.kind == kind; });
    return it == layout.rows.end() ? nullptr : &*it;
}

} // namespace

TEST(AskQuestionLayoutTest, WrapNeverSplitsUtf8Bytes) {
    for (const auto& line : ask_question_wrap(u8"中文English混排", 4)) {
        EXPECT_FALSE(line.empty());
        for (unsigned char c : line) {
            EXPECT_FALSE((c & 0xc0) == 0x80 && line.front() == static_cast<char>(c));
        }
    }
}

// 场景:换行必须保持 ASCII 单词完整,且行首不能出现收尾标点。
TEST(AskQuestionLayoutTest, WrapKeepsWordsWholeAndAvoidsLeadingPunctuation) {
    const auto words = ask_question_wrap("Second [Recommended]", 19);
    ASSERT_EQ(words.size(), 2u);
    EXPECT_EQ(words[0], "Second");
    EXPECT_EQ(words[1], "[Recommended]");

    for (const auto& line : ask_question_wrap(u8"验证范围？需要覆盖滚动", 8)) {
        EXPECT_FALSE(line.empty());
        EXPECT_NE(line.rfind(u8"？", 0), 0u);
        EXPECT_LE(ask_question_display_width(line), 8);
    }
}

// 场景:换行只在折行点丢弃空白,不得吞掉任何可见字形。CJK 文本没有空格,
// 因此在任意宽度下都必须逐字还原 —— 这是零进度或越界回退会立刻打破的性质。
TEST(AskQuestionLayoutTest, WrapNeverDropsVisibleGlyphs) {
    const std::string text =
        u8"如果恢复旧会话时仍然保存了问答工具的原始参数，是否需要忽略参数摘要并只显示结构化问答结果？";
    for (int width = 1; width <= 80; ++width) {
        std::string joined;
        for (const auto& line : ask_question_wrap(text, width)) {
            joined += line;
        }
        EXPECT_EQ(joined, text) << "width=" << width;
    }
}

// 场景:带空格的英文文本只允许在折行点丢弃空格,字母本身不能丢。
TEST(AskQuestionLayoutTest, WrapOnlyDropsBreakSpaces) {
    const std::string text = "Second [Recommended] variant";
    for (int width = 1; width <= 40; ++width) {
        std::string joined;
        for (const auto& line : ask_question_wrap(text, width)) {
            joined += line;
        }
        std::string stripped = joined;
        stripped.erase(std::remove(stripped.begin(), stripped.end(), ' '),
                       stripped.end());
        std::string expected = text;
        expected.erase(std::remove(expected.begin(), expected.end(), ' '),
                       expected.end());
        EXPECT_EQ(stripped, expected) << "width=" << width;
    }
}

// 场景:选项行由编号列、标记列、标题列、说明列四个固定槽位组成,所有选项
// 共用同一组偏移,续行不重复编号与标记。
TEST(AskQuestionLayoutTest, OptionColumnsShareOneSetOfOffsets) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    ASSERT_FALSE(layout.terminal_too_narrow);
    EXPECT_EQ(layout.marker_width, 3);
    EXPECT_EQ(layout.column_gap, 2);
    EXPECT_EQ(layout.description_x,
              layout.title_x + layout.title_width + layout.column_gap);
    EXPECT_GT(layout.title_width, 0);
    EXPECT_GT(layout.description_width, 0);

    int option_rows = 0;
    int first_lines = 0;
    for (const auto& row : layout.rows) {
        if (row.kind != AskQuestionLayoutKind::Option) continue;
        ++option_rows;
        EXPECT_EQ(row.title_x, layout.title_x);
        EXPECT_EQ(row.description_x, layout.description_x);
        if (row.number.empty()) {
            EXPECT_TRUE(row.marker.empty()) << "continuation rows repeat the marker";
        } else {
            ++first_lines;
            EXPECT_EQ(ask_question_display_width(row.marker), layout.marker_width);
        }
    }
    EXPECT_GT(option_rows, 2);
    EXPECT_EQ(first_lines, static_cast<int>(snapshot.options.size()));
}

// 场景:标题列按本题最长标题收紧,而不是固定占用屏幕比例。
TEST(AskQuestionLayoutTest, TitleColumnShrinksToLongestLabel) {
    AskQuestion short_labels;
    short_labels.question = "Which?";
    short_labels.header = "Pick";
    short_labels.options = {{"A", ""}, {"B", ""}};
    AskQuestionController controller({short_labels}, {});
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 80, 20, 4, {}});
    EXPECT_EQ(layout.title_width, 8);
    EXPECT_GT(layout.description_width, layout.title_width);
}

// 场景:自定义行与预设项共用列边界,并显示与其他选项对齐的选择标记。
TEST(AskQuestionLayoutTest, CustomRowSharesOptionColumnsAndShowsMarker) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    const auto* custom = find_row(layout, AskQuestionLayoutKind::Custom);
    ASSERT_NE(custom, nullptr);
    EXPECT_EQ(custom->title_x, layout.title_x);
    EXPECT_EQ(custom->description_x, layout.description_x);
    EXPECT_EQ(custom->marker, "( )");
    EXPECT_TRUE(custom->placeholder);
    EXPECT_EQ(custom->number, std::to_string(snapshot.options.size() + 1));
    EXPECT_FALSE(custom->selected);
}

TEST(AskQuestionLayoutTest, MultiSelectCustomRowShowsCheckbox) {
    AskQuestion multi = question();
    multi.multi_select = true;
    AskQuestionController controller({multi}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    const auto snapshot = controller.snapshot();
    ASSERT_TRUE(snapshot.custom_selected);
    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    const auto* custom = find_row(layout, AskQuestionLayoutKind::Custom);
    ASSERT_NE(custom, nullptr);
    EXPECT_EQ(custom->marker, "[x]");
    EXPECT_TRUE(custom->selected);
    EXPECT_TRUE(custom->focused);
}

TEST(AskQuestionLayoutTest, BuildsTwoColumnsAndCustomRow) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    AskQuestionLayoutInput input{&snapshot, 60, 20, 4, {}};
    const auto layout = build_ask_question_layout(input);
    ASSERT_FALSE(layout.terminal_too_narrow);
    EXPECT_GT(layout.title_width, 0);
    EXPECT_GT(layout.description_width, 0);
    EXPECT_NE(find_row(layout, AskQuestionLayoutKind::Option), nullptr);
    EXPECT_NE(find_row(layout, AskQuestionLayoutKind::Custom), nullptr);
}

TEST(AskQuestionLayoutTest, ScrollAndHitUseVisibleRows) {
    AskQuestionController controller({question()}, {});
    auto snapshot = controller.snapshot();
    snapshot.scroll_offset = 2;
    AskQuestionLayoutInput input{&snapshot, 40, 5, 2, {}};
    const auto layout = build_ask_question_layout(input);
    const auto visible_first = layout.rows[2];
    ASSERT_GT(visible_first.rect.height, 0);
    EXPECT_EQ(hit_test_ask_question_layout(layout, 1, visible_first.rect.y),
              visible_first.option_index);
    const auto visible_last = layout.rows[std::min<std::size_t>(
        layout.rows.size() - 1, static_cast<std::size_t>(
            layout.scroll_offset + layout.visible_rows - 1))];
    ASSERT_GT(visible_last.rect.height, 0);
    EXPECT_EQ(hit_test_ask_question_layout(layout, 1, visible_last.rect.y),
              visible_last.option_index);
}

// 场景:汇总页每题是一个独立的 Q/A 两列块,问题与答案从同一行开始,
// 所有答案共用同一左边界,块与块之间空一行,且问题文本不会被丢掉。
TEST(AskQuestionLayoutTest, SummaryRowsPairQuestionWithAnswerInSharedColumns) {
    AskQuestionController controller({question(), question()}, {});
    answer_all(controller, 2);
    const auto snapshot = controller.snapshot();
    ASSERT_EQ(snapshot.page, acecode::tui::AskQuestionPage::Summary);
    ASSERT_EQ(snapshot.question_texts.size(), 2u);
    ASSERT_EQ(snapshot.answers.size(), 2u);

    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    ASSERT_FALSE(layout.summary_stacked);
    EXPECT_GT(layout.summary_answer_x, 0);
    EXPECT_EQ(layout.summary_answer_x,
              layout.number_width + 2 + layout.summary_question_width +
                  layout.column_gap);

    std::vector<int> numbered;
    std::string question_text;
    int spacer_rows = 0;
    for (const auto& row : layout.rows) {
        if (row.kind != AskQuestionLayoutKind::Summary) continue;
        if (row.question_index < 0) {
            ++spacer_rows;
            EXPECT_TRUE(row.title.empty());
            EXPECT_TRUE(row.answer.empty());
            continue;
        }
        EXPECT_EQ(row.answer_x, layout.summary_answer_x);
        if (!row.number.empty()) numbered.push_back(row.question_index);
        if (!row.title.empty()) {
            EXPECT_LE(ask_question_display_width(row.title),
                      layout.summary_question_width);
            question_text += row.title;
        }
        if (!row.answer.empty()) {
            EXPECT_LE(ask_question_display_width(row.answer),
                      layout.summary_answer_width);
        }
    }
    ASSERT_EQ(numbered.size(), 2u);
    EXPECT_EQ(numbered[0], 0);
    EXPECT_EQ(numbered[1], 1);
    EXPECT_EQ(spacer_rows, 1);
    EXPECT_NE(question_text.find(u8"请选择一个很长的问题说明"),
              std::string::npos);
    EXPECT_NE(question_text.find(u8"："), std::string::npos);
}

TEST(AskQuestionLayoutTest, SummaryRowsExposeQuestionTargets) {
    AskQuestionController controller({question(), question()}, {});
    answer_all(controller, 2);
    const auto snapshot = controller.snapshot();
    ASSERT_EQ(snapshot.page, acecode::tui::AskQuestionPage::Summary);
    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    ASSERT_EQ(layout.rows[0].kind, AskQuestionLayoutKind::Header);
    ASSERT_EQ(layout.rows[1].kind, AskQuestionLayoutKind::Summary);
    EXPECT_EQ(layout.rows[1].question_index, 0);
    auto summary = hit_test_ask_question_target(layout, 2, 1);
    EXPECT_EQ(summary.kind, AskQuestionHitKind::SummaryQuestion);
    EXPECT_EQ(summary.question_index, 0);
}

// 场景:面板太窄放不下两列时,答案换到问题下方的独立行,仍保持左对齐。
TEST(AskQuestionLayoutTest, NarrowPanelStacksSummaryAnswers) {
    AskQuestionController controller({question(), question()}, {});
    answer_all(controller, 2);
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 24, 20, 4, {}});
    ASSERT_TRUE(layout.summary_stacked);
    const auto* answer_row = find_row(layout, AskQuestionLayoutKind::SummaryAnswer);
    ASSERT_NE(answer_row, nullptr);
    EXPECT_EQ(answer_row->question_index, 0);
    EXPECT_EQ(answer_row->answer_x, layout.number_width + 2);
    EXPECT_FALSE(answer_row->title.empty());
}

TEST(AskQuestionLayoutTest, MinimumVisibleRowsDegradesToViewport) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 60, 3, 8, {}});
    EXPECT_EQ(layout.visible_rows, 3);
}

TEST(AskQuestionLayoutTest, NarrowTerminalClampsVisibleRows) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    AskQuestionLayoutInput input{&snapshot, 12, 8, 4, {}};
    EXPECT_TRUE(build_ask_question_layout(input).terminal_too_narrow);
}
