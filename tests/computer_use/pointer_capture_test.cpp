#include "computer_use/pointer_capture.hpp"
#include <gtest/gtest.h>

#ifdef _WIN32
#include <array>
#include <limits>

namespace acecode::computer_use {
namespace {

using Pixel = std::array<unsigned char, 4>;

std::vector<unsigned char> image(int width, int height, Pixel pixel = {0, 0, 0, 255}) {
    std::vector<unsigned char> result;
    for (int index = 0; index < width * height; ++index) result.insert(result.end(), pixel.begin(), pixel.end());
    return result;
}

Pixel pixel_at(const std::vector<unsigned char>& pixels, int width, int x, int y) {
    const auto offset = (static_cast<std::size_t>(y) * width + x) * 4;
    return {pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]};
}

PointerSprite sprite(POINT position, int width, int height, int hotspot_x, int hotspot_y) {
    PointerSprite value;
    value.visible = true;
    value.position = position;
    value.width = width;
    value.height = height;
    value.hotspot_x = hotspot_x;
    value.hotspot_y = hotspot_y;
    value.bgra = image(width, height, {10, 20, 30, 255});
    return value;
}

TEST(ComputerUsePointerCapture, NegativeOriginAndHotspotPlaceGlyphWithoutResizing) {
    auto pixels = image(4, 3);
    const auto pointer = sprite({-190, -98}, 2, 2, 1, 1);
    ASSERT_TRUE(composite_pointer_sprite({-192, -100, -188, -97}, 4, 3, pixels, pointer));
    EXPECT_EQ(pixel_at(pixels, 4, 1, 1), (Pixel{10, 20, 30, 255}));
    EXPECT_EQ(pixel_at(pixels, 4, 2, 2), (Pixel{10, 20, 30, 255}));
    EXPECT_EQ(pixel_at(pixels, 4, 0, 0), (Pixel{0, 0, 0, 255}));
    EXPECT_EQ(pixel_at(pixels, 4, 3, 2), (Pixel{0, 0, 0, 255}));
}

TEST(ComputerUsePointerCapture, TopLeftClippingUsesTheCorrectSpriteRowsAndColumns) {
    auto pixels = image(3, 3);
    auto pointer = sprite({-100, -200}, 3, 3, 1, 1);
    for (int index = 0; index < 9; ++index) pointer.bgra[static_cast<std::size_t>(index) * 4] = static_cast<unsigned char>(index + 1);
    ASSERT_TRUE(composite_pointer_sprite({-100, -200, -97, -197}, 3, 3, pixels, pointer));
    EXPECT_EQ(pixel_at(pixels, 3, 0, 0)[0], 5);
    EXPECT_EQ(pixel_at(pixels, 3, 1, 0)[0], 6);
    EXPECT_EQ(pixel_at(pixels, 3, 0, 1)[0], 8);
    EXPECT_EQ(pixel_at(pixels, 3, 1, 1)[0], 9);
    EXPECT_EQ(pixel_at(pixels, 3, 2, 2), (Pixel{0, 0, 0, 255}));
}

TEST(ComputerUsePointerCapture, BottomRightClippingDoesNotWritePastTheCapture) {
    auto pixels = image(3, 3);
    const auto pointer = sprite({102, 202}, 3, 3, 0, 0);
    ASSERT_TRUE(composite_pointer_sprite({100, 200, 103, 203}, 3, 3, pixels, pointer));
    EXPECT_EQ(pixels.size(), 36u);
    EXPECT_EQ(pixel_at(pixels, 3, 2, 2), (Pixel{10, 20, 30, 255}));
    EXPECT_EQ(pixel_at(pixels, 3, 1, 2), (Pixel{0, 0, 0, 255}));
    EXPECT_EQ(pixel_at(pixels, 3, 2, 1), (Pixel{0, 0, 0, 255}));
}

TEST(ComputerUsePointerCapture, PremultipliedAlphaBlendsAllChannelsAndPreservesTransparentPixels) {
    auto pixels = image(2, 1, {80, 60, 40, 128});
    auto pointer = sprite({0, 0}, 2, 1, 0, 0);
    pointer.bgra = {10, 20, 30, 128, 0, 0, 0, 0};
    ASSERT_TRUE(composite_pointer_sprite({0, 0, 2, 1}, 2, 1, pixels, pointer));
    EXPECT_EQ(pixel_at(pixels, 2, 0, 0), (Pixel{50, 50, 50, 192}));
    EXPECT_EQ(pixel_at(pixels, 2, 1, 0), (Pixel{80, 60, 40, 128}));
}

TEST(ComputerUsePointerCapture, HotspotOutsideSurfaceDoesNotDrawAnOverlappingGlyph) {
    const auto original = image(3, 3);
    for (POINT position : {POINT{-1, 1}, POINT{1, -1}, POINT{3, 1}, POINT{1, 3}}) {
        auto pixels = original;
        const auto pointer = sprite(position, 3, 3, 1, 1);
        EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, 3, pixels, pointer));
        EXPECT_EQ(pixels, original);
    }
}

TEST(ComputerUsePointerCapture, InvalidBuffersGeometryAndHotspotsDoNotMutatePixels) {
    const auto original = image(3, 3);
    auto pixels = original;
    auto pointer = sprite({1, 1}, 2, 2, 0, 0);
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 6, 6}, 3, 3, pixels, pointer));
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 0, 3, pixels, pointer));
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, -1, pixels, pointer));
    pointer.hotspot_x = 2;
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, 3, pixels, pointer));
    pointer.hotspot_x = -1;
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, 3, pixels, pointer));
    pointer.hotspot_x = 0;
    pointer.bgra.pop_back();
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, 3, pixels, pointer));
    EXPECT_EQ(pixels, original);
    pixels.pop_back();
    const auto short_buffer = pixels;
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 3, 3}, 3, 3, pixels, sprite({1, 1}, 2, 2, 0, 0)));
    EXPECT_EQ(pixels, short_buffer);
}

TEST(ComputerUsePointerCapture, ExtremeDesktopOriginsDoNotOverflow) {
    constexpr auto low = (std::numeric_limits<LONG>::min)();
    auto pixels = image(2, 2);
    const auto pointer = sprite({low + 1, low + 1}, 1, 1, 0, 0);
    ASSERT_TRUE(composite_pointer_sprite({low, low, low + 2, low + 2}, 2, 2, pixels, pointer));
    EXPECT_EQ(pixel_at(pixels, 2, 1, 1), (Pixel{10, 20, 30, 255}));
    EXPECT_FALSE(composite_pointer_sprite({low, low, (std::numeric_limits<LONG>::max)(), low + 2}, 2, 2, pixels, pointer));
}

TEST(ComputerUsePointerCapture, InvisibleOrUnownedAgentPointerDoesNotDraw) {
    const auto original = image(2, 2);
    auto pixels = original;
    auto pointer = sprite({0, 0}, 1, 1, 0, 0);
    pointer.visible = false;
    EXPECT_FALSE(composite_pointer_sprite({0, 0, 2, 2}, 2, 2, pixels, pointer));
    pointer.visible = true;
    // A visible agent suppresses system-cursor fallback, even with no target.
    const auto result = composite_capture_pointer(nullptr, {0, 0, 2, 2}, 2, 2, pixels, &pointer);
    EXPECT_FALSE(result["visible"].get<bool>());
    EXPECT_EQ(pixels, original);
}

} // namespace
} // namespace acecode::computer_use
#endif
