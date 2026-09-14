#include <gtest/gtest.h>

#include "remote_control/channel_question_bridge.hpp"

#include <chrono>
#include <string>
#include <vector>

using namespace std::chrono_literals;

namespace {

using acecode::PendingQuestionRequestSnapshot;
using acecode::QuestionResponseStatus;
using acecode::rc::ChannelQuestionAction;
using acecode::rc::ChannelQuestionBridge;

PendingQuestionRequestSnapshot make_request(
    std::string request_id,
    std::uint64_t order,
    std::vector<nlohmann::json> questions,
    ChannelQuestionBridge::Clock::time_point created_at = {}) {
    PendingQuestionRequestSnapshot request;
    request.request_id = std::move(request_id);
    request.order = order;
    request.created_at = created_at;
    request.questions = nlohmann::json::array();
    for (auto& question : questions) {
        request.questions.push_back(std::move(question));
    }
    return request;
}

nlohmann::json question(std::string text,
                        std::string header,
                        bool multi_select = false) {
    return {
        {"id", text},
        {"text", std::move(text)},
        {"header", std::move(header)},
        {"multiSelect", multi_select},
        {"options", nlohmann::json::array({
            {{"label", "Alpha"}, {"value", "Alpha"}, {"description", "First choice"}},
            {{"label", "Beta"}, {"value", "Beta"}, {"description", "Second choice"}},
            {{"label", "Gamma"}, {"value", "Gamma"}, {"description", "Third choice"}},
        })},
    };
}

bool contains_text(const ChannelQuestionAction& action, const std::string& needle) {
    for (const auto& text : action.outbound_texts) {
        if (text.find(needle) != std::string::npos) return true;
    }
    return false;
}

} // namespace

TEST(ChannelQuestionBridge, RecognizesOnlyExactAqControlPrefixAfterTrim) {
    EXPECT_TRUE(ChannelQuestionBridge::is_control_input("/aq"));
    EXPECT_TRUE(ChannelQuestionBridge::is_control_input("  /aq 1  "));
    EXPECT_TRUE(ChannelQuestionBridge::is_control_input("/aq --status"));

    EXPECT_FALSE(ChannelQuestionBridge::is_control_input("/aquestion"));
    EXPECT_FALSE(ChannelQuestionBridge::is_control_input("/aqx 1"));
    EXPECT_FALSE(ChannelQuestionBridge::is_control_input("/aq\t1"));
    EXPECT_FALSE(ChannelQuestionBridge::is_control_input("answer 1"));
}

TEST(ChannelQuestionBridge, FormatsOneQuestionWithOptionsUsageAndBatchTimeout) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    auto request = make_request("req-1", 1, {question("Which plan?", "Plan")}, now);
    request.deadline = now + 30s;

    const auto action = bridge.add_request(std::move(request), now);

    ASSERT_EQ(action.outbound_texts.size(), 1u);
    const auto& text = action.outbound_texts.front();
    EXPECT_NE(text.find("需要你确认（第 1/1 题）【Plan】"), std::string::npos);
    EXPECT_NE(text.find("Which plan?"), std::string::npos);
    EXPECT_NE(text.find("1. Alpha\n   First choice"), std::string::npos);
    EXPECT_NE(text.find("3. Gamma\n   Third choice"), std::string::npos);
    EXPECT_NE(text.find("/aq 1"), std::string::npos);
    EXPECT_NE(text.find("/aq 自定义答案"), std::string::npos);
    EXPECT_NE(text.find("30 秒"), std::string::npos);
    EXPECT_FALSE(action.submission.has_value());
}

