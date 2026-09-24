// MarkdownFenceTracker:从 DSML 过滤器抽出的围栏 / 行内代码跟踪器。
// 抽取前的围栏行为由 dsml_tool_call_recovery_test 原样守护;这里补三类
// DSML 测试没覆盖到、而文本工具调用恢复依赖的语义。

#include <gtest/gtest.h>

#include "provider/markdown_fence_tracker.hpp"

#include <string_view>

namespace {

using acecode::MarkdownFenceTracker;

void feed_all(MarkdownFenceTracker& tracker, std::string_view text) {
    for (char c : text) tracker.feed(c);
}

} // namespace

// 触发场景:~~~ 围栏(不只是 ```)。
// 期望行为:开启行之后处于围栏内,闭合行(同字符、长度不短于开启串、其后无正文)之后退出。
TEST(MarkdownFenceTrackerTest, TildeFenceOpensAndCloses) {
    MarkdownFenceTracker tracker;
    feed_all(tracker, "intro\n~~~xml\n");
    EXPECT_TRUE(tracker.in_fence());
    feed_all(tracker, "<invoke name=\"bash\">\n");
    EXPECT_TRUE(tracker.in_fence());
    // 反引号串不能闭合 ~~~ 围栏。
    feed_all(tracker, "```\n");
    EXPECT_TRUE(tracker.in_fence());
    feed_all(tracker, "~~~~\n");
    EXPECT_FALSE(tracker.in_fence());
    EXPECT_TRUE(tracker.at_line_prefix());
}

// 触发场景:行首前导空格。
// 期望行为:最多 3 个空格仍算「行首」;第 4 个空格起属于缩进代码块,不再是行首
// (文本工具调用的开标签只认行首)。
TEST(MarkdownFenceTrackerTest, FourSpaceIndentEndsLinePrefix) {
    MarkdownFenceTracker tracker;
    EXPECT_TRUE(tracker.at_line_prefix());
    feed_all(tracker, "   ");
    EXPECT_TRUE(tracker.at_line_prefix());
    tracker.feed(' ');
    EXPECT_FALSE(tracker.at_line_prefix());
    tracker.feed('\n');
    EXPECT_TRUE(tracker.at_line_prefix());
    feed_all(tracker, "text");
    EXPECT_FALSE(tracker.at_line_prefix());
}

// 触发场景:同一行里成对反引号之间的行内代码,以及未闭合的反引号。
// 期望行为:定界串之间 in_inline_code()=true,等长串闭合;双反引号里的单反引号
// 不闭合;换行后行内代码状态清空;行首 ``` 是围栏开启行而不是行内代码。
TEST(MarkdownFenceTrackerTest, InlineCodeSpanTracked) {
    MarkdownFenceTracker tracker;
    feed_all(tracker, "use ");
    EXPECT_FALSE(tracker.in_inline_code());
    tracker.feed('`');
    // 查询发生在下一个字节(例如 `<`)之前:反引号串此刻会打开行内代码。
    EXPECT_TRUE(tracker.in_inline_code());
    feed_all(tracker, "<invoke name=");
    EXPECT_TRUE(tracker.in_inline_code());
    tracker.feed('`');
    EXPECT_FALSE(tracker.in_inline_code());
    feed_all(tracker, " then ");
    EXPECT_FALSE(tracker.in_inline_code());

    feed_all(tracker, "``a ` b");
    EXPECT_TRUE(tracker.in_inline_code());
    feed_all(tracker, "``");
    EXPECT_FALSE(tracker.in_inline_code());

    feed_all(tracker, " dangling `open");
    EXPECT_TRUE(tracker.in_inline_code());
    tracker.feed('\n');
    EXPECT_FALSE(tracker.in_inline_code());

    feed_all(tracker, "```xml");
    EXPECT_FALSE(tracker.in_inline_code());
    EXPECT_TRUE(tracker.line_opening_fence());
    tracker.feed('\n');
    EXPECT_TRUE(tracker.in_fence());
    EXPECT_FALSE(tracker.in_inline_code());
}
