#include <gtest/gtest.h>

#include <algorithm>

#include "tui/ask_question_adapter.hpp"

using acecode::AskOption;
using acecode::AskQuestion;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionFrame;
using acecode::tui::AskQuestionHitKind;
using acecode::tui::AskQuestionLayoutKind;
using acecode::tui::build_ask_question_layout;
using acecode::tui::AskQuestionLayoutInput;

namespace {

AskQuestion make_question() {
    AskQuestion question;
    question.question = "Which path?";
    question.header = "Decision";
    question.options = {
        {"Refactor (Recommended)", "Extract a controller.", true},
        {"Patch", "Keep the current path."},
    };
    return question;
}

AskQuestionFrame frame_for(const acecode::tui::AskQuestionSnapshot& snapshot,
                           int width = 40,
                           int height = 20) {
    AskQuestionFrame frame;
    frame.layout = build_ask_question_layout(
        AskQuestionLayoutInput{&snapshot, width, height, 4, 0});
    frame.row_boxes.resize(static_cast<std::size_t>(frame.layout.visible_rows));
    for (int i = 0; i < frame.layout.visible_rows; ++i) {
        frame.row_boxes[static_cast<std::size_t>(i)] =
            ftxui::Box{0, width - 2, i, i};
    }
    frame.scrollbar_box = ftxui::Box{
        width - 1, width - 1, 0, frame.layout.visible_rows - 1};
    frame.overlay_box = ftxui::Box{0, width - 1, 0, frame.layout.visible_rows - 1};
    return frame;
}

} // namespace

TEST(AskQuestionAdapterTest, HitsOptionAndCustomRowsThroughScreenBoxes) {
    AskQuestionController controller({make_question()}, {});
    const auto snapshot = controller.snapshot();
    auto frame = frame_for(snapshot);

    const auto option_row = std::find_if(
        frame.layout.rows.begin(), frame.layout.rows.end(),
        [](const auto& row) {
            return row.kind == AskQuestionLayoutKind::Option &&
                   row.rect.height > 0;
        });
    ASSERT_NE(option_row, frame.layout.rows.end());
    const auto option = acecode::tui::hit_test_ask_question_frame(
        frame, 2, option_row->rect.y);
    EXPECT_EQ(option.kind, AskQuestionHitKind::Option);
    EXPECT_EQ(option.question_index, 0);
    EXPECT_EQ(option.option_index, option_row->option_index);

    const auto custom_row = std::find_if(
        frame.layout.rows.begin(), frame.layout.rows.end(),
        [](const auto& row) {
            return row.kind == AskQuestionLayoutKind::Custom &&
                   row.rect.height > 0;
        });
    ASSERT_NE(custom_row, frame.layout.rows.end());
    const auto custom = acecode::tui::hit_test_ask_question_frame(
        frame, 2, custom_row->rect.y);
    EXPECT_EQ(custom.kind, AskQuestionHitKind::Custom);
    EXPECT_EQ(custom.question_index, 0);
    EXPECT_EQ(custom.option_index, 2);
}

TEST(AskQuestionAdapterTest, HitsSummaryAndScrollbar) {
    AskQuestionController controller({make_question(), make_question()}, {});
    controller.handle({acecode::tui::AskQuestionEventKind::ChooseOption, 0});
    controller.handle({acecode::tui::AskQuestionEventKind::SelectionFeedbackElapsed});
    controller.handle({acecode::tui::AskQuestionEventKind::ChooseOption, 0});
    controller.handle({acecode::tui::AskQuestionEventKind::SelectionFeedbackElapsed});
    const auto snapshot = controller.snapshot();
    ASSERT_EQ(snapshot.page, acecode::tui::AskQuestionPage::Summary);

    auto frame = frame_for(snapshot, 40, 2);
    ASSERT_GT(frame.layout.total_rows, frame.layout.visible_rows);
    EXPECT_EQ(acecode::tui::hit_test_ask_question_frame(
                  frame, 39, 1).kind,
              AskQuestionHitKind::Scrollbar);

    const auto summary = acecode::tui::hit_test_ask_question_frame(frame, 2, 1);
    EXPECT_EQ(summary.kind, AskQuestionHitKind::SummaryQuestion);
}

TEST(AskQuestionAdapterTest, DoesNotHitEmptyOrOutOfRangeRows) {
    AskQuestionController controller({make_question()}, {});
    const auto snapshot = controller.snapshot();
    auto frame = frame_for(snapshot);
    frame.row_boxes[0] = ftxui::Box{};

    EXPECT_EQ(acecode::tui::hit_test_ask_question_frame(frame, 0, 0).kind,
              AskQuestionHitKind::None);

    frame.layout.scroll_offset = 100;
    EXPECT_EQ(acecode::tui::hit_test_ask_question_frame(frame, 1, 1).kind,
              AskQuestionHitKind::None);
}

TEST(AskQuestionAdapterTest, ScrollOffsetMapsVisibleRowsToLogicalRows) {
    AskQuestionController controller({make_question()}, {});
    auto snapshot = controller.snapshot();
    auto frame = frame_for(snapshot);
    ASSERT_GE(frame.layout.rows.size(), 2u);
    frame.layout.scroll_offset = 1;
    const auto logical_row = std::find_if(
        frame.layout.rows.begin() + 1, frame.layout.rows.end(),
        [](const auto& row) {
            return row.kind == AskQuestionLayoutKind::Option ||
                   row.kind == AskQuestionLayoutKind::Custom;
        });
    ASSERT_NE(logical_row, frame.layout.rows.end());
    const auto logical_index = static_cast<int>(
        logical_row - frame.layout.rows.begin());
    const auto visible_index = logical_index - frame.layout.scroll_offset;
    ASSERT_GE(visible_index, 0);
    ASSERT_LT(visible_index, static_cast<int>(frame.row_boxes.size()));
    frame.row_boxes[static_cast<std::size_t>(visible_index)] =
        ftxui::Box{0, 38, visible_index, visible_index};

    const auto hit = acecode::tui::hit_test_ask_question_frame(
        frame, 2, visible_index);
    ASSERT_NE(hit.kind, AskQuestionHitKind::None);
    EXPECT_EQ(hit.question_index, logical_row->question_index);
    EXPECT_EQ(hit.option_index, logical_row->option_index);
}

TEST(AskQuestionAdapterTest, ResetForRenderClearsReflectedGeometry) {
    AskQuestionFrame frame;
    frame.layout.visible_rows = 3;
    frame.overlay_box = ftxui::Box{1, 2, 3, 4};
    frame.scrollbar_box = ftxui::Box{5, 6, 5, 7};
    frame.row_boxes.resize(5, ftxui::Box{1, 1, 2, 2});

    frame.reset_for_render();

    EXPECT_EQ(frame.overlay_box.x_min, 0);
    EXPECT_EQ(frame.overlay_box.x_max, -1);
    EXPECT_EQ(frame.scrollbar_box.x_max, -1);
    ASSERT_EQ(frame.row_boxes.size(), 3u);
    EXPECT_EQ(frame.row_boxes[0].x_max, -1);
}
