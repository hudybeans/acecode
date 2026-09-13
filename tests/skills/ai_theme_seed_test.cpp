#include "image/image_processor.hpp"
#include "skills/default_skill_seeder.hpp"
#include "skills/skill_registry.hpp"
#include "themes/theme_store.hpp"
#include "utils/sha256.hpp"

#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <regex>
#include <set>
#include <string>

namespace {
namespace fs = std::filesystem;

std::string read_bytes(const fs::path& path) {
    std::ifstream stream(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(stream), {}};
}

class AiThemeSeedTest : public ::testing::Test {
protected:
    void SetUp() override {
        const fs::path source = fs::absolute(fs::path(__FILE__));
        repository_ = source.parent_path().parent_path().parent_path();
        packaged_ = repository_ / "assets" / "seed";
        root_ = fs::temp_directory_path() /
            ("acecode-ai-theme-seed-" + std::to_string(
                std::chrono::steady_clock::now().time_since_epoch().count()));
        ASSERT_TRUE(fs::create_directory(root_));
        home_ = root_ / "profile" / ".acecode";
        fs::create_directories(home_);
    }

    void TearDown() override {
        std::error_code error;
        fs::remove_all(root_, error);
    }

    void write(const fs::path& path, const std::string& text) {
        fs::create_directories(path.parent_path());
        std::ofstream stream(path, std::ios::binary);
        ASSERT_TRUE(stream.is_open());
        stream << text;
        ASSERT_TRUE(stream.good());
    }

    const acecode::DefaultSkillSeedOutcome* theme_outcome(
        const acecode::DefaultSkillSeedInstallResult& result) {
        const auto found = std::find_if(
            result.outcomes.begin(), result.outcomes.end(),
            [](const auto& outcome) { return outcome.name == "ai-theme"; });
        return found == result.outcomes.end() ? nullptr : &*found;
    }

