#include <gtest/gtest.h>
#include "environment/bootstrap.hpp"
#include "environment/terminal_runtime.hpp"
#include "utils/state_file.hpp"
#include "utils/paths.hpp"
#include "utils/utf8_path.hpp"
#include "utils/uuid.hpp"
#include <filesystem>
#include <fstream>
#include <cstdlib>

namespace fs = std::filesystem;
using namespace acecode;
using namespace acecode::environment;
namespace {
class EnvironmentBootstrapTest : public testing::Test {
protected:
    fs::path root;
    std::string previous_home, previous_path;
#ifdef _WIN32
    const char* home_key = "USERPROFILE";
#else
    const char* home_key = "HOME";
#endif
    void set_home(const std::string& value) {
#ifdef _WIN32
        _putenv_s(home_key, value.c_str());
#else
        setenv(home_key, value.c_str(), 1);
#endif
    }
    void SetUp() override {
        previous_home = getenv_utf8(home_key);
        previous_path = current_process_path();
        root = fs::temp_directory_path() / ("ace-bootstrap-" + generate_uuid());
        fs::create_directories(root / ".acecode");
        set_home(path_to_utf8(root));
        reset_data_dir_cache_for_test();
        reset_toolchain_runtime_for_test();
        terminal().reset_for_test();
        set_state_file_path_for_test(path_to_utf8(root / ".acecode/state.json"));
    }
    void TearDown() override {
        set_home(previous_home);
        set_process_path(previous_path);
        reset_toolchain_runtime_for_test();
        terminal().reset_for_test();
        reset_data_dir_cache_for_test();
        set_state_file_path_for_test("");
        std::error_code ec;
        fs::remove_all(root, ec);
    }
};
}

TEST_F(EnvironmentBootstrapTest, HeadlessAppliesConfiguredPathWithoutPersistingDetection) {
    AppConfig cfg;
    fs::create_directories(root / "node");
    cfg.toolchains.node = path_to_utf8(root / "node");
    const auto report = bootstrap(cfg, {false, false});
    EXPECT_FALSE(report.toolchains_detected);
    EXPECT_FALSE(report.terminal_detected);
    EXPECT_EQ(current_process_path().find(cfg.toolchains.node), 0u);
    EXPECT_FALSE(fs::exists(root / ".acecode/config.json"));
    EXPECT_FALSE(fs::exists(root / ".acecode/state.json"));
}

TEST_F(EnvironmentBootstrapTest, FirstLaunchPersistsTerminalAndDoesNotOverrideLaterSelection) {
    AppConfig cfg;
    const auto first = bootstrap(cfg, {});
    ASSERT_TRUE(first.terminal) << "No usable platform shell";
    EXPECT_TRUE(first.terminal_detected);
    EXPECT_TRUE(read_state_flag(kTerminalAutodetectedFlag));
    EXPECT_TRUE(read_state_flag(kToolchainsAutodetectedFlag));
    const auto disk = load_config_from_path(path_to_utf8(root / ".acecode/config.json"), false);
    EXPECT_EQ(disk.console.default_shell, cfg.console.default_shell);
    const auto selected = cfg.console.default_shell;
    const auto second = bootstrap(cfg, {});
    EXPECT_FALSE(second.terminal_detected);
    EXPECT_FALSE(second.toolchains_detected);
    EXPECT_EQ(cfg.console.default_shell, selected);
}