TEST(ChannelQuestionBridge, KeepsIntermediateAnswersInMemoryAndSubmitsWholeBatchOnce) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    bridge.add_request(
        make_request("req-1", 1,
                     {question("First question?", "First"),
                      question("Second question?", "Second")}),
        now);

    const auto first = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(first.handled);
    EXPECT_FALSE(first.submission.has_value());
    EXPECT_TRUE(contains_text(first, "已记录第 1/2 题"));
    EXPECT_TRUE(contains_text(first, "Second question?"));

    const auto final = bridge.handle_input("/aq Beta", now);
    ASSERT_TRUE(final.submission.has_value());
    EXPECT_TRUE(contains_text(final, "已记录第 2/2 题"));
    EXPECT_FALSE(contains_text(final, "答案已提交，继续执行"))
        << "提交结果未知前不能向用户谎报 channel 已赢得 first-wins 竞态";
    EXPECT_EQ(final.submission->request_id, "req-1");
    ASSERT_EQ(final.submission->response.answers.size(), 2u);
    EXPECT_EQ(final.submission->response.answers[0].question_id, "First question?");
    EXPECT_EQ(final.submission->response.answers[0].selected,
              std::vector<std::string>({"Alpha"}));
    EXPECT_EQ(final.submission->response.answers[1].question_id, "Second question?");
    EXPECT_EQ(final.submission->response.answers[1].selected,
              std::vector<std::string>({"Beta"}));
    const auto accepted = bridge.complete_submission(
        "req-1", QuestionResponseStatus::Accepted, now);
    EXPECT_TRUE(contains_text(accepted, "答案已提交，继续执行"));

    const auto duplicate = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(duplicate.handled);
    EXPECT_FALSE(duplicate.submission.has_value());
    EXPECT_TRUE(contains_text(duplicate, "等待问题关闭"));
}

TEST(ChannelQuestionBridge, ParsesMultiSelectWithAllDocumentedSeparators) {
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    const std::vector<std::pair<std::string, std::string>> cases = {
        {"/aq 1,3", "comma"},
        {"/aq 1，3", "wide-comma"},
        {"/aq 1 3", "space"},
        {"/aq 1 , 3", "mixed-spaces-and-comma"},
    };

    for (std::size_t i = 0; i < cases.size(); ++i) {
        ChannelQuestionBridge bridge;
        bridge.add_request(
            make_request("req-" + std::to_string(i), i + 1,
                         {question("Choose several?", "Many", true)}),
            now);
        const auto action = bridge.handle_input(cases[i].first, now);
        ASSERT_TRUE(action.submission.has_value()) << cases[i].second;
        ASSERT_EQ(action.submission->response.answers.size(), 1u);
        EXPECT_EQ(action.submission->response.answers[0].selected,
                  std::vector<std::string>({"Alpha", "Gamma"}))
            << cases[i].second;
    }
}

TEST(ChannelQuestionBridge, InvalidNumericInputDoesNotChangeDraftOrPosition) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    bridge.add_request(
        make_request("req-1", 1,
                     {question("Choose several?", "Many", true),
                      question("Choose one?", "One")}),
        now);

    for (const auto& input : {"/aq 1,1", "/aq 0", "/aq 1,,2", "/aq 1,9"}) {
        const auto invalid = bridge.handle_input(input, now);
        EXPECT_TRUE(invalid.handled) << input;
        EXPECT_FALSE(invalid.submission.has_value()) << input;
        EXPECT_TRUE(contains_text(invalid, "无效")) << input;
    }

    const auto status = bridge.handle_input("/aq --status", now);
    EXPECT_TRUE(contains_text(status, "第 1/2 题"));
    EXPECT_TRUE(contains_text(status, "已记录 0/2 题"));

    const auto valid = bridge.handle_input("/aq 1,2", now);
    EXPECT_TRUE(contains_text(valid, "已记录第 1/2 题"));
    EXPECT_TRUE(contains_text(valid, "Choose one?"));

    const auto too_many = bridge.handle_input("/aq 1 2", now);
    EXPECT_FALSE(too_many.submission.has_value());
    EXPECT_TRUE(contains_text(too_many, "单选"));
    const auto still_second = bridge.handle_input("/aq --status", now);
    EXPECT_TRUE(contains_text(still_second, "第 2/2 题"));
    EXPECT_TRUE(contains_text(still_second, "已记录 1/2 题"));
}

