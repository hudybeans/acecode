// 覆盖 AskUserQuestion 跨端题目数量配置的默认值、加载、钳制和稀疏写盘。

#include <gtest/gtest.h>

#include "config/config.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>
#include <string>

namespace {

std::filesystem::path temp_config_path(const std::string& label) {
    const auto suffix =
        std::chrono::steady_clock::now().time_since_epoch().count();
    return std::filesystem::temp_directory_path() /
        ("acecode-ask-config-" + label + "-" +
         std::to_string(suffix) + ".json");
}

void write_json(const std::filesystem::path& path,
                const nlohmann::json& value) {
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    ASSERT_TRUE(output.is_open());
    output << value.dump(2);
    ASSERT_TRUE(output.good());
}

nlohmann::json read_json(const std::filesystem::path& path) {
    std::ifstream input(path, std::ios::binary);
    EXPECT_TRUE(input.is_open());
    return nlohmann::json::parse(input);
}

void remove_file(const std::filesystem::path& path) {
    std::error_code ec;
    std::filesystem::remove(path, ec);
}

} // namespace

TEST(ConfigAskDefaults, StructAndAppConfigUseDefaults) {
    acecode::AskConfig ask;
    EXPECT_EQ(ask.max_questions, 10);
    EXPECT_EQ(ask.max_options, 6);

    acecode::AppConfig cfg;
    EXPECT_EQ(cfg.ask.max_questions, 10);
    EXPECT_EQ(cfg.ask.max_options, 6);
}

TEST(ConfigAskLoader, MissingValueKeepsDefault) {
    const auto path = temp_config_path("missing");
    write_json(path, nlohmann::json::object());

    const auto cfg = acecode::load_config_from_path(path.string());
    EXPECT_EQ(cfg.ask.max_questions, 10);
    EXPECT_EQ(cfg.ask.max_options, 6);
    remove_file(path);
}

TEST(ConfigAskLoader, AcceptsSupportedBoundaryValues) {
    for (const int value : {1, 10, 50}) {
        const auto path = temp_config_path("valid");
        write_json(path, {{"ask", {{"max_questions", value}}}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_questions, value) << "value=" << value;
        remove_file(path);
    }
    for (const int value : {4, 6, 8}) {
        const auto path = temp_config_path("valid-options");
        write_json(path, {{"ask", {{"max_options", value}}}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_options, value) << "value=" << value;
        remove_file(path);
    }
}

TEST(ConfigAskLoader, ClampsValuesOutsideSupportedRange) {
    struct Case { int configured; int expected; };
    const Case cases[] = {{0, 1}, {-1, 1}, {51, 50}, {999, 50}};
    for (const Case test_case : cases) {
        const auto path = temp_config_path("clamp");
        write_json(path, {{"ask", {{"max_questions", test_case.configured}}}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_questions, test_case.expected)
            << "configured=" << test_case.configured;
        remove_file(path);
    }
    const Case option_cases[] = {{3, 4}, {2, 4}, {9, 8}, {100, 8}};
    for (const Case test_case : option_cases) {
        const auto path = temp_config_path("clamp-options");
        write_json(path, {{"ask", {{"max_options", test_case.configured}}}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_options, test_case.expected)
            << "configured=" << test_case.configured;
        remove_file(path);
    }
}

TEST(ConfigAskLoader, ClampsWideIntegersBeforeNarrowing) {
    const nlohmann::json values[] = {
        4294967296LL, 18446744073709551615ULL, -4294967296LL};
    for (const auto& value : values) {
        const auto path = temp_config_path("wide-integer");
        write_json(path, {
            {"ask", {{"max_questions", value}}},
            {"tui", {{"question_min_visible_rows", value},
                     {"question_selection_feedback_ms", value}}},
        });
        const auto cfg = acecode::load_config_from_path(path.string());
        const bool positive = value > 0;
        EXPECT_EQ(cfg.ask.max_questions, positive ? 50 : 1) << value;
        EXPECT_EQ(cfg.tui.question_min_visible_rows, positive ? 12 : 2) << value;
        EXPECT_EQ(cfg.tui.question_selection_feedback_ms, positive ? 1000 : 0) << value;
        remove_file(path);
    }
}

TEST(ConfigAskLoader, InvalidTypesAndSectionKeepDefault) {
    for (const auto& ask_value : {
             nlohmann::json{{"max_questions", "10"}},
             nlohmann::json{{"max_questions", nullptr}},
             nlohmann::json{{"max_options", "8"}},
             nlohmann::json{{"max_options", nullptr}},
             nlohmann::json{{"max_options", 8.5}},
             nlohmann::json::array({10}),
             nlohmann::json("10")}) {
        const auto path = temp_config_path("invalid");
        write_json(path, {{"ask", ask_value}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_questions, 10);
        EXPECT_EQ(cfg.ask.max_options, 6);
        remove_file(path);
    }
}

TEST(ConfigAskSave, DefaultValueIsSparse) {
    const auto path = temp_config_path("default-save");
    acecode::save_config(acecode::AppConfig{}, path.string());

    const auto json = read_json(path);
    EXPECT_FALSE(json.contains("ask"));
    remove_file(path);
}

TEST(ConfigAskSave, NonDefaultValueIsPersistedAndRoundTrips) {
    const auto path = temp_config_path("non-default-save");
    acecode::AppConfig cfg;
    cfg.ask.max_questions = 12;
    cfg.ask.max_options = 8;
    acecode::save_config(cfg, path.string());

    const auto json = read_json(path);
    ASSERT_TRUE(json.contains("ask"));
    ASSERT_TRUE(json["ask"].is_object());
    EXPECT_EQ(json["ask"]["max_questions"], 12);
    EXPECT_EQ(json["ask"]["max_options"], 8);

    const auto loaded = acecode::load_config_from_path(path.string());
    EXPECT_EQ(loaded.ask.max_questions, 12);
    EXPECT_EQ(loaded.ask.max_options, 8);
    remove_file(path);
}

TEST(ConfigAskValidation, RejectsManuallyConstructedOutOfRangeValues) {
    acecode::AppConfig cfg;
    cfg.ask.max_questions = 0;
    auto errors = acecode::validate_config(cfg);
    ASSERT_FALSE(errors.empty());
    EXPECT_NE(errors.front().find("ask.max_questions"), std::string::npos);

    acecode::AppConfig cfg2;
    cfg2.ask.max_options = 9;
    auto errors2 = acecode::validate_config(cfg2);
    ASSERT_FALSE(errors2.empty());
    EXPECT_NE(errors2.front().find("ask.max_options"), std::string::npos);
}
