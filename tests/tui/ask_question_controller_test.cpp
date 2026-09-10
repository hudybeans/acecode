#include <algorithm>
#include <gtest/gtest.h>

#include "tui/ask_question_controller.hpp"

using acecode::AskOption;
using acecode::AskQuestion;
using acecode::tui::AskQuestionConfig;
using acecode::tui::AskQuestionController;
using acecode::tui::AskQuestionEffectKind;
using acecode::tui::AskQuestionEvent;
using acecode::tui::AskQuestionEventKind;
using acecode::tui::AskQuestionPage;

namespace {

AskQuestion make_question(bool multi_select = false) {
    AskQuestion question;
    question.question = "Which path?";
    question.header = "Decision";
    question.multi_select = multi_select;
    question.options = {
        {"Refactor (Recommended)", "Extract a controller.", true},
        {"Patch", "Keep the current path."},
    };
    return question;
}

AskQuestionEvent event(AskQuestionEventKind kind) {
    return AskQuestionEvent{kind};
}

} // namespace

TEST(AskQuestionControllerTest, SingleQuestionPresetCompletesAfterFeedback) {
    AskQuestionController controller({make_question()}, {});
    auto effects = controller.handle(event(AskQuestionEventKind::SubmitFocused));
    ASSERT_EQ(effects.size(), 1u);
    EXPECT_EQ(effects[0].kind, AskQuestionEffectKind::BeginSelectionFeedback);
    EXPECT_FALSE(controller.finished());

    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    ASSERT_TRUE(controller.finished());
    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    ASSERT_FALSE(completion->cancelled);
    ASSERT_EQ(completion->answers[0].selected.size(), 1u);
    EXPECT_EQ(completion->answers[0].selected[0], "Refactor (Recommended)");
}

TEST(AskQuestionControllerTest, MultiQuestionUsesSummaryAndPreservesCustomDraft) {
    AskQuestionController controller({make_question(), make_question()}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "draft"});
    controller.handle(event(AskQuestionEventKind::Escape));
    auto snapshot = controller.snapshot();
    EXPECT_FALSE(snapshot.editing_custom);
    EXPECT_TRUE(snapshot.custom_selected);

    controller.handle(event(AskQuestionEventKind::SubmitFocused));
    snapshot = controller.snapshot();
    EXPECT_EQ(snapshot.current_question, 1);
    EXPECT_EQ(snapshot.page, AskQuestionPage::Question);

    controller.handle(event(AskQuestionEventKind::SubmitFocused));
    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    snapshot = controller.snapshot();
    EXPECT_EQ(snapshot.page, AskQuestionPage::Summary);
    ASSERT_EQ(snapshot.answers.size(), 2u);
    EXPECT_EQ(snapshot.answers[0].custom_text, "draft");
}

TEST(AskQuestionControllerTest, MultiSelectKeepsPresetAndCustomText) {
    AskQuestionController controller({make_question(true)}, {});
    controller.handle(event(AskQuestionEventKind::ToggleFocused));
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "details"});
    controller.handle(event(AskQuestionEventKind::SubmitFocused));

    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    EXPECT_EQ(completion->answers[0].selected,
              std::vector<std::string>({"Refactor (Recommended)"}));
    EXPECT_EQ(completion->answers[0].custom_text, "details");
}

TEST(AskQuestionControllerTest, TimeoutOnlyAutoSelectsRecommendedOptions) {
    AskQuestion no_recommendation = make_question();
    no_recommendation.options[0].label = "First";
    no_recommendation.options[0].recommended = false;
    AskQuestionController controller({make_question(), no_recommendation}, {});
    controller.handle(event(AskQuestionEventKind::TimeoutElapsed));

    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    EXPECT_TRUE(completion->timed_out);
    EXPECT_TRUE(completion->answers[0].auto_selected);
    EXPECT_EQ(completion->answers[0].selected[0], "Refactor (Recommended)");
    EXPECT_TRUE(completion->answers[1].not_answered);
}

TEST(AskQuestionControllerTest, MultiSelectSubmitCurrentSelectionDoesNotForceFocus) {
    AskQuestionController controller({make_question(true)}, {});
    controller.handle(event(AskQuestionEventKind::ToggleFocused));
    controller.handle(event(AskQuestionEventKind::MoveDown));
    auto effects = controller.handle(event(AskQuestionEventKind::SubmitCurrentSelection));
    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));

    ASSERT_TRUE(controller.finished());
    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    ASSERT_EQ(completion->answers[0].selected.size(), 1u);
    EXPECT_EQ(completion->answers[0].selected[0], "Refactor (Recommended)");
    EXPECT_EQ(effects.front().kind, AskQuestionEffectKind::BeginSelectionFeedback);
}