TEST(ChannelQuestionBridge, AcceptsLabelsAndCustomTextUpToTwoThousandCodepoints) {
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;

    ChannelQuestionBridge label_bridge;
    label_bridge.add_request(
        make_request("label", 1, {question("Choose?", "Label")}), now);
    const auto label = label_bridge.handle_input("/aq Gamma", now);
    ASSERT_TRUE(label.submission.has_value());
    EXPECT_EQ(label.submission->response.answers[0].selected,
              std::vector<std::string>({"Gamma"}));
    EXPECT_TRUE(label.submission->response.answers[0].custom_text.empty());

    ChannelQuestionBridge custom_bridge;
    custom_bridge.add_request(
        make_request("custom", 2, {question("Explain?", "Custom")}), now);
    std::string exactly_limit;
    for (int i = 0; i < 2000; ++i) exactly_limit += "界";
    const auto custom = custom_bridge.handle_input("/aq " + exactly_limit, now);
    ASSERT_TRUE(custom.submission.has_value());
    EXPECT_TRUE(custom.submission->response.answers[0].selected.empty());
    EXPECT_EQ(custom.submission->response.answers[0].custom_text, exactly_limit);

    ChannelQuestionBridge punctuation_bridge;
    punctuation_bridge.add_request(
        make_request("punctuation", 3, {question("Explain?", "Custom")}), now);
    const auto punctuation =
        punctuation_bridge.handle_input("/aq keep alpha, then beta", now);
    ASSERT_TRUE(punctuation.submission.has_value());
    EXPECT_EQ(punctuation.submission->response.answers[0].custom_text,
              "keep alpha, then beta");

    ChannelQuestionBridge too_long_bridge;
    too_long_bridge.add_request(
        make_request("too-long", 4, {question("Explain?", "Custom")}), now);
    const auto too_long =
        too_long_bridge.handle_input("/aq " + exactly_limit + "界", now);
    EXPECT_FALSE(too_long.submission.has_value());
    EXPECT_TRUE(contains_text(too_long, "2000"));
    const auto status = too_long_bridge.handle_input("/aq --status", now);
    EXPECT_TRUE(contains_text(status, "已记录 0/1 题"));
}

TEST(ChannelQuestionBridge, SupportsRepeatBackStatusAndCancel) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    auto request = make_request(
        "req-1", 1,
        {question("Question one?", "One"),
         question("Question two?", "Two"),
         question("Question three?", "Three")},
        now);
    request.deadline = now + 90s;
    bridge.add_request(std::move(request), now);

    const auto cannot_back = bridge.handle_input("/aq --back", now);
    EXPECT_TRUE(contains_text(cannot_back, "第一题"));
    const auto repeat = bridge.handle_input("/aq --repeat", now);
    EXPECT_TRUE(contains_text(repeat, "Question one?"));

    bridge.handle_input("/aq 1", now);
    bridge.handle_input("/aq 2", now);
    const auto back = bridge.handle_input("/aq --back", now);
    EXPECT_TRUE(contains_text(back, "Question two?"));
    const auto status = bridge.handle_input("/aq --status", now + 25s);
    EXPECT_TRUE(contains_text(status, "第 2/3 题"));
    EXPECT_TRUE(contains_text(status, "已记录 2/3 题"));
    EXPECT_TRUE(contains_text(status, "65 秒"));

    const auto cancel = bridge.handle_input("/aq --cancel", now + 25s);
    ASSERT_TRUE(cancel.submission.has_value());
    EXPECT_TRUE(cancel.submission->response.cancelled);
    EXPECT_TRUE(cancel.submission->response.answers.empty());
    EXPECT_FALSE(contains_text(cancel, "已取消当前整批问题"));
    const auto cancelled = bridge.complete_submission(
        "req-1", QuestionResponseStatus::Accepted, now + 25s);
    EXPECT_TRUE(contains_text(cancelled, "已取消当前整批问题"));
}

