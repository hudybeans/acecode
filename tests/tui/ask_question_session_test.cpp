#include <gtest/gtest.h>

#include "tui/ask_question_session.hpp"

using acecode::AskQuestion;
using acecode::tui::AskQuestionConfig;
using acecode::tui::AskQuestionEventKind;
using acecode::tui::AskQuestionSession;
using acecode::tui::ask_question_character_event;

namespace {
AskQuestion question() {
    AskQuestion q;
    q.question = "Pick one?";
    q.header = "Pick";
    q.options = {{"First", ""}, {"Second", ""}};
    return q;
}
}

TEST(AskQuestionSessionTest, CharacterNumbersBecomeShortcutsOutsideEditor) {
    const auto event = ask_question_character_event("2", false);
    EXPECT_EQ(event.kind, AskQuestionEventKind::ChooseNumber);
    EXPECT_EQ(event.option_index, 2);
}

TEST(AskQuestionSessionTest, CharactersRemainTextInsideEditor) {
    const auto event = ask_question_character_event("j", true);
    EXPECT_EQ(event.kind, AskQuestionEventKind::InsertText);
    EXPECT_EQ(event.text, "j");
}

TEST(AskQuestionSessionTest, FeedbackAndTimeoutUseInjectedClock) {
    const auto start = AskQuestionSession::TimePoint{};
    AskQuestionConfig config;
    config.selection_feedback_ms = 20;
    AskQuestionSession session({question()}, config, {}, 1, start);
    session.dispatch({AskQuestionEventKind::ChooseNumber, 1}, start);
    EXPECT_TRUE(session.feedback_deadline().has_value());
    session.tick(start + std::chrono::milliseconds(20));
    EXPECT_TRUE(session.finished());
}

TEST(AskQuestionSessionTest, FeedbackLockStillAllowsGlobalCancel) {
    const auto start = AskQuestionSession::TimePoint{};
    AskQuestionSession session({question()}, {}, {}, 0, start);
    session.dispatch({AskQuestionEventKind::ChooseNumber, 1}, start);
    const auto effects = session.dispatch(
        {AskQuestionEventKind::GlobalCancel}, start);
    ASSERT_EQ(effects.size(), 1u);
    EXPECT_TRUE(session.finished());
    ASSERT_TRUE(session.completion().has_value());
    EXPECT_TRUE(session.completion()->cancelled);
}

TEST(AskQuestionSessionTest, DoubleEscapeCancelsOnlyWithinWindow) {
    const auto start = AskQuestionSession::TimePoint{};
    AskQuestionSession session({question()}, {}, {}, 0, start);
    session.escape(start);
    EXPECT_FALSE(session.finished());
    session.escape(start + std::chrono::milliseconds(999));
    EXPECT_TRUE(session.finished());
}

TEST(AskQuestionSessionTest, LateSecondEscapeStartsNewLocalEscape) {
    const auto start = AskQuestionSession::TimePoint{};
    AskQuestionSession session({question()}, {}, {}, 0, start);
    session.escape(start);
    session.escape(start + std::chrono::milliseconds(1001));
    EXPECT_FALSE(session.finished());
    EXPECT_TRUE(session.escape_armed());
}