TEST(AskQuestionControllerTest, SnapshotExposesEditorAndAllQuestionSelections) {
    AskQuestionController controller({make_question(), make_question(true)}, {}, "child task");
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "中文"});

    const auto snapshot = controller.snapshot();
    EXPECT_EQ(snapshot.origin_label, "child task");
    EXPECT_EQ(snapshot.question_text, "Which path?");
    EXPECT_EQ(snapshot.editor.text, "中文");
    EXPECT_EQ(snapshot.editor.cursor, std::string("中文").size());
    ASSERT_EQ(snapshot.question_options.size(), 2u);
    ASSERT_EQ(snapshot.question_options[0].size(), 2u);
    EXPECT_TRUE(snapshot.custom_selected);
}

TEST(AskQuestionControllerTest, NumberShortcutSelectsPresetAndSubmits) {
    AskQuestionController controller({make_question()}, {});
    auto effects = controller.handle({AskQuestionEventKind::ChooseNumber, 1});
    ASSERT_FALSE(controller.finished());
    ASSERT_EQ(effects.front().kind, AskQuestionEffectKind::BeginSelectionFeedback);
    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    EXPECT_EQ(completion->answers[0].selected,
              std::vector<std::string>({"Refactor (Recommended)"}));
}

TEST(AskQuestionControllerTest, NumberShortcutEntersCustomWithoutNumberForCustomRow) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::ChooseNumber, 3});
    const auto snapshot = controller.snapshot();
    EXPECT_TRUE(snapshot.editing_custom);
    EXPECT_TRUE(snapshot.custom_selected);
    EXPECT_TRUE(snapshot.editor.text.empty());
}

TEST(AskQuestionControllerTest, UnknownNumberStartsCustomWithNumberText) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::ChooseNumber, 9});
    const auto snapshot = controller.snapshot();
    EXPECT_TRUE(snapshot.editing_custom);
    EXPECT_EQ(snapshot.editor.text, "9");
}

TEST(AskQuestionControllerTest, EditingTreatsNumberAndNavigationLettersAsText) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::BeginCustom});
    controller.handle({AskQuestionEventKind::ChooseNumber, 7});
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "jky"});
    const auto snapshot = controller.snapshot();
    EXPECT_EQ(snapshot.editor.text, "7jky");
    EXPECT_EQ(snapshot.current_question, 0);
}

TEST(AskQuestionControllerTest, EscapeClearsSelectionAndGlobalCancelCancels) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::ToggleFocused});
    controller.handle(event(AskQuestionEventKind::Escape));
    EXPECT_FALSE(controller.snapshot().options[0].selected);
    EXPECT_FALSE(controller.finished());
    controller.handle(event(AskQuestionEventKind::GlobalCancel));
    EXPECT_TRUE(controller.finished());
    ASSERT_TRUE(controller.completion().has_value());
    EXPECT_TRUE(controller.completion()->cancelled);
}

TEST(AskQuestionControllerTest, TimeoutPreservesEmptyActivatedCustomAnswer) {
    AskQuestionController controller({make_question()}, {});
    controller.handle(event(AskQuestionEventKind::BeginCustom));

    controller.handle(event(AskQuestionEventKind::TimeoutElapsed));

    const auto completion = controller.completion();
    ASSERT_TRUE(completion.has_value());
    ASSERT_EQ(completion->answers.size(), 1u);
    EXPECT_TRUE(completion->answers[0].not_answered);
    EXPECT_TRUE(completion->answers[0].selected.empty());
    EXPECT_FALSE(completion->answers[0].auto_selected);
}

TEST(AskQuestionControllerTest, CutSelectionDefersDeletionUntilClipboardSucceeds) {
    AskQuestionController controller({make_question()}, {});
    controller.handle(event(AskQuestionEventKind::BeginCustom));
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "hello"});
    controller.handle({AskQuestionEventKind::MoveCursorHome});
    controller.handle({AskQuestionEventKind::SelectCursorRight, -1, 0});

    const auto cut_effects = controller.handle(event(AskQuestionEventKind::CutSelection));
    ASSERT_GE(cut_effects.size(), 1u);
    const auto cut = std::find_if(
        cut_effects.begin(), cut_effects.end(), [](const auto& effect) {
            return effect.kind == AskQuestionEffectKind::CutText;
        });
    ASSERT_NE(cut, cut_effects.end());
    EXPECT_EQ(cut->text, "h");
    EXPECT_EQ(controller.snapshot().editor.text, "hello");

    const auto delete_effects = controller.handle(event(AskQuestionEventKind::DeleteSelection));
    ASSERT_FALSE(delete_effects.empty());
    EXPECT_EQ(delete_effects.back().kind, AskQuestionEffectKind::Redraw);
    EXPECT_EQ(controller.snapshot().editor.text, "ello");
}

