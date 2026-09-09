#include "desktop/taskbar_badge.hpp"

#include <gtest/gtest.h>

using namespace acecode::desktop;

TEST(TaskbarBadge, FormatsUnreadBoundaries) {
    EXPECT_EQ(taskbar_badge_label(0), "");
    EXPECT_EQ(taskbar_badge_label(1), "1");
    EXPECT_EQ(taskbar_badge_label(32), "32");
    EXPECT_EQ(taskbar_badge_label(99), "99");
    EXPECT_EQ(taskbar_badge_label(100), "99+");
}

TEST(TaskbarBadge, ParsesThemeColorsAndAcceptsClearWithoutColors) {
    const auto badge = parse_taskbar_badge_args(
        R"([{"count":32,"background":"#7c3aed","foreground":"#ffffff","outline":"#f5f5f2"}])");
    ASSERT_TRUE(badge);
    EXPECT_EQ(badge->count, 32);
    EXPECT_EQ(badge->background, (WindowBackgroundColor{0x7c, 0x3a, 0xed}));
    EXPECT_EQ(badge->foreground, (WindowBackgroundColor{255, 255, 255}));
    const auto clear = parse_taskbar_badge_args(R"([{"count":0}])");
    ASSERT_TRUE(clear);
    EXPECT_EQ(clear->count, 0);
}

TEST(TaskbarBadge, RejectsMalformedCountsAndColors) {
    for (const auto* value : {"null", "{}", "[]", "[null]", "[{},{}]",
                             "[{\"count\":-1}]", "[{\"count\":true}]",
                             "[{\"count\":1.5}]", "[{\"count\":2147483648}]",
                             "[{\"count\":18446744073709551615}]",
                             "[{\"count\":1}]",
                             "[{\"count\":1,\"background\":123}]"}) {
        EXPECT_FALSE(parse_taskbar_badge_args(value)) << value;
    }
}
