#include "upgrade/macos_bundle.hpp"
#ifdef __APPLE__
#include "upgrade/macos_app_installer.hpp"
#include <unistd.h>
#endif

#include <gtest/gtest.h>

#include <chrono>
#include <filesystem>
#include <fstream>

namespace fs = std::filesystem;

namespace {

class TempDir {
public:
    explicit TempDir(const std::string& label) {
        path_ = fs::temp_directory_path() /
            (label + "-" + std::to_string(
                std::chrono::steady_clock::now().time_since_epoch().count()));
        std::error_code ec;
        fs::create_directories(path_, ec);
        EXPECT_FALSE(ec) << ec.message();
    }

    ~TempDir() {
        std::error_code ec;
        fs::remove_all(path_, ec);
    }

    const fs::path& path() const { return path_; }

private:
    fs::path path_;
};

void write_file(const fs::path& path) {
    fs::create_directories(path.parent_path());
    std::ofstream(path, std::ios::binary) << "fixture";
}

void create_bundle(const fs::path& bundle) {
    write_file(bundle / "Contents" / "Info.plist");
    write_file(bundle / "Contents" / "MacOS" / "ACECode");
    write_file(bundle / "Contents" / "MacOS" / "acecode-daemon");
}

} // namespace

TEST(MacosBundleLayout, FindsEnclosingBundleOnlyForBundledDaemon) {
    const fs::path app = fs::path("/Users/test/Applications/ACECode.app");
    const fs::path daemon = app / "Contents" / "MacOS" / "acecode-daemon";

    auto found = acecode::upgrade::macos_app_bundle_from_executable(daemon);
    ASSERT_TRUE(found.has_value());
    EXPECT_EQ(*found, app);

    EXPECT_FALSE(acecode::upgrade::macos_app_bundle_from_executable(
        app / "Contents" / "MacOS" / "ACECode"));
    EXPECT_FALSE(acecode::upgrade::macos_app_bundle_from_executable(
        fs::path("/usr/local/bin/acecode")));
    EXPECT_FALSE(acecode::upgrade::macos_app_bundle_from_executable(
        fs::path("ACECode.app/Contents/MacOS/acecode-daemon")));
}

TEST(MacosBundleLayout, FindsDirectAndSingleWrapperStagedApps) {
    TempDir direct("acecode-macos-stage-direct");
    create_bundle(direct.path() / "ACECode.app");
    std::string error;
    auto direct_result = acecode::upgrade::find_staged_macos_app_bundle(
        direct.path(), &error);
    ASSERT_TRUE(direct_result.has_value()) << error;
    EXPECT_EQ(*direct_result, direct.path() / "ACECode.app");

    TempDir wrapped("acecode-macos-stage-wrapped");
    create_bundle(wrapped.path() / "acecode-macos-arm64" / "ACECode.app");
    auto wrapped_result = acecode::upgrade::find_staged_macos_app_bundle(
        wrapped.path(), &error);
    ASSERT_TRUE(wrapped_result.has_value()) << error;
    EXPECT_EQ(*wrapped_result,
              wrapped.path() / "acecode-macos-arm64" / "ACECode.app");
}

TEST(MacosBundleLayout, RejectsIncompleteAmbiguousAndSymlinkedApps) {
    TempDir incomplete("acecode-macos-stage-incomplete");
    write_file(incomplete.path() / "ACECode.app" / "Contents" / "Info.plist");
    std::string error;
    EXPECT_FALSE(acecode::upgrade::find_staged_macos_app_bundle(
        incomplete.path(), &error));
    EXPECT_NE(error.find("complete ACECode.app"), std::string::npos);

    TempDir ambiguous("acecode-macos-stage-ambiguous");
    create_bundle(ambiguous.path() / "one" / "ACECode.app");
    create_bundle(ambiguous.path() / "two" / "ACECode.app");
    EXPECT_FALSE(acecode::upgrade::find_staged_macos_app_bundle(
        ambiguous.path(), &error));

    TempDir symlinked("acecode-macos-stage-symlinked");
    TempDir source("acecode-macos-stage-source");
    create_bundle(source.path() / "ACECode.app");
    std::error_code ec;
    fs::create_directory_symlink(source.path() / "ACECode.app",
                                 symlinked.path() / "ACECode.app", ec);
    if (!ec) {
        EXPECT_FALSE(acecode::upgrade::find_staged_macos_app_bundle(
            symlinked.path(), &error));
    }
}

