#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

#include "utils/encoding.hpp"

#include <string>
#include <vector>

namespace {

void expect_json_safe(const std::string& text) {
    EXPECT_TRUE(acecode::is_valid_utf8(text));
    EXPECT_NO_THROW((void)nlohmann::json(text).dump());
}

const std::vector<std::string> invalid_sequences = {
    "\x80", "\xBF", "\xC0\x80", "\xC0\xB4\xD4\xB4", "\xC1\xBF",
    "\xE0\x80\x80", "\xE0\x9F\xBF", "\xED\xA0\x80", "\xED\xBF\xBF",
    "\xF0\x80\x80\x80", "\xF0\x8F\xBF\xBF", "\xF4\x90\x80\x80",
    "\xF5\x80\x80\x80", "\xF7\xBF\xBF\xBF", "\xFF", "\xC2",
    "\xE2\x82", "\xF0\x9F\x92", "\xE0\x80", "\xF4\x90", "\xE2!"
};

} // namespace

TEST(Encoding, RejectsInvalidUnicodeScalarEncodingsAndMatchesStrictJson) {
    for (const auto& bytes : invalid_sequences) {
        EXPECT_FALSE(acecode::is_valid_utf8(bytes));
        EXPECT_THROW((void)nlohmann::json(bytes).dump(), nlohmann::json::type_error);
        expect_json_safe(acecode::ensure_utf8(bytes));
        for (size_t split = 0; split <= bytes.size(); ++split) {
            acecode::IncrementalTextDecoder decoder(65001);
            expect_json_safe(decoder.push(bytes.data(), split));
            expect_json_safe(decoder.push(bytes.data() + split, bytes.size() - split));
            expect_json_safe(decoder.flush());
        }
    }
}

TEST(Encoding, PreservesAllUnicodeBoundaryValuesAtEveryChunkSplit) {
    const std::string valid = std::string("A\0\x7F", 3) +
        "\xC2\x80\xDF\xBF\xE0\xA0\x80\xED\x9F\xBF\xEE\x80\x80"
        "\xEF\xBF\xBF\xF0\x90\x80\x80\xF4\x8F\xBF\xBF";
    EXPECT_TRUE(acecode::is_valid_utf8(valid));
    for (size_t split = 0; split <= valid.size(); ++split) {
        for (unsigned int codepage : {65001u, 936u}) {
            acecode::IncrementalTextDecoder decoder(codepage);
            const auto first = decoder.push(valid.data(), split);
            const auto second = decoder.push(valid.data() + split, valid.size() - split);
            expect_json_safe(first);
            expect_json_safe(second);
            EXPECT_EQ(first + second + decoder.flush(), valid);
        }
    }
}

TEST(Encoding, InvalidUtf8DoesNotConsumeFollowingPartialCharacter) {
    acecode::IncrementalTextDecoder decoder(65001);
    EXPECT_EQ(decoder.push("\xC0\xE4\xB8", 3), "?");
    EXPECT_EQ(decoder.push("\xAD", 1), u8"中");
    EXPECT_TRUE(decoder.flush().empty());
}

TEST(Encoding, TrimmingPartialUtf8LeavesMalformedSequencesForRepair) {
    for (const auto& bytes : {std::string("\xC0"), std::string("\xE0\x80"),
                              std::string("\xED\xA0"), std::string("\xF4\x90")}) {
        auto trimmed = bytes;
        acecode::trim_trailing_partial_utf8(trimmed);
        EXPECT_EQ(trimmed, bytes);
    }
    std::string partial = "hello\xE4\xB8";
    acecode::trim_trailing_partial_utf8(partial);
    EXPECT_EQ(partial, "hello");
}

#ifdef _WIN32
TEST(Encoding, DumpRegressionGbkAtByte58ConvertsAcrossEverySplit) {
    const std::string raw = std::string(58, 'a') + "\xC0\xB4\xD4\xB4";
    const std::string expected = std::string(58, 'a') + u8"来源";
    EXPECT_FALSE(acecode::is_valid_utf8(raw));
    EXPECT_THROW((void)nlohmann::json(raw).dump(), nlohmann::json::type_error);
    for (size_t split = 0; split <= raw.size(); ++split) {
        acecode::IncrementalTextDecoder decoder(936);
        const auto first = decoder.push(raw.data(), split);
        const auto second = decoder.push(raw.data() + split, raw.size() - split);
        expect_json_safe(first);
        expect_json_safe(second);
        EXPECT_EQ(first + second + decoder.flush(), expected) << split;
    }
    acecode::IncrementalTextDecoder decoder(936);
    std::string result;
    for (char byte : raw) result += decoder.push(&byte, 1);
    EXPECT_EQ(result + decoder.flush(), expected);
    EXPECT_EQ(decoder.push(u8"来源", 6) + decoder.flush(), u8"来源");
}

TEST(Encoding, SingleByteCodepageDoesNotBufferAnIndependentHighByte) {
    acecode::IncrementalTextDecoder decoder(1252);
    EXPECT_EQ(decoder.push("\x80", 1), u8"\u20ac");
    EXPECT_EQ(decoder.flush(), "");
}
#endif