TEST(ChannelQuestionBridge, EmptyAndUnknownCommandsReturnExplicitUsage) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;

    const auto none = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(none.handled);
    EXPECT_TRUE(contains_text(none, "当前没有待回答的问题"));

    bridge.add_request(
        make_request("req-1", 1, {question("Choose?", "Usage")}), now);
    EXPECT_TRUE(contains_text(bridge.handle_input("/aq", now), "用法"));
    EXPECT_TRUE(contains_text(bridge.handle_input("/aq --later", now), "用法"));
}

TEST(ChannelQuestionBridge, SnapshotMergeIsFifoAndDeduplicatesRealtimeRequests) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    const auto newer =
        make_request("req-2", 2, {question("Second batch?", "Second")});
    const auto older =
        make_request("req-1", 1, {question("First batch?", "First")});

    const auto merged = bridge.merge_snapshot({newer, older}, now);
    EXPECT_TRUE(contains_text(merged, "First batch?"));
    EXPECT_EQ(bridge.pending_count(), 2u);

    const auto duplicate = bridge.add_request(newer, now);
    EXPECT_TRUE(duplicate.outbound_texts.empty());
    EXPECT_EQ(bridge.pending_count(), 2u);

    const auto closed =
        bridge.close_request("req-1", "answered", now);
    EXPECT_TRUE(contains_text(
        closed, "问题已在 ACECode 页面完成，本端草稿已清除"));
    EXPECT_TRUE(contains_text(closed, "Second batch?"));
    EXPECT_EQ(bridge.current_request_id(), "req-2");
}

TEST(ChannelQuestionBridge, AuthoritativeCloseBeforeSnapshotPreventsReopen) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    bridge.close_request("req-1", "timeout", now);

    const auto merged = bridge.merge_snapshot(
        {make_request("req-1", 1, {question("Stale?", "Stale")})}, now);
    EXPECT_TRUE(merged.outbound_texts.empty());
    EXPECT_EQ(bridge.pending_count(), 0u);

    const auto late = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(contains_text(late, "问题已超时或已结束"));
    const auto later = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(contains_text(later, "当前没有待回答的问题"));
}

TEST(ChannelQuestionBridge, BatchDeadlineRejectsLateAnswerWithoutLocalClose) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    auto request =
        make_request("req-1", 1, {question("Timed?", "Timeout")}, now);
    request.deadline = now + 1s;
    bridge.add_request(std::move(request), now);

    const auto late = bridge.handle_input("/aq 1", now + 2s);
    EXPECT_FALSE(late.submission.has_value());
    EXPECT_TRUE(contains_text(late, "问题已超时或已结束"));
    EXPECT_EQ(bridge.pending_count(), 1u)
        << "QuestionClosed, not the local deadline check, owns removal";
}

TEST(ChannelQuestionBridge, DefersCloseUntilSubmissionWinnerIsKnown) {
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;

    ChannelQuestionBridge channel_wins;
    channel_wins.add_request(
        make_request("channel", 1, {question("Choose?", "Race")}), now);
    const auto submit = channel_wins.handle_input("/aq 1", now);
    ASSERT_TRUE(submit.submission.has_value());
    const auto early_close =
        channel_wins.close_request("channel", "answered", now);
    EXPECT_TRUE(early_close.outbound_texts.empty());
    EXPECT_EQ(channel_wins.pending_count(), 1u);
    const auto accepted = channel_wins.complete_submission(
        "channel", QuestionResponseStatus::Accepted, now);
    EXPECT_TRUE(contains_text(accepted, "答案已提交，继续执行"));
    EXPECT_EQ(channel_wins.pending_count(), 0u);

    ChannelQuestionBridge web_wins;
    web_wins.add_request(
        make_request("web", 1, {question("Choose?", "Race")}), now);
    const auto attempted = web_wins.handle_input("/aq 1", now);
    ASSERT_TRUE(attempted.submission.has_value());
    web_wins.close_request("web", "answered", now);
    const auto rejected = web_wins.complete_submission(
        "web", QuestionResponseStatus::Closed, now);
    EXPECT_TRUE(contains_text(
        rejected, "问题已在 ACECode 页面完成，本端草稿已清除"));
    EXPECT_EQ(web_wins.pending_count(), 0u);
}

