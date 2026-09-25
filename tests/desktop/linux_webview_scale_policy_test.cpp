#include "desktop/linux_webview_scale_policy.hpp"

#include <gtest/gtest.h>

namespace acecode::desktop {
namespace {

TEST(LinuxWebviewScalePolicyTest, FractionalDisplayScaleBalancesTextAndPage) {
    const auto at_125 = plan_linux_webview_scale(120 * 1024, 1);
    ASSERT_TRUE(at_125.apply);
    EXPECT_DOUBLE_EQ(at_125.page_zoom, 1.25);
    EXPECT_EQ(at_125.font_dpi, 96 * 1024);

    const auto at_150 = plan_linux_webview_scale(144 * 1024, 1);
    ASSERT_TRUE(at_150.apply);
    EXPECT_DOUBLE_EQ(at_150.page_zoom, 1.5);
}

TEST(LinuxWebviewScalePolicyTest, UsesOnlyScaleMissingFromGtkWindow) {
    const auto at_200 = plan_linux_webview_scale(192 * 1024, 2);
    ASSERT_TRUE(at_200.apply);
    EXPECT_DOUBLE_EQ(at_200.page_zoom, 1.0);
    EXPECT_EQ(at_200.font_dpi, 96 * 1024);
}

TEST(LinuxWebviewScalePolicyTest, UsesEffectiveDpiWithoutDeepinPreference) {
    // Regression: com.deepin.xsettings scale-factor was 1.0, but native
    // XSettings still supplied 120 DPI. That preference must not gate this.
    EXPECT_TRUE(plan_linux_webview_scale(120 * 1024, 1).apply);
    EXPECT_FALSE(plan_linux_webview_scale(96 * 1024, 1).apply);
    EXPECT_FALSE(plan_linux_webview_scale(96 * 1024, 2).apply);
}

TEST(LinuxWebviewScalePolicyTest, RejectsInvalidSignals) {
    EXPECT_FALSE(plan_linux_webview_scale(-1, 1).apply);
    EXPECT_FALSE(plan_linux_webview_scale(0, 1).apply);
    EXPECT_FALSE(plan_linux_webview_scale(480 * 1024, 1).apply);
    EXPECT_FALSE(plan_linux_webview_scale(120 * 1024, 0).apply);
    EXPECT_FALSE(plan_linux_webview_scale(120 * 1024, 2).apply);
}

TEST(LinuxWebviewScalePolicyTest, RecognizesOnlyDeepinDesktopTokens) {
    EXPECT_TRUE(is_deepin_desktop("Deepin"));
    EXPECT_TRUE(is_deepin_desktop("GNOME:deepin"));
    EXPECT_FALSE(is_deepin_desktop("GNOME"));
    EXPECT_FALSE(is_deepin_desktop("NotDeepin"));
    EXPECT_FALSE(is_deepin_desktop(""));
}

} // namespace
} // namespace acecode::desktop
