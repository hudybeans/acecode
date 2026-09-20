#include <gtest/gtest.h>

#include "config/config.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>

namespace {

class ConfigDesktopMultiInstance : public testing::Test {
protected:
    std::filesystem::path directory = std::filesystem::temp_directory_path() /
        ("acecode-multi-instance-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count()));
    std::filesystem::path path = directory / "config.json";

    void SetUp() override { std::filesystem::create_directories(directory); }
    void TearDown() override {
        std::error_code ec;
        std::filesystem::remove_all(directory, ec);
    }
    acecode::AppConfig load(const nlohmann::json& value) {
        {
            std::ofstream out(path, std::ios::binary);
            out << value.dump();
        }
        return acecode::load_config_from_path(path.string(), false);
    }
};

TEST_F(ConfigDesktopMultiInstance, MissingAndInvalidValuesRemainDisabled) {
    EXPECT_FALSE(acecode::AppConfig{}.desktop.allow_multiple_instances);
    EXPECT_FALSE(load(nlohmann::json::object()).desktop.allow_multiple_instances);
    for (const auto& value : {nlohmann::json("true"), nlohmann::json(1),
                              nlohmann::json(nullptr), nlohmann::json::object()}) {
        EXPECT_FALSE(load({{"desktop", {{"allow_multiple_instances", value}}}})
                         .desktop.allow_multiple_instances);
    }
}

TEST_F(ConfigDesktopMultiInstance, BooleanLoadsAndRoundTripsWithoutChangingOtherPreferences) {
    auto cfg = load({{"desktop", {{"allow_multiple_instances", true},
                                  {"continue_background_process", true}}},
                     {"web_ui", {{"font_size", "large"}}}});
    EXPECT_TRUE(cfg.desktop.allow_multiple_instances);
    acecode::save_config(cfg, path.string());
    auto restored = acecode::load_config_from_path(path.string(), false);
    EXPECT_TRUE(restored.desktop.allow_multiple_instances);
    EXPECT_TRUE(restored.desktop.continue_background_process);
    EXPECT_EQ(restored.web_ui.font_size, "large");

    restored.desktop.allow_multiple_instances = false;
    acecode::save_config(restored, path.string());
    EXPECT_FALSE(acecode::load_config_from_path(path.string(), false)
                     .desktop.allow_multiple_instances);
    std::ifstream input(path);
    const auto saved = nlohmann::json::parse(input);
    EXPECT_FALSE(saved.at("desktop").contains("allow_multiple_instances"));
    EXPECT_TRUE(saved.at("desktop").at("continue_background_process"));
}

} // namespace