// 场景:问题挂起时用户在 IM 里直接发了一句普通文本(没带 /aq)。
// 修复前这条文本被当普通输入排在被问题阻塞的回合后面,问题却还在等 ——
// 用户以为答过了,双方互相等到超时。现在 binder 先调 begin_interjection
// 把队首批次标成提交中,再在锁外走 SessionClient::interject_question。
// 期望:返回队首 request_id;提交中再来的 /aq 报「等待问题关闭」;
// Accepted 回填时给出插话专属文案;随后 QuestionClosed(interjected) 静默
// 移除批次(phase 已是 Accepted,不再重复播报)。
TEST(ChannelQuestionBridge, PlainTextInterjectionMarksFrontBatchAndAnnouncesOnce) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    bridge.add_request(
        make_request("req-1", 1, {question("Which plan?", "Plan")}), now);

    const auto request_id = bridge.begin_interjection(now);
    ASSERT_TRUE(request_id.has_value());
    EXPECT_EQ(*request_id, "req-1");
    EXPECT_FALSE(bridge.begin_interjection(now).has_value())
        << "提交中的批次不能被第二次插话抢占";
    const auto blocked = bridge.handle_input("/aq 1", now);
    EXPECT_TRUE(contains_text(blocked, "等待问题关闭"));

    const auto accepted = bridge.complete_submission(
        "req-1", QuestionResponseStatus::Accepted, now);
    EXPECT_TRUE(contains_text(accepted, "已取消作答"));
    EXPECT_TRUE(contains_text(accepted, "插话"));
    EXPECT_FALSE(contains_text(accepted, "已取消当前整批问题"));

    const auto closed = bridge.close_request("req-1", "interjected", now);
    EXPECT_TRUE(closed.outbound_texts.empty());
    EXPECT_EQ(bridge.pending_count(), 0u);
}

// 场景:没有挂起问题 / 队首已超时时 begin_interjection 必须返回 nullopt,
// binder 据此退回普通 send_input;插话在 daemon 侧被拒(问题已被网页端
// 抢先回答)时 complete_submission(Closed) 不播报,由随后的 QuestionClosed
// 说明问题去向。
TEST(ChannelQuestionBridge, InterjectionFallsBackWhenNothingPendingOrRejected) {
    ChannelQuestionBridge bridge;
    const auto now = ChannelQuestionBridge::Clock::time_point{} + 10s;
    EXPECT_FALSE(bridge.begin_interjection(now).has_value());

    auto expired = make_request("late", 1, {question("Which plan?", "Plan")}, now);
    expired.deadline = now + 5s;
    bridge.add_request(std::move(expired), now);
    EXPECT_FALSE(bridge.begin_interjection(now + 6s).has_value())
        << "已超时的队首不能再被插话";
    bridge.close_request("late", "timeout", now + 6s);

    bridge.add_request(
        make_request("req-2", 2, {question("Which plan?", "Plan")}), now);
    ASSERT_TRUE(bridge.begin_interjection(now).has_value());
    const auto rejected = bridge.complete_submission(
        "req-2", QuestionResponseStatus::Closed, now);
    EXPECT_TRUE(rejected.outbound_texts.empty());
    const auto closed = bridge.close_request("req-2", "interjected", now);
    EXPECT_TRUE(contains_text(closed, "改为直接输入"));
    EXPECT_EQ(bridge.pending_count(), 0u);
}
