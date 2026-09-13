#include <gtest/gtest.h>

#include "upgrade/apply.hpp"
#include "upgrade/executable_version.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace fs = std::filesystem;
using namespace acecode::upgrade;

namespace {
class VersionFixture {
public:
    VersionFixture() {
        root = fs::temp_directory_path() / fs::u8path(
            "acecode version \u9a8c\u8bc1 " + std::to_string(
                std::chrono::steady_clock::now().time_since_epoch().count()));
        fs::create_directories(root / "staging");
        fs::create_directories(root / "install");
#ifdef _WIN32
        name = "acecode.exe";
        target = "windows-x64";
#else
        name = "acecode";
        target = "linux-x64";
#endif
        executable = root / "staging" / name;
        fs::copy_file(fs::u8path(ACECODE_UPGRADE_VERSION_FIXTURE), executable);
        fs::permissions(executable, fs::perms::owner_exec, fs::perm_options::add);
    }
    ~VersionFixture() { std::error_code ec; fs::remove_all(root, ec); }
    void mode(const std::string& value) {
        std::ofstream(root / "staging" / ".version-probe-mode") << value;
    }
    fs::path root, executable, name;
    std::string target;
};
std::string read_text(const fs::path& path) {
    std::ifstream input(path);
    std::ostringstream output;
    output << input.rdbuf();
    return output.str();
}
}

TEST(UpgradeExecutableVersion, ParsesOnlyAcecodeVersionOutput) {
    EXPECT_EQ(parse_executable_version_output("acecode v0.9.14\r\n"), "0.9.14");
    EXPECT_EQ(parse_executable_version_output("acecode v0.9.14-pre.1\n"), "0.9.14-pre.1");
    EXPECT_FALSE(parse_executable_version_output("other v0.9.14\n"));
    EXPECT_FALSE(parse_executable_version_output("acecode v0.9.14\nextra"));
    EXPECT_FALSE(parse_executable_version_output("acecode vgarbage"));
}

TEST(UpgradeExecutableVersion, ChecksVersionWithoutShellWithUnicodeAndSpaces) {
    VersionFixture fixture;
    std::string error;
    EXPECT_TRUE(verify_executable_version(fixture.executable, "9.9.9", &error)) << error;
    fixture.mode("old");
    EXPECT_FALSE(verify_executable_version(fixture.executable, "9.9.9", &error));
    EXPECT_NE(error.find("expected 9.9.9, got 0.1.0"), std::string::npos);
}

TEST(UpgradeExecutableVersion, RejectsFailureMalformedOutputAndOversizedOutput) {
    VersionFixture fixture;
    for (const auto* mode : {"exit", "invalid", "flood"}) {
        fixture.mode(mode);
        std::string error;
        EXPECT_FALSE(verify_executable_version(fixture.executable, "9.9.9", &error)) << mode;
        EXPECT_FALSE(error.empty());
    }
}

TEST(UpgradeExecutableVersion, TimesOutAndTerminatesOnlyItsProbe) {
    VersionFixture fixture;
    fixture.mode("timeout");
    std::string error;
    const auto start = std::chrono::steady_clock::now();
    EXPECT_FALSE(verify_executable_version(fixture.executable, "9.9.9", &error,
                                         std::chrono::milliseconds(100)));
    EXPECT_NE(error.find("timed out"), std::string::npos);
    EXPECT_LT(std::chrono::steady_clock::now() - start, std::chrono::seconds(3));
    fixture.mode("");
    EXPECT_TRUE(verify_executable_version(fixture.executable, "9.9.9", &error)) << error;
}

TEST(UpgradeExecutableVersion, RejectsOldStagingWithoutChangingInstallation) {
    VersionFixture fixture;
    fixture.mode("old");
    std::ofstream(fixture.root / "install" / fixture.name) << "previous executable";
    std::string error;
    EXPECT_FALSE(apply_staged_update(fixture.root / "staging", fixture.root / "install",
        fixture.root / "backup", fixture.target, &error, nullptr, "9.9.9"));
    EXPECT_EQ(read_text(fixture.root / "install" / fixture.name), "previous executable");
    EXPECT_FALSE(fs::exists(fixture.root / "backup"));
}

TEST(UpgradeExecutableVersion, RollsBackWhenInstalledVersionVerificationFails) {
    VersionFixture fixture;
    fixture.mode("wrong-installed");
    std::ofstream(fixture.root / "install" / fixture.name) << "previous executable";
    std::string error;
    EXPECT_FALSE(apply_staged_update(fixture.root / "staging", fixture.root / "install",
        fixture.root / "backup", fixture.target, &error, nullptr, "9.9.9"));
    EXPECT_NE(error.find("version mismatch"), std::string::npos);
    EXPECT_EQ(read_text(fixture.root / "install" / fixture.name), "previous executable");
}

TEST(UpgradeExecutableVersion, CompletesOnlyWhenInstalledExecutableReportsTarget) {
    VersionFixture fixture;
    std::ofstream(fixture.root / "install" / fixture.name) << "previous executable";
    std::string error;
    EXPECT_TRUE(apply_staged_update(fixture.root / "staging", fixture.root / "install",
        fixture.root / "backup", fixture.target, &error, nullptr, "9.9.9")) << error;
    EXPECT_TRUE(verify_executable_version(fixture.root / "install" / fixture.name, "9.9.9", &error));
    EXPECT_EQ(read_text(fixture.root / "backup" / fixture.name), "previous executable");
}