TEST(AskQuestionControllerTest, SummaryVerticalNavigationIsIgnored) {
    AskQuestionController controller({make_question(), make_question()}, {});
    controller.handle({AskQuestionEventKind::ChooseOption, 0});
    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    controller.handle({AskQuestionEventKind::ChooseOption, 0});
    controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    ASSERT_EQ(controller.snapshot().page, AskQuestionPage::Summary);
    const auto before = controller.snapshot();
    controller.handle(event(AskQuestionEventKind::MoveUp));
    controller.handle(event(AskQuestionEventKind::MoveDown));
    const auto after = controller.snapshot();
    EXPECT_EQ(after.page, before.page);
    EXPECT_EQ(after.current_question, before.current_question);
}

TEST(AskQuestionControllerTest, FeedbackLockStillHonorsGlobalCancel) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::ChooseOption, 0});
    ASSERT_TRUE(controller.snapshot().feedback_locked);

    const auto effects = controller.handle(event(AskQuestionEventKind::GlobalCancel));
    ASSERT_EQ(effects.size(), 1u);
    EXPECT_EQ(effects[0].kind, AskQuestionEffectKind::Cancel);
    ASSERT_TRUE(controller.completion().has_value());
    EXPECT_TRUE(controller.completion()->cancelled);
}

TEST(AskQuestionControllerTest, SetScrollOffsetClampsToProvidedViewport) {
    AskQuestionController controller({make_question()}, {});
    controller.handle({AskQuestionEventKind::SetScrollOffset, -1, 99, {}, 0, 3});
    EXPECT_EQ(controller.snapshot().scroll_offset, 3);
    controller.handle({AskQuestionEventKind::SetScrollOffset, -1, -4, {}, 0, 3});
    EXPECT_EQ(controller.snapshot().scroll_offset, 0);
}

TEST(AskQuestionControllerTest, CopyFocusedCopiesCustomDraft) {
    AskQuestionController controller({make_question()}, {});
    controller.handle(event(AskQuestionEventKind::BeginCustom));
    controller.handle({AskQuestionEventKind::InsertText, -1, 0, "draft"});

    const auto effects = controller.handle(event(AskQuestionEventKind::CopyFocused));
    const auto copy = std::find_if(
        effects.begin(), effects.end(), [](const auto& effect) {
            return effect.kind == AskQuestionEffectKind::CopyText;
        });
    ASSERT_NE(copy, effects.end());
    EXPECT_EQ(copy->text, "draft");
}

TEST(AskQuestionControllerTest, CopyFocusedIgnoresEmptyCustomDraft) {
    AskQuestionController controller({make_question()}, {});
    controller.handle(event(AskQuestionEventKind::BeginCustom));

    const auto effects = controller.handle(event(AskQuestionEventKind::CopyFocused));
    EXPECT_EQ(std::find_if(
                  effects.begin(), effects.end(), [](const auto& effect) {
                      return effect.kind == AskQuestionEffectKind::CopyText;
                  }),
              effects.end());
}

TEST(AskQuestionControllerTest, SummaryEnterSubmitsAndEscapeCancels) {
    AskQuestionController submit_controller({make_question(), make_question()}, {});
    submit_controller.handle({AskQuestionEventKind::ChooseOption, 0});
    submit_controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    submit_controller.handle({AskQuestionEventKind::ChooseOption, 0});
    submit_controller.handle(event(AskQuestionEventKind::SelectionFeedbackElapsed));
    ASSERT_EQ(submit_controller.snapshot().page, AskQuestionPage::Summary);

    submit_controller.handle(event(AskQuestionEventKind::SubmitFocused));
    ASSERT_TRUE(submit_controller.finished());
    ASSERT_TRUE(submit_controller.completion().has_value());
    EXPECT_FALSE(submit_controller.completion()->cancelled);

    AskQuestionController cancel_controller({make_question(), make_question()}, {});
    cancel_controller.handle({AskQuestionEventKind::MoveRight});
    cancel_controller.handle({AskQuestionEventKind::MoveRight});
    ASSERT_EQ(cancel_controller.snapshot().page, AskQuestionPage::Summary);
    cancel_controller.handle(event(AskQuestionEventKind::Escape));
    ASSERT_TRUE(cancel_controller.finished());
    ASSERT_TRUE(cancel_controller.completion().has_value());
    EXPECT_TRUE(cancel_controller.completion()->cancelled);
}
