#include <gtest/gtest.h>

#include "image/image_processor.hpp"

#include <string>

namespace {

std::string ppm_image_4x2() {
    std::string bytes = "P6\n4 2\n255\n";
    for (int i = 0; i < 8; ++i) {
        bytes.push_back(static_cast<char>(i % 2 ? 255 : 16));
        bytes.push_back(static_cast<char>(i % 3 ? 64 : 220));
        bytes.push_back(static_cast<char>(i % 4 ? 180 : 32));
    }
    return bytes;
}

} // namespace

TEST(ImageProcessor, BelowThresholdDoesNotNormalize) {
    const std::string bytes = ppm_image_4x2();
    acecode::image::ImageNormalizeOptions opts;
    opts.compression_threshold_bytes = 1024 * 1024;
    opts.max_edge = 100;

    auto result = acecode::image::normalize_image_bytes(bytes, "image/png", opts);
    EXPECT_FALSE(result.attempted);
    EXPECT_TRUE(result.ok);
    EXPECT_FALSE(result.changed);
    EXPECT_EQ(result.reason, "below thresholds");
}

TEST(ImageProcessor, DimensionThresholdUsesStbResize) {
    const std::string bytes = ppm_image_4x2();
    acecode::image::ImageNormalizeOptions opts;
    opts.compression_threshold_bytes = 1024 * 1024;
    opts.max_edge = 2;

    auto result = acecode::image::normalize_image_bytes(bytes, "image/png", opts);
    ASSERT_TRUE(result.attempted);
    ASSERT_TRUE(result.ok) << result.error;
    ASSERT_TRUE(result.changed) << result.reason;
    EXPECT_EQ(result.backend, "stb");
    EXPECT_EQ(result.output.width, 2);
    EXPECT_EQ(result.output.height, 1);
    EXPECT_EQ(result.mime_type, "image/jpeg");

    std::string error;
    auto info = acecode::image::probe_image_info(result.bytes, &error);
    ASSERT_TRUE(info.has_value()) << error;
    EXPECT_EQ(info->width, 2);
    EXPECT_EQ(info->height, 1);
}

TEST(ImageProcessor, TenMiBIsCompressionThreshold) {
    EXPECT_EQ(acecode::image::kImageCompressionThresholdBytes,
              10u * 1024u * 1024u);
}

TEST(ImageProcessor, ForcedPngConvertsOpaqueImagesWithoutCompressionThreshold) {
    acecode::image::ImageNormalizeOptions options;
    options.force_png = true;
    const auto result = acecode::image::normalize_image_bytes(ppm_image_4x2(), "", options);
    ASSERT_TRUE(result.ok) << result.error;
    EXPECT_TRUE(result.changed);
    EXPECT_EQ(result.mime_type, "image/png");
    EXPECT_EQ(result.bytes.substr(0, 8), std::string("\x89PNG\r\n\x1a\n", 8));
    EXPECT_EQ(result.output.width, 4);
    EXPECT_EQ(result.output.height, 2);
}

TEST(ImageProcessor, ForcedPngResizesThumbnailsAndRejectsTruncatedImages) {
    acecode::image::ImageNormalizeOptions options;
    options.force_png = true;
    options.max_edge = 2;
    const auto result = acecode::image::normalize_image_bytes(ppm_image_4x2(), "", options);
    ASSERT_TRUE(result.ok) << result.error;
    EXPECT_EQ(result.output.width, 2);
    EXPECT_EQ(result.output.height, 1);
    EXPECT_EQ(result.mime_type, "image/png");
    EXPECT_FALSE(acecode::image::normalize_image_bytes(result.bytes.substr(0, 28), "", options).ok);
}

TEST(ImageProcessor, ExactlyTenMiBAttemptsNormalization) {
    std::string bytes(acecode::image::kImageCompressionThresholdBytes, 'x');
    auto result = acecode::image::normalize_image_bytes(bytes, "image/png");
    EXPECT_TRUE(result.attempted);
    EXPECT_FALSE(result.ok);
}
