#include <gtest/gtest.h>

#include <algorithm>

#include "tui/ask_question_layout.hpp"

using acecode::AskOption;
using acecode::AskQuestion;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionLayoutInput;
using acecode::tui::AskQuestionLayoutKind;
using acecode::tui::AskQuestionHitKind;
using acecode::tui::build_ask_question_layout;
using acecode::tui::hit_test_ask_question_layout;
using acecode::tui::hit_test_ask_question_target;
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
}

TEST(AskQuestionLayoutTest, WrapNeverSplitsUtf8Bytes) {
    for (const auto& line : ask_question_wrap(u8"中文English混排", 4)) {
        EXPECT_FALSE(line.empty());
        for (unsigned char c : line) {
            EXPECT_FALSE((c & 0xc0) == 0x80 && line.front() == static_cast<char>(c));
        }
    }
}

TEST(AskQuestionLayoutTest, BuildsTwoColumnsAndCustomRow) {
    AskQuestionController controller({question()}, {});
    const auto snapshot = controller.snapshot();
    AskQuestionLayoutInput input{&snapshot, 60, 20, 4, {}};
    const auto layout = build_ask_question_layout(input);
    ASSERT_FALSE(layout.terminal_too_narrow);
    EXPECT_GT(layout.title_width, 0);
    EXPECT_GT(layout.description_width, 0);
    bool option = false;
    bool custom = false;
    for (const auto& row : layout.rows) {
        option |= row.kind == AskQuestionLayoutKind::Option;
        custom |= row.kind == AskQuestionLayoutKind::Custom;
    }
    EXPECT_TRUE(option);
    EXPECT_TRUE(custom);
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

TEST(AskQuestionLayoutTest, SummaryRowsExposeQuestionTargets) {
    AskQuestionController controller({question(), question()}, {});
    controller.handle({acecode::tui::AskQuestionEventKind::MoveRight});
    controller.handle({acecode::tui::AskQuestionEventKind::MoveRight});
    const auto snapshot = controller.snapshot();
    ASSERT_EQ(snapshot.page, acecode::tui::AskQuestionPage::Summary);
    const auto layout = build_ask_question_layout({&snapshot, 60, 20, 4, {}});
    ASSERT_EQ(layout.rows.size(), 3u);
    EXPECT_EQ(layout.rows[1].kind, AskQuestionLayoutKind::Summary);
    EXPECT_EQ(layout.rows[1].question_index, 0);
    EXPECT_EQ(layout.rows[2].kind, AskQuestionLayoutKind::Summary);
    EXPECT_EQ(layout.rows[2].question_index, 1);
    auto summary = hit_test_ask_question_target(layout, 2, 1);
    EXPECT_EQ(summary.kind, AskQuestionHitKind::SummaryQuestion);
    EXPECT_EQ(summary.question_index, 0);
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
