#include <gtest/gtest.h>
#include "tui/ask_question_controller.hpp"
#include "tui/ask_question_layout.hpp"
#include "tui/ask_question_adapter.hpp"
#include <algorithm>
#include <vector>
using namespace acecode;
using namespace acecode::tui;
namespace {
AskQuestion question(bool multi = false) {
    AskQuestion q;
    q.question = "Which path?";
    q.header = "Path";
    q.options = {{"A", "First"}, {"B", "Second"}};
    q.multi_select = multi;
    return q;
}
}
TEST(AskQuestionReviewRegression, ClickingSelectedCustomWhileEditingDeselectsIt) {
    AskQuestionController c({question()}, {});
    c.handle({AskQuestionEventKind::BeginCustom});
    c.handle({AskQuestionEventKind::InsertText, -1, 0, "draft"});
    c.handle({AskQuestionEventKind::ToggleFocusedWithoutSubmit});
    EXPECT_FALSE(c.snapshot().editing_custom);
    EXPECT_FALSE(c.snapshot().custom_selected);
    EXPECT_EQ(c.snapshot().custom_text, "draft");
}
TEST(AskQuestionReviewRegression, DeselectingCustomPreservesOtherMultiAnswers) {
    AskQuestionController c({question(true)}, {});
    c.handle({AskQuestionEventKind::ToggleFocused});
    c.handle({AskQuestionEventKind::BeginCustom});
    c.handle({AskQuestionEventKind::InsertText, -1, 0, "draft"});
    c.handle({AskQuestionEventKind::Escape});
    c.handle({AskQuestionEventKind::ToggleFocusedWithoutSubmit});
    ASSERT_FALSE(c.snapshot().options.empty());
    EXPECT_TRUE(c.snapshot().options[0].selected);
    EXPECT_FALSE(c.snapshot().custom_selected);
    EXPECT_EQ(c.snapshot().custom_text, "draft");
}
TEST(AskQuestionReviewRegression, InactiveCustomRendersEachLineOnce) {
    AskQuestionController c({question()}, {});
    c.handle({AskQuestionEventKind::BeginCustom});
    c.handle({AskQuestionEventKind::InsertText, -1, 0, "first\nsecond"});
    c.handle({AskQuestionEventKind::Escape});
    const auto snapshot = c.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 70, 20, 4, 0});
    std::vector<std::string> lines;
    for (const auto& row : layout.rows)
        if (row.kind == AskQuestionLayoutKind::Custom) lines.push_back(row.title);
    EXPECT_EQ(lines, (std::vector<std::string>{"first", "second"}));
}
TEST(AskQuestionReviewRegression, ManualScrollingCanMovePastTheFocusedOption) {
    auto q = question();
    q.options[1].description = std::string(180, 'b');
    AskQuestionController c({q}, {});
    auto before = c.snapshot();
    const auto initial = build_ask_question_layout({&before, 42, 4, 2, 0});
    const int maximum = initial.total_rows - initial.visible_rows;
    ASSERT_GT(maximum, 3);
    c.handle({AskQuestionEventKind::ScrollLines, -1, maximum, {}, 0, maximum});
    auto snapshot = c.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 42, 4, 2, 0});
    EXPECT_EQ(layout.scroll_offset, maximum);

    // A passive render acknowledgment must not undo the user's scroll.
    c.handle({AskQuestionEventKind::SetScrollOffset, -1, maximum});
    snapshot = c.snapshot();
    EXPECT_EQ(build_ask_question_layout({&snapshot, 42, 4, 2, 0}).scroll_offset,
              maximum);

    // Explicit keyboard navigation resumes automatic focus visibility.
    c.handle({AskQuestionEventKind::MoveDown});
    snapshot = c.snapshot();
    const auto navigated = build_ask_question_layout({&snapshot, 42, 4, 2, 0});
    const auto focused = std::find_if(navigated.rows.begin(), navigated.rows.end(),
        [](const auto& row) { return row.focused; });
    ASSERT_NE(focused, navigated.rows.end());
    EXPECT_GT(focused->rect.height, 0);
}
TEST(AskQuestionReviewRegression, EditingLongCustomKeepsCaretVisible) {
    AskQuestionController c({question()}, {});
    c.handle({AskQuestionEventKind::BeginCustom});
    c.handle({AskQuestionEventKind::InsertText, -1, 0, "a\nb\nc\nd\ne\nf\ng\nh"});
    c.handle({AskQuestionEventKind::MoveCursorTo, -1, 0, {}, 0});
    auto snapshot = c.snapshot();
    const auto layout = build_ask_question_layout({&snapshot, 50, 4, 2, 0});
    const auto cursor_row = std::find_if(layout.rows.begin(), layout.rows.end(), [](const auto& row) {
        return row.kind == AskQuestionLayoutKind::Custom && row.text_byte_begin == 0;
    });
    ASSERT_NE(cursor_row, layout.rows.end());
    EXPECT_GT(cursor_row->rect.height, 0);
}
TEST(AskQuestionReviewRegression, HomeAtEmptyFirstLineDoesNotJumpForward) {
    AskQuestionEditor editor("\nanswer");
    editor.set_cursor(0);
    editor.move_home();
    EXPECT_EQ(editor.cursor(), 0u);
}
TEST(AskQuestionReviewRegression, UpFromSecondLineReachesEmptyFirstLine) {
    AskQuestionEditor editor("\nanswer");
    editor.set_cursor(3);
    EXPECT_TRUE(editor.move_up());
    EXPECT_EQ(editor.cursor(), 0u);
}
TEST(AskQuestionReviewRegression, StackedSummaryAnswerRemainsClickable) {
    AskQuestionController c({question(), question()}, {4,0});
    c.handle({AskQuestionEventKind::ChooseNumber, 1});
    c.handle({AskQuestionEventKind::ChooseNumber, 2});
    const auto snapshot = c.snapshot();
    ASSERT_EQ(snapshot.page, AskQuestionPage::Summary);
    AskQuestionFrame frame;
    frame.layout = build_ask_question_layout({&snapshot, 24, 30, 2, 0});
    ASSERT_TRUE(frame.layout.summary_stacked);
    frame.reset_for_render();
    for (int i=0; i<frame.layout.visible_rows; ++i) frame.row_boxes[i] = ftxui::Box{0,20,i,i};
    auto row=std::find_if(frame.layout.rows.begin(),frame.layout.rows.end(), [](const auto& r) {
        return r.kind==AskQuestionLayoutKind::SummaryAnswer && r.rect.height>0;
    });
    ASSERT_NE(row,frame.layout.rows.end());
    const auto hit=hit_test_ask_question_frame(frame,2,row->rect.y);
    EXPECT_EQ(hit.kind,AskQuestionHitKind::SummaryQuestion);
    EXPECT_EQ(hit.question_index,row->question_index);
}
