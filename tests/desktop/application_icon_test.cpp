#include "desktop/application_icon.hpp"

#include <gtest/gtest.h>

#include <chrono>
#include <filesystem>
#include <fstream>

namespace acecode::desktop {
namespace {
namespace fs = std::filesystem;

class ApplicationIconTest : public ::testing::Test {
protected:
    fs::path root;

    void SetUp() override {
        const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
        root = fs::path(::testing::TempDir()) / ("acecode-icon-" + std::to_string(nonce));
        fs::create_directories(root);
    }

    void TearDown() override {
        std::error_code ec;
        fs::remove_all(root, ec);
    }

    fs::path add_icon(const fs::path& relative) {
        const fs::path path = root / relative;
        fs::create_directories(path.parent_path());
        std::ofstream(path, std::ios::binary) << "test icon";
        return path;
    }
};

TEST_F(ApplicationIconTest, PackagedIconWinsOverWorkingDirectory) {
    const auto packaged = add_icon("application/acecode-logo.png");
    add_icon("workspace/acecode-logo.png");
    EXPECT_EQ(find_application_icon_path(root / "application/acecode-desktop",
                                         root / "workspace"), packaged);
}

TEST_F(ApplicationIconTest, DevelopmentBuildPrefersSourceOverStaleWebOutput) {
    const auto source = add_icon("project/web/public/acecode-logo.png");
    add_icon("project/web/dist/acecode-logo.png");
    EXPECT_EQ(find_application_icon_path(root / "project/build/Release/acecode-desktop",
                                         {}), source);
}

TEST_F(ApplicationIconTest, SkipsDirectoriesAndRetainsWorkingDirectoryFallback) {
    fs::create_directories(root / "application/acecode-logo.png");
    const auto fallback = add_icon("workspace/web/dist/acecode-logo.png");
    EXPECT_EQ(find_application_icon_path(root / "application/acecode-desktop",
                                         root / "workspace"), fallback);
}

TEST_F(ApplicationIconTest, MissingAndEmptyRootsHaveNoIcon) {
    EXPECT_TRUE(find_application_icon_path({}, {}).empty());
    EXPECT_TRUE(find_application_icon_path(root / "missing/acecode-desktop", {}).empty());
}

TEST_F(ApplicationIconTest, LegacyArtworkFallbackSupportsUnicodePaths) {
    const auto directory = fs::u8path(u8"project-图标");
    const auto fallback = add_icon(directory / "assets/windows/acecode_icon.png");
    EXPECT_EQ(find_application_icon_path(root / directory / "build/acecode-desktop", {}),
              fallback);
}

} // namespace
} // namespace acecode::desktop
