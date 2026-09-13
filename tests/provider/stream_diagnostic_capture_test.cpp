#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

#include "provider/stream_diagnostic_capture.hpp"

namespace {

using acecode::StreamDiagnosticCapture;

TEST(StreamDiagnosticCapture, PreservesSmallBodiesAcrossChunkBoundaries) {
    StreamDiagnosticCapture capture;
    capture.append("data: ");
    capture.append("{\"message\":\"hello\"}\n\n");
    capture.append({});
    EXPECT_EQ(capture.str(), "data: {\"message\":\"hello\"}\n\n");
    EXPECT_FALSE(capture.truncated());
}

TEST(StreamDiagnosticCapture, PreservesPrefixAndRecentTailOfOneLargeChunk) {
    StreamDiagnosticCapture capture;
    const std::string source = "first-event\n" + std::string(1024 * 1024, 'x') +
        "\nlast-event";
    capture.append(source);
    const auto sample = capture.str();
    EXPECT_EQ(sample.size(), StreamDiagnosticCapture::kMaxBytes);
    EXPECT_EQ(sample.substr(0, 12), "first-event\n");
    EXPECT_EQ(sample.substr(sample.size() - 11), "\nlast-event");
    EXPECT_NE(sample.find(StreamDiagnosticCapture::kTruncationMarker),
              std::string::npos);
    EXPECT_TRUE(capture.truncated());
}

TEST(StreamDiagnosticCapture, RemainsBoundedAcrossLongLivedStream) {
    StreamDiagnosticCapture capture;
    capture.append("initial-event\n");
    const std::string chunk(4096, 'x');
    for (int i = 0; i < 16384; ++i) {
        capture.append(chunk);
        ASSERT_LE(capture.retained_bytes(), StreamDiagnosticCapture::kMaxBytes);
    }
    capture.append("terminal-event\n");
    const auto sample = capture.str();
    EXPECT_LE(sample.size(), StreamDiagnosticCapture::kMaxBytes);
    EXPECT_EQ(sample.substr(0, 14), "initial-event\n");
    EXPECT_EQ(sample.substr(sample.size() - 15), "terminal-event\n");
}

TEST(StreamDiagnosticCapture, ChunkingDoesNotChangeTheDiagnosticSample) {
    const std::string source = std::string(50000, 'a') + std::string(50000, 'b') +
        std::string(30000, 'c');
    StreamDiagnosticCapture whole;
    whole.append(source);
    for (const std::size_t chunk_size : {1u, 4093u, 32768u, 65536u}) {
        StreamDiagnosticCapture pieces;
        for (std::size_t offset = 0; offset < source.size(); offset += chunk_size) {
            pieces.append(std::string_view(source).substr(offset, chunk_size));
        }
        EXPECT_EQ(pieces.str(), whole.str());
    }
}

TEST(StreamDiagnosticCapture, TruncatedUtf8SamplesRemainJsonSerializable) {
    const std::string codepoint = "\xE4\xB8\xAD";
    std::string content;
    for (int i = 0; i < 30000; ++i) content += codepoint;
    for (int padding = 0; padding < 4; ++padding) {
        const std::string source = std::string(padding, 'a') + content;
        StreamDiagnosticCapture capture;
        // Deliberately split incoming codepoints across network chunks.
        for (std::size_t offset = 0; offset < source.size(); offset += 4096) {
            capture.append(std::string_view(source).substr(offset, 4096));
        }
        const std::string sample = capture.str();
        EXPECT_TRUE(capture.truncated());
        EXPECT_LE(sample.size(), StreamDiagnosticCapture::kMaxBytes);
        EXPECT_NO_THROW(nlohmann::json({{"raw_body", sample}}).dump());
        EXPECT_EQ(sample.substr(sample.size() - codepoint.size()), codepoint);
    }
}

} // namespace
