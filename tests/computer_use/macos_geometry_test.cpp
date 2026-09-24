#include "computer_use/macos_geometry.hpp"
#include <gtest/gtest.h>
#include <limits>

using namespace acecode::computer_use::macos;

TEST(ComputerUseMacCoordinates, ResizedRetinaImageMapsToScreenPointsAndNegativeOrigins) {
    const auto point = image_to_screen(1200, 600, 2400, 1200, {-1500, -300, 1200, 600});
    ASSERT_TRUE(point);
    EXPECT_DOUBLE_EQ(point->x, -900);
    EXPECT_DOUBLE_EQ(point->y, 0);
    const auto other = image_to_screen(600, 300, 1200, 600, {100, 200, 1200, 600});
    ASSERT_TRUE(other);
    EXPECT_DOUBLE_EQ(other->x, 700);
    EXPECT_DOUBLE_EQ(other->y, 500);
}
TEST(ComputerUseMacCoordinates, BoundsAreHalfOpenAndDoNotClampInvalidInput) {
    const ScreenRect rect{0, 0, 400, 300};
    EXPECT_FALSE(image_to_screen(-1, 0, 800, 600, rect));
    EXPECT_FALSE(image_to_screen(800, 0, 800, 600, rect));
    EXPECT_FALSE(image_to_screen(0, 600, 800, 600, rect));
    EXPECT_FALSE(image_to_screen(0, std::numeric_limits<double>::quiet_NaN(), 800, 600, rect));
    EXPECT_FALSE(image_to_screen(0, 0, 0, 600, rect));
    EXPECT_FALSE(image_to_screen(0, 0, 800, 600, {0, 0, 0, 300}));
}
TEST(ComputerUseMacCoordinates, CaptureUsesPerSurfaceScaleAndBoundsLongestEdge) {
    EXPECT_EQ(capture_size({0, 0, 800, 500}, 2), std::make_pair(1600, 1000));
    EXPECT_EQ(capture_size({0, 0, 2000, 1000}, 2), std::make_pair(2560, 1280));
    EXPECT_EQ(capture_size({0, 0, 2000, 1000}, 1), std::make_pair(2000, 1000));
    EXPECT_EQ(capture_size({0, 0, 500, 1000}, 0), std::make_pair(0, 0));
    EXPECT_EQ(capture_size({0, 0, std::numeric_limits<double>::infinity(), 1000}, 2), std::make_pair(0, 0));
}
