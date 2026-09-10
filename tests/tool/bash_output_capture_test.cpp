#include <gtest/gtest.h>

#include "tool/bash_output_capture.hpp"
#include "session/tool_result_storage.hpp"
#include "utils/encoding.hpp"
#include "utils/utf8_path.hpp"
#include "utils/uuid.hpp"

#include <filesystem>
#include <fstream>
#include <string>

namespace {

class BashOutputCaptureTest : public testing::Test {
protected:
    void SetUp() override {
        root_ = std::filesystem::temp_directory_path() /
            ("acecode-bash-capture-" + acecode::generate_uuid());
        std::filesystem::create_directories(root_);
    }
    void TearDown() override {
        std::error_code ec;
        std::filesystem::remove_all(root_, ec);
    }
    std::string directory() const { return acecode::path_to_utf8(root_); }
    std::filesystem::path root_;
};

TEST_F(BashOutputCaptureTest, SmallOutputRemainsExactWithoutCreatingArtifact) {
    acecode::BashOutputCapture capture(true, directory());
    ASSERT_TRUE(capture.append("first\n"));
    ASSERT_TRUE(capture.append("unterminated"));
    EXPECT_EQ(capture.finish(), "first\nunterminated");
    EXPECT_EQ(capture.total_bytes(), 18u);
    EXPECT_TRUE(std::filesystem::is_empty(root_));
}

TEST_F(BashOutputCaptureTest, LargeOutputIsCompleteOnDiskAndMemoryStaysBounded) {
    acecode::BashOutputCapture capture(true, directory());
    std::string chunk(64 * 1024, 'x');
    constexpr std::size_t chunks = 1024;
    for (std::size_t i = 0; i < chunks; ++i) {
        chunk[0] = static_cast<char>('a' + i % 26);
        ASSERT_TRUE(capture.append(chunk));
        ASSERT_LE(capture.retained_bytes(), acecode::kBashInlineOutputLimitBytes);
    }
    const std::string result = capture.finish();
    ASSERT_TRUE(acecode::is_persisted_output_message(result));
    const auto path = acecode::path_from_utf8(acecode::persisted_output_filepath(result));
    ASSERT_EQ(std::filesystem::file_size(path), chunks * chunk.size());
    EXPECT_EQ(capture.total_bytes(), chunks * chunk.size());
    EXPECT_LT(result.size(), 4096u);
    EXPECT_FALSE(capture.truncated());
    std::ifstream input(path, std::ios::binary);
    std::string actual(chunk.size(), '\0');
    for (std::size_t i = 0; i < chunks; ++i) {
        chunk[0] = static_cast<char>('a' + i % 26);
        ASSERT_TRUE(input.read(actual.data(), static_cast<std::streamsize>(actual.size())));
        ASSERT_EQ(actual, chunk) << "chunk " << i;
    }
    EXPECT_EQ(input.peek(), std::ifstream::traits_type::eof());
}

TEST_F(BashOutputCaptureTest, LargeFirstChunkAlsoPreservesPreviewAndEntireFile) {
    acecode::BashOutputCapture capture(true, directory());
    const std::string expected = "FIRST" + std::string(200000, 'z') + "LAST";
    ASSERT_TRUE(capture.append(expected));
    const std::string result = capture.finish();
    EXPECT_NE(result.find("FIRST"), std::string::npos);
    std::ifstream input(acecode::path_from_utf8(
        acecode::persisted_output_filepath(result)), std::ios::binary);
    const std::string actual((std::istreambuf_iterator<char>(input)), {});
    EXPECT_EQ(actual, expected);
}

TEST_F(BashOutputCaptureTest, NonPreservingCaptureKeepsOriginalHeadAndLatestTail) {
    acecode::BashOutputCapture capture(false, directory());
    ASSERT_TRUE(capture.append("HEAD\n"));
    const std::string chunk(65536, 'm');
    for (int i = 0; i < 1024; ++i) {
        ASSERT_TRUE(capture.append(chunk));
        ASSERT_LE(capture.retained_bytes(), acecode::kBashInlineOutputLimitBytes);
    }
    ASSERT_TRUE(capture.append("\nTAIL"));
    const std::string result = capture.finish();
    EXPECT_EQ(result.rfind("HEAD\n", 0), 0u);
    EXPECT_EQ(result.substr(result.size() - 5), "\nTAIL");
    EXPECT_NE(result.find("bytes omitted"), std::string::npos);
    EXPECT_TRUE(capture.truncated());
    EXPECT_TRUE(std::filesystem::is_empty(root_));
}

TEST_F(BashOutputCaptureTest, Utf8PreviewAndTailRemainValidAtBoundary) {
    acecode::BashOutputCapture capture(false, directory());
    std::string chunk;
    for (int i = 0; i < 10000; ++i) chunk += "\xe4\xb8\xad";
    for (int i = 0; i < 10; ++i) ASSERT_TRUE(capture.append(chunk));
    EXPECT_TRUE(acecode::is_valid_utf8(capture.finish()));
}

TEST_F(BashOutputCaptureTest, PersistedUtf8PrefixIsSafeAndFileRemainsUnchanged) {
    acecode::BashOutputCapture capture(true, directory());
    std::string expected;
    for (int i = 0; i < 40000; ++i) expected += "\xe4\xb8\xad";
    ASSERT_TRUE(capture.append(expected));
    const std::string result = capture.finish();
    EXPECT_TRUE(acecode::is_valid_utf8(result));
    std::ifstream input(acecode::path_from_utf8(
        acecode::persisted_output_filepath(result)), std::ios::binary);
    const std::string actual((std::istreambuf_iterator<char>(input)), {});
    EXPECT_EQ(actual, expected);
}

TEST_F(BashOutputCaptureTest, StorageFailureDoesNotFallBackToUnboundedMemory) {
    const auto blocking_file = root_ / "not-a-directory";
    std::ofstream(blocking_file) << "blocked";
    acecode::BashOutputCapture capture(true, acecode::path_to_utf8(blocking_file));
    ASSERT_TRUE(capture.append("prefix"));
    const std::string chunk(200000, 'x');
    EXPECT_FALSE(capture.append(chunk));
    EXPECT_TRUE(capture.failed());
    for (int i = 0; i < 100; ++i) EXPECT_FALSE(capture.append(chunk));
    EXPECT_LE(capture.retained_bytes(), acecode::kBashInlineOutputLimitBytes);
    const std::string result = capture.finish();
    EXPECT_FALSE(acecode::is_persisted_output_message(result));
    EXPECT_NE(result.find("[Error]"), std::string::npos);
    EXPECT_NE(result.find("could not be preserved"), std::string::npos);
}

} // namespace
