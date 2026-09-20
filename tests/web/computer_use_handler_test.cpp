#include "web/handlers/computer_use_handler.hpp"
#include "utils/utf8_path.hpp"

#include <gtest/gtest.h>
#include <chrono>
#include <filesystem>
#include <fstream>

using namespace acecode;
using namespace acecode::web;
using nlohmann::json;

namespace {
class ComputerUseConfigFile {
public:
    ComputerUseConfigFile() : root_(std::filesystem::temp_directory_path() /
        ("acecode-computer-use-config-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count()))) {
        std::filesystem::create_directories(root_);
    }
    ~ComputerUseConfigFile() {
        std::error_code ec;
        std::filesystem::remove_all(root_, ec);
    }
    std::string path() const { return path_to_utf8(root_ / "config.json"); }
    json read() const {
        std::ifstream input(root_ / "config.json");
        return json::parse(input);
    }
    void write(const json& value) const {
        std::ofstream output(root_ / "config.json");
        output << value.dump();
    }
private:
    std::filesystem::path root_;
};
} // namespace

TEST(ComputerUseSettings, DefaultDisabledAndPlatformExplicit) {
    AppConfig config;
    const auto settings = computer_use_settings(config);
    EXPECT_FALSE(settings["enabled"].get<bool>());
    EXPECT_EQ(settings["pointer_style"], "ace");
    EXPECT_EQ(settings["pointer_color"], "#2563eb");
    EXPECT_EQ(settings["supported"].get<bool>(), computer_use_supported());
#ifdef _WIN32
    EXPECT_EQ(settings["platform"], "windows");
#elif defined(__APPLE__)
    EXPECT_EQ(settings["platform"], "macos");
#else
    EXPECT_EQ(settings["platform"], "linux");
#endif
}

TEST(ComputerUseSettings, ValidationIsAtomicAndDoesNotAcceptTruthiness) {
    AppConfig config;
    config.computer_use.enabled = true;
    std::string error;
    for (const auto& patch : std::vector<json>{json::array(), nullptr,
        {{"enabled", "false"}}, {{"enabled", 1}}, {{"enabled", nullptr}},
        {{"enabled", false}, {"unsupported_field", "never-echo-this"}}}) {
        EXPECT_FALSE(apply_computer_use_settings(config, patch, error));
        EXPECT_TRUE(config.computer_use.enabled);
        EXPECT_FALSE(error.empty());
        EXPECT_EQ(error.find("never-echo-this"), std::string::npos);
    }
    ASSERT_TRUE(apply_computer_use_settings(config, {{"enabled", false}}, error));
    EXPECT_FALSE(config.computer_use.enabled);
    EXPECT_EQ(apply_computer_use_settings(config, {{"enabled", true}}, error), computer_use_supported());
    EXPECT_EQ(config.computer_use.enabled, computer_use_supported());
}

TEST(ComputerUseSettings, ExplicitEnableSurvivesRestartAndDisableClearsPersistedEnable) {
    ComputerUseConfigFile file;
    AppConfig config;
    config.provider.clear();
    config.ui.locale = "en-US";
    save_config(config, file.path());
    EXPECT_FALSE(file.read().contains("computer_use"));
    EXPECT_FALSE(load_config_from_path(file.path(), false).computer_use.enabled);
    config.computer_use.enabled = true;
    save_config(config, file.path());
    EXPECT_TRUE(file.read()["computer_use"]["enabled"].get<bool>());
    auto loaded = load_config_from_path(file.path(), false);
    EXPECT_TRUE(loaded.computer_use.enabled);
    loaded.computer_use.enabled = false;
    save_config(loaded, file.path());
    loaded = load_config_from_path(file.path(), false);
    EXPECT_FALSE(loaded.computer_use.enabled);
    EXPECT_EQ(loaded.ui.locale, "en-US");
    EXPECT_FALSE(file.read().contains("computer_use"));
}

TEST(ComputerUseSettings, MalformedConfigNeverImplicitlyEnablesControl) {
    ComputerUseConfigFile file;
    for (const auto& value : std::vector<json>{true, "true", json::array(),
        {{"enabled", "true"}}, {{"enabled", 1}}, {{"enabled", nullptr}}}) {
        file.write({{"computer_use", value}});
        EXPECT_THROW(load_config_from_path(file.path(), false), std::runtime_error);
    }
    file.write({{"computer_use", json::object()}});
    EXPECT_FALSE(load_config_from_path(file.path(), false).computer_use.enabled);
}

TEST(ComputerUseSettings, AppearancePartialPatchesPreserveUnmentionedSettings) {
    AppConfig config;
    std::string error;
    ASSERT_TRUE(apply_computer_use_settings(config, {{"pointer_style", "plain"}}, error));
    EXPECT_FALSE(config.computer_use.enabled);
    EXPECT_EQ(config.computer_use.pointer_color, "#2563eb");
    ASSERT_TRUE(apply_computer_use_settings(config, {{"pointer_color", "#Ab12EF"}}, error));
    EXPECT_FALSE(config.computer_use.enabled);
    EXPECT_EQ(config.computer_use.pointer_style, "plain");
    EXPECT_EQ(config.computer_use.pointer_color, "#ab12ef");
    ASSERT_TRUE(apply_computer_use_settings(config, json::object(), error));
    ASSERT_TRUE(apply_computer_use_settings(config, {{"enabled", false}}, error));
    const auto settings = computer_use_settings(config);
    EXPECT_EQ(settings["pointer_style"], "plain");
    EXPECT_EQ(settings["pointer_color"], "#ab12ef");
    // A copied Windows config can retain enabled=true on another platform;
    // changing appearance alone does not request or grant desktop control.
    config.computer_use.enabled = true;
    ASSERT_TRUE(apply_computer_use_settings(config, {{"pointer_style", "ace"}}, error));
    EXPECT_TRUE(config.computer_use.enabled);
    EXPECT_EQ(config.computer_use.pointer_color, "#ab12ef");
}

TEST(ComputerUseSettings, InvalidAppearancePatchesAreAtomic) {
    AppConfig config;
    config.computer_use.enabled = true;
    config.computer_use.pointer_style = "plain";
    config.computer_use.pointer_color = "#aabbcc";
    std::string error;
    for (const auto& patch : std::vector<json>{
            {{"enabled", false}, {"pointer_style", "other"}},
            {{"pointer_style", "ace"}, {"pointer_color", "rgb(1,2,3)"}},
            {{"pointer_style", true}}, {{"pointer_style", nullptr}},
            {{"pointer_color", 123456}}, {{"pointer_color", nullptr}},
            {{"pointer_color", "#ABC"}}, {{"pointer_color", "#12345678"}},
            {{"pointer_color", "#12345g"}}, {{"pointer_color", " #123456"}},
            {{"pointer_color", "#123456\n"}}, {{"pointer_color", "#112233"}, {"unknown", true}}}) {
        EXPECT_FALSE(apply_computer_use_settings(config, patch, error));
        EXPECT_FALSE(error.empty());
        EXPECT_TRUE(config.computer_use.enabled);
        EXPECT_EQ(config.computer_use.pointer_style, "plain");
        EXPECT_EQ(config.computer_use.pointer_color, "#aabbcc");
    }
}

TEST(ComputerUseSettings, DisabledAppearancePersistsAndLegacyDefaultsPreserveExplicitValues) {
    ComputerUseConfigFile file;
    file.write({{"computer_use", {{"enabled", false}}}});
    auto loaded = load_config_from_path(file.path(), false);
    EXPECT_EQ(loaded.computer_use.pointer_style, "ace");
    EXPECT_EQ(loaded.computer_use.pointer_color, "#2563eb");
    std::string error;
    ASSERT_TRUE(apply_computer_use_settings(loaded, {{"pointer_style", "plain"}, {"pointer_color", "#A1B2C3"}}, error));
    save_config(loaded, file.path());
    EXPECT_EQ(file.read()["computer_use"], (json{{"enabled", false}, {"pointer_style", "plain"}, {"pointer_color", "#a1b2c3"}}));
    loaded = load_config_from_path(file.path(), false);
    EXPECT_FALSE(loaded.computer_use.enabled);
    EXPECT_EQ(loaded.computer_use.pointer_style, "plain");
    EXPECT_EQ(loaded.computer_use.pointer_color, "#a1b2c3");
    loaded.computer_use.enabled = true;
    save_config(loaded, file.path());
    loaded = load_config_from_path(file.path(), false);
    loaded.computer_use.enabled = false;
    save_config(loaded, file.path());
    loaded = load_config_from_path(file.path(), false);
    EXPECT_FALSE(loaded.computer_use.enabled);
    EXPECT_EQ(loaded.computer_use.pointer_style, "plain");
    EXPECT_EQ(loaded.computer_use.pointer_color, "#a1b2c3");
    file.write({{"computer_use", {{"pointer_style", "plain"}}}});
    loaded = load_config_from_path(file.path(), false);
    EXPECT_FALSE(loaded.computer_use.enabled);
    EXPECT_EQ(loaded.computer_use.pointer_style, "plain");
    EXPECT_EQ(loaded.computer_use.pointer_color, "#2563eb");
}

TEST(ComputerUseSettings, ConfigFileValidatesAppearanceAndNormalizesHexColors) {
    ComputerUseConfigFile file;
    for (const auto& value : std::vector<json>{
            {{"pointer_style", "ACE"}}, {{"pointer_style", 1}}, {{"pointer_style", nullptr}},
            {{"pointer_color", "#123"}}, {{"pointer_color", "red"}}, {{"pointer_color", false}}}) {
        file.write({{"computer_use", value}});
        EXPECT_THROW(load_config_from_path(file.path(), false), std::runtime_error);
    }
    file.write({{"computer_use", {{"pointer_color", "#DEF012"}}}});
    auto loaded = load_config_from_path(file.path(), false);
    EXPECT_FALSE(loaded.computer_use.enabled);
    EXPECT_EQ(loaded.computer_use.pointer_color, "#def012");
    loaded.computer_use.pointer_color = "#FEDCBA";
    save_config(loaded, file.path());
    EXPECT_EQ(file.read()["computer_use"]["pointer_color"], "#fedcba");
    const auto original = file.read();
    loaded.computer_use.pointer_color = "not-a-color";
    EXPECT_THROW(save_config(loaded, file.path()), std::runtime_error);
    EXPECT_EQ(file.read(), original);
}