TEST(MacosBundleInstallPath, AcceptsRealArbitraryLocation) {
    TempDir temp("acecode-macos-custom-location");
    const fs::path installed = fs::canonical(temp.path()) /
        "My Tools" / "ACECode.app";
    create_bundle(installed);
    std::string error;
    EXPECT_TRUE(acecode::upgrade::macos_app_install_path_is_safe(installed, &error))
        << error;
}

TEST(MacosBundleInstallPath, RejectsUnsafeLocations) {
    TempDir temp("acecode-macos-unsafe-location");
    const fs::path root = fs::canonical(temp.path());
    for (const auto& relative : {"Other.app", "Outer.app/ACECode.app",
                                 "Outer.APP/Tools/ACECode.app",
                                 "AppTranslocation/id/d/ACECode.app"}) {
        const fs::path installed = root / relative;
        create_bundle(installed);
        EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(installed))
            << installed;
    }
    const fs::path installed = root / "real" / "ACECode.app";
    create_bundle(installed);
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe({}));
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe("ACECode.app"));
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(root / "ACECode.app"));
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(
        root / "real" / "." / "ACECode.app"));

    std::error_code ec;
    fs::create_directory_symlink(installed, root / "ACECode.app", ec);
    if (ec) GTEST_SKIP() << "directory symlinks unavailable: " << ec.message();
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(root / "ACECode.app"));
    fs::create_directory_symlink(root / "real", root / "alias", ec);
    ASSERT_FALSE(ec) << ec.message();
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(
        root / "alias" / "ACECode.app"));
    fs::create_directories(root / "real" / "nested");
    create_bundle(root / "real" / "nested" / "ACECode.app");
    EXPECT_FALSE(acecode::upgrade::macos_app_install_path_is_safe(
        root / "alias" / "nested" / "ACECode.app"));
}

#ifdef __APPLE__
TEST(MacosBundleInstaller, UnwritableParentFailsWithoutMutation) {
    if (::geteuid() == 0) GTEST_SKIP() << "root bypasses directory permissions";
    TempDir temp("acecode-macos-read-only-parent");
    const fs::path parent = fs::canonical(temp.path()) / "Read Only";
    const fs::path installed = parent / "ACECode.app";
    create_bundle(installed);
    fs::permissions(parent, fs::perms::owner_read | fs::perms::owner_exec);
    std::string error;
    const bool accepted = acecode::upgrade::preflight_macos_app_update(
        installed, installed, "9.9.9", &error);
    fs::permissions(parent, fs::perms::owner_all);
    EXPECT_FALSE(accepted);
    EXPECT_NE(error.find("cannot modify"), std::string::npos) << error;
    EXPECT_TRUE(fs::is_directory(installed));
}

TEST(MacosBundleInstaller, ArbitraryInstallPathStillRequiresSignatureWithoutMutation) {
    TempDir temp("acecode-macos-install-preflight");
    const fs::path installed = fs::canonical(temp.path()) / "ACECode.app";
    const fs::path candidate = temp.path() / "candidate" / "ACECode.app";
    create_bundle(installed);
    create_bundle(candidate);
    write_file(installed / "sentinel.txt");

    std::string error;
    EXPECT_FALSE(acecode::upgrade::preflight_macos_app_update(
        installed, candidate, "9.9.9", &error));
    EXPECT_NE(error.find("signature"), std::string::npos) << error;
    EXPECT_TRUE(fs::is_regular_file(installed / "sentinel.txt"));
    EXPECT_TRUE(fs::is_directory(candidate));
}
#endif
