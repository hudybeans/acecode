#include "computer_use/coordinate_transform.hpp"
#include <gtest/gtest.h>

#include <limits>

namespace acecode::computer_use::coordinate_transform {
namespace {

void expect_point(const std::optional<Point>& point, std::int32_t x, std::int32_t y) {
    ASSERT_TRUE(point.has_value());
    EXPECT_EQ(point->x, x);
    EXPECT_EQ(point->y, y);
}

TEST(ComputerUseCoordinates, ScreenshotScalePreservesFloorAndNegativeOrigin) {
    const Bounds bounds{-1920, -1080, 0, 0};
    expect_point(screenshot_to_desktop(0, 0, bounds, 960, 540), -1920, -1080);
    expect_point(screenshot_to_desktop(480, 270, bounds, 960, 540), -960, -540);
    expect_point(screenshot_to_desktop(959.75, 539.75, bounds, 960, 540), -1, -1);
    expect_point(screenshot_to_desktop(480, 270, bounds, 1920, 1080), -1440, -810);
    expect_point(screenshot_to_desktop(1.75, 2.75, {100, 200, 400, 400}, 200, 80), 102, 206);
}

TEST(ComputerUseCoordinates, EachRelatedScreenshotUsesItsOwnOriginAndScale) {
    expect_point(screenshot_to_desktop(50, 20, {-1200, 50, -200, 650}, 500, 300), -1100, 90);
    expect_point(screenshot_to_desktop(50, 20, {1800, -700, 2100, -580}, 300, 120), 1850, -680);
}

TEST(ComputerUseCoordinates, ScreenshotRightAndBottomAreExcluded) {
    const Bounds bounds{500, -100, 1100, 300};
    expect_point(screenshot_to_desktop(299.99, 199.99, bounds, 300, 200), 1099, 299);
    EXPECT_FALSE(screenshot_to_desktop(300, 0, bounds, 300, 200));
    EXPECT_FALSE(screenshot_to_desktop(0, 200, bounds, 300, 200));
    EXPECT_FALSE(screenshot_to_desktop(-0.01, 0, bounds, 300, 200));
    EXPECT_FALSE(screenshot_to_desktop(0, -0.01, bounds, 300, 200));
    EXPECT_FALSE(screenshot_to_desktop(301, 201, bounds, 300, 200));
}

TEST(ComputerUseCoordinates, NonFiniteInputAndInvalidGeometryAreRejected) {
    const Bounds bounds{0, 0, 100, 100};
    for (double invalid : {std::numeric_limits<double>::quiet_NaN(),
                           std::numeric_limits<double>::infinity(),
                           -std::numeric_limits<double>::infinity()}) {
        EXPECT_FALSE(screenshot_to_desktop(invalid, 0, bounds, 100, 100));
        EXPECT_FALSE(screenshot_to_desktop(0, invalid, bounds, 100, 100));
    }
    EXPECT_FALSE(screenshot_to_desktop(0, 0, bounds, 0, 100));
    EXPECT_FALSE(screenshot_to_desktop(0, 0, bounds, 100, -1));
    EXPECT_FALSE(screenshot_to_desktop(0, 0, {10, 0, 10, 100}, 100, 100));
    EXPECT_FALSE(screenshot_to_desktop(0, 0, {0, 100, 100, 0}, 100, 100));
    EXPECT_FALSE(desktop_to_absolute({0, 0}, {0, 0}, 0, 100));
    EXPECT_FALSE(desktop_to_absolute({0, 0}, {0, 0}, 100, -1));
}

TEST(ComputerUseCoordinates, WideScreenshotBoundsDoNotOverflowBeforeScaling) {
    constexpr auto low = std::numeric_limits<std::int32_t>::min();
    constexpr auto high = std::numeric_limits<std::int32_t>::max();
    expect_point(screenshot_to_desktop(0.5, 0.75, {low, low, high, high}, 1, 1), -1, 1073741823);
}

TEST(ComputerUseCoordinates, AbsoluteCoordinatesUseCellCentersWithNegativeDesktopOrigin) {
    const Point origin{-1920, -1080};
    expect_point(desktop_to_absolute(origin, origin, 3840, 2160), 8, 15);
    expect_point(desktop_to_absolute({0, 0}, origin, 3840, 2160), 32776, 32783);
    expect_point(desktop_to_absolute({1919, 1079}, origin, 3840, 2160), 65527, 65520);
    expect_point(desktop_to_absolute({12, 34}, {12, 34}, 1, 1), 32768, 32768);
    expect_point(desktop_to_absolute({0, 1}, {0, 0}, 2, 2), 16384, 49152);
}

TEST(ComputerUseCoordinates, AbsoluteCoordinatesRejectAllFourOutsideEdges) {
    const Point origin{-1920, -1080};
    EXPECT_FALSE(desktop_to_absolute({-1921, 0}, origin, 3840, 2160));
    EXPECT_FALSE(desktop_to_absolute({1920, 0}, origin, 3840, 2160));
    EXPECT_FALSE(desktop_to_absolute({0, -1081}, origin, 3840, 2160));
    EXPECT_FALSE(desktop_to_absolute({0, 1080}, origin, 3840, 2160));
}

TEST(ComputerUseCoordinates, DesktopExtentAndNumeratorUseWideIntermediates) {
    constexpr auto low = std::numeric_limits<std::int32_t>::min();
    constexpr auto high = std::numeric_limits<std::int32_t>::max();
    expect_point(desktop_to_absolute({-2, -2}, {low, low}, high, high), 65535, 65535);
    EXPECT_FALSE(desktop_to_absolute({-1, -2}, {low, low}, high, high));
    // A representable point remains valid even when origin + size exceeds int32.
    expect_point(desktop_to_absolute({high, high}, {high - 100, high - 100}, 200, 200), 32931, 32931);
    EXPECT_FALSE(desktop_to_absolute({high, 0}, {low, 0}, high, 1));
}

} // namespace
} // namespace acecode::computer_use::coordinate_transform
