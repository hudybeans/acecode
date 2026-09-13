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

TEST(ConfigAskDefaults, StructAndAppConfigUseTenQuestions) {
    acecode::AskConfig ask;
    EXPECT_EQ(ask.max_questions, 10);

    acecode::AppConfig cfg;
    EXPECT_EQ(cfg.ask.max_questions, 10);
}

TEST(ConfigAskLoader, MissingValueKeepsDefault) {
    const auto path = temp_config_path("missing");
    write_json(path, nlohmann::json::object());

    const auto cfg = acecode::load_config_from_path(path.string());
    EXPECT_EQ(cfg.ask.max_questions, 10);
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
}

TEST(ConfigAskLoader, InvalidTypesAndSectionKeepDefault) {
    for (const auto& ask_value : {
             nlohmann::json{{"max_questions", "10"}},
             nlohmann::json{{"max_questions", nullptr}},
             nlohmann::json::array({10}),
             nlohmann::json("10")}) {
        const auto path = temp_config_path("invalid");
        write_json(path, {{"ask", ask_value}});

        const auto cfg = acecode::load_config_from_path(path.string());
        EXPECT_EQ(cfg.ask.max_questions, 10);
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
    acecode::save_config(cfg, path.string());

    const auto json = read_json(path);
    ASSERT_TRUE(json.contains("ask"));
    ASSERT_TRUE(json["ask"].is_object());
    EXPECT_EQ(json["ask"]["max_questions"], 12);

    const auto loaded = acecode::load_config_from_path(path.string());
    EXPECT_EQ(loaded.ask.max_questions, 12);
    remove_file(path);
}

TEST(ConfigAskValidation, RejectsManuallyConstructedOutOfRangeValues) {
    acecode::AppConfig cfg;
    cfg.ask.max_questions = 0;
    auto errors = acecode::validate_config(cfg);
    ASSERT_FALSE(errors.empty());
    EXPECT_NE(errors.front().find("ask.max_questions"), std::string::npos);
}