    fs::path repository_;
    fs::path packaged_;
    fs::path root_;
    fs::path home_;
};

TEST_F(AiThemeSeedTest, PreviousUserVersionReceivesDiscoverableThemeAndResources) {
    write(home_ / "seed.version", "2026-09-09.1\n");

    const auto result = acecode::reconcile_default_global_skills(
        home_, packaged_ / "skills");
    ASSERT_TRUE(result.error.empty()) << result.error;
    ASSERT_TRUE(result.version_written);
    const auto* outcome = theme_outcome(result);
    ASSERT_NE(outcome, nullptr);
    EXPECT_EQ(outcome->result, "installed");
    EXPECT_EQ(outcome->relative_path, "acecode/ai-theme");
    EXPECT_TRUE(outcome->acecode_owned);
    EXPECT_EQ(outcome->source_tree_sha256, outcome->installed_tree_sha256);

    acecode::SkillRegistry registry;
    registry.set_scan_roots({home_ / "skills"});
    registry.scan();
    const auto skill = registry.find("ai-theme");
    ASSERT_TRUE(skill.has_value());
    EXPECT_EQ(skill->command_key, "ai-theme");
    EXPECT_EQ(skill->category, "acecode");
    EXPECT_FALSE(skill->description.empty());
    EXPECT_NE(std::find(skill->tags.begin(), skill->tags.end(), "themes"),
              skill->tags.end());

    const auto files = registry.list_supporting_files("ai-theme");
    const std::set<std::string> expected = {
        "assets/acecode-home-reference.jpg",
        "assets/acecode-home-light.png",
        "assets/acecode-home-dark.png",
        "references/image-prompts.md",
        "references/palette-example.json",
        "references/theme-contract.md",
    };
    EXPECT_EQ(std::set<std::string>(files.begin(), files.end()), expected);
    for (const auto& relative : expected) {
        const auto installed = registry.resolve_skill_file("ai-theme", relative);
        ASSERT_TRUE(installed.has_value()) << relative;
        const fs::path original = packaged_ / "skills" / "acecode" /
            "ai-theme" / relative;
        EXPECT_EQ(acecode::sha256_hex(read_bytes(*installed)),
                  acecode::sha256_hex(read_bytes(original))) << relative;
    }

    const auto image = registry.resolve_skill_file(
        "ai-theme", "assets/acecode-home-reference.jpg");
    ASSERT_TRUE(image.has_value());
    std::string image_error;
    const auto info = acecode::image::probe_image_info(
        read_bytes(*image), &image_error);
    ASSERT_TRUE(info.has_value()) << image_error;
    EXPECT_GE(info->width, 1000);
    EXPECT_GE(info->height, 600);
    EXPECT_GT(info->width, info->height);

    const auto retry = acecode::reconcile_default_global_skills(
        home_, packaged_ / "skills");
    EXPECT_TRUE(retry.error.empty()) << retry.error;
    EXPECT_FALSE(retry.version_written);
    EXPECT_EQ(read_bytes(home_ / "seed.version"),
              read_bytes(packaged_ / "seed.version"));
}

TEST_F(AiThemeSeedTest, PaletteExampleMatchesThemeColorContract) {
    const fs::path example = packaged_ / "skills" / "acecode" /
        "ai-theme" / "references" / "palette-example.json";
    const auto palette = nlohmann::json::parse(read_bytes(example));
    ASSERT_TRUE(palette["name"].is_string());
    EXPECT_FALSE(palette["name"].get<std::string>().empty());
    const std::string mode = palette.value("mode", "");
    EXPECT_TRUE(mode == "light" || mode == "dark");
    ASSERT_TRUE(palette["colors"].is_object());
    ASSERT_EQ(palette["colors"].size(), 28u);

    const auto existing = nlohmann::json::parse(read_bytes(
        repository_ / "assets" / "themes" / "eva-01" / "palette.json"));
    std::set<std::string> expected_keys;
    for (const auto& color : existing.items()) expected_keys.insert(color.key());
    std::set<std::string> actual_keys;
    const std::regex hex_color("^#[0-9A-Fa-f]{6}$");
    for (const auto& color : palette["colors"].items()) {
        actual_keys.insert(color.key());
        ASSERT_TRUE(color.value().is_string()) << color.key();
        EXPECT_TRUE(std::regex_match(
            color.value().get<std::string>(), hex_color)) << color.key();
    }
    EXPECT_EQ(actual_keys, expected_keys);
    ASSERT_TRUE(palette.contains("appearance"));
    EXPECT_TRUE(acecode::themes::valid_theme_appearance(palette.at("appearance")));
    EXPECT_EQ(palette.at("appearance").size(), 3u);
    EXPECT_TRUE(palette.at("appearance").contains("logo_color"));
    EXPECT_TRUE(palette.at("appearance").contains("home_title_color"));
    EXPECT_TRUE(palette.at("appearance").contains("extend_to_titlebar"));
}

TEST_F(AiThemeSeedTest, SurfaceRevisionUpdatesPreviouslyManagedThemeSkillAndReferences) {
    const fs::path previous = root_ / "previous-seed";
    fs::copy(packaged_, previous, fs::copy_options::recursive);
    write(previous / "seed.version", "2026-09-12.1\n");
    const fs::path relative = fs::path("skills") / "acecode" / "ai-theme";
    const auto previous_skill = read_bytes(previous / relative / "SKILL.md") + "\nPrevious revision.\n";
    write(previous / relative / "SKILL.md", previous_skill);
    auto previous_palette = nlohmann::json::parse(read_bytes(
        previous / relative / "references" / "palette-example.json"));
    previous_palette.erase("appearance");
    write(previous / relative / "references" / "palette-example.json", previous_palette.dump(2));
    const auto initial = acecode::reconcile_default_global_skills(home_, previous / "skills");
    ASSERT_TRUE(initial.error.empty()) << initial.error;
    ASSERT_TRUE(initial.version_written);
    ASSERT_EQ(read_bytes(home_ / relative / "SKILL.md"), previous_skill);

    const auto updated = acecode::reconcile_default_global_skills(home_, packaged_ / "skills");
    ASSERT_TRUE(updated.error.empty()) << updated.error;
    ASSERT_TRUE(updated.version_written);
    const auto* outcome = theme_outcome(updated);
    ASSERT_NE(outcome, nullptr);
    EXPECT_TRUE(outcome->acecode_owned);
    EXPECT_EQ(outcome->source_tree_sha256, outcome->installed_tree_sha256);
    EXPECT_EQ(read_bytes(home_ / relative / "SKILL.md"), read_bytes(packaged_ / relative / "SKILL.md"));
    EXPECT_EQ(read_bytes(home_ / relative / "references" / "palette-example.json"),
              read_bytes(packaged_ / relative / "references" / "palette-example.json"));
    EXPECT_EQ(read_bytes(home_ / "seed.version"), read_bytes(packaged_ / "seed.version"));
}

TEST_F(AiThemeSeedTest, UpgradePreservesUserAuthoredThemeSkill) {
    const fs::path skill = home_ / "skills" / "acecode" / "ai-theme";
    const std::string user_skill =
        "---\nname: ai-theme\ndescription: User theme workflow\n---\n"
        "Use my own illustration references.\n";
    write(skill / "SKILL.md", user_skill);
    write(skill / "references" / "personal.md", "My reference notes.\n");
    write(home_ / "seed.version", "2026-09-09.1\n");

    const auto result = acecode::reconcile_default_global_skills(
        home_, packaged_ / "skills");
    ASSERT_TRUE(result.error.empty()) << result.error;
    ASSERT_TRUE(result.version_written);
    const auto* outcome = theme_outcome(result);
    ASSERT_NE(outcome, nullptr);
    EXPECT_FALSE(outcome->acecode_owned);
    EXPECT_EQ(read_bytes(skill / "SKILL.md"), user_skill);
    EXPECT_EQ(read_bytes(skill / "references" / "personal.md"),
              "My reference notes.\n");
    EXPECT_FALSE(fs::exists(skill / "assets" / "acecode-home-reference.jpg"));
}

} // namespace
