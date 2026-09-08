// 覆盖 openspec/changes/redesign-settings-config-section 引入的两段配置:
//   - toolchains {python, node, csharp}:工具链目录,sparse 落盘
//   - console.shell_paths:各终端类型的显式程序路径;legacy console.git_bash_path
//     在加载时并入 "git-bash" 项且不再单独写出
//
// 走真实的 save_config(cfg, path) → load_config_from_path(path) 往返,写到每个用例
// 自己的临时目录,不碰 ~/.acecode。

#include <gtest/gtest.h>

#include "config/config.hpp"

#include <nlohmann/json.hpp>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <string>

namespace fs = std::filesystem;
using namespace acecode;

namespace {

fs::path make_temp_dir(const char* tag) {
    auto now = std::chrono::steady_clock::now().time_since_epoch().count();
    fs::path dir = fs::temp_directory_path() /
        (std::string("acecode-config-env-") + tag + "-" + std::to_string(now));
    std::error_code ec;
    fs::remove_all(dir, ec);
    fs::create_directories(dir, ec);
    return dir;
}

void write_text(const fs::path& path, const std::string& text) {
    std::ofstream ofs(path, std::ios::binary | std::ios::trunc);
    ofs << text;
}

nlohmann::json read_json(const fs::path& path) {
    std::ifstream ifs(path, std::ios::binary);
    return nlohmann::json::parse(ifs);
}

class ConfigEnvironmentTest : public ::testing::Test {
protected:
    fs::path dir;
    fs::path config_path;

    void SetUp() override {
        dir = make_temp_dir("case");
        config_path = dir / "config.json";
    }
    void TearDown() override {
        std::error_code ec;
        fs::remove_all(dir, ec);
    }
};

}  // namespace

// 场景:AppConfig 默认值 —— 三个工具链目录全空,终端类型未选、无显式路径。
// 期望:全部为空,shell_path_for 对未知 id 返回空串而不是抛异常。
TEST_F(ConfigEnvironmentTest, DefaultsAreEmpty) {
    AppConfig cfg;
    EXPECT_TRUE(cfg.toolchains.python.empty());
    EXPECT_TRUE(cfg.toolchains.node.empty());
    EXPECT_TRUE(cfg.toolchains.csharp.empty());
    EXPECT_TRUE(cfg.console.default_shell.empty());
    EXPECT_TRUE(cfg.console.shell_paths.empty());
    EXPECT_EQ(cfg.console.shell_path_for("powershell"), "");
}

// 场景:config.json 只写了 toolchains.node。
// 期望:加载后只有 node 有值;save 回写后 JSON 里 toolchains 只含 node 一个键
//(schema sparse:空字段不落盘)。
TEST_F(ConfigEnvironmentTest, ToolchainsRoundTripIsSparse) {
    write_text(config_path, R"({"toolchains":{"node":"C:\\tools\\node"}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_EQ(cfg.toolchains.node, "C:\\tools\\node");
    EXPECT_TRUE(cfg.toolchains.python.empty());
    EXPECT_TRUE(cfg.toolchains.csharp.empty());

    save_config(cfg, config_path.string());
    auto j = read_json(config_path);
    ASSERT_TRUE(j.contains("toolchains"));
    ASSERT_TRUE(j["toolchains"].is_object());
    EXPECT_EQ(j["toolchains"].size(), 1u);
    EXPECT_EQ(j["toolchains"]["node"], "C:\\tools\\node");
}

// 场景:toolchains.python 写成了数字(类型错误)。
// 期望:该字段按未设置处理,其余字段照常读入,加载不失败。
TEST_F(ConfigEnvironmentTest, ToolchainInvalidTypeIsIgnored) {
    write_text(config_path, R"({"toolchains":{"python":42,"csharp":"D:\\dotnet"}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_TRUE(cfg.toolchains.python.empty());
    EXPECT_EQ(cfg.toolchains.csharp, "D:\\dotnet");
}

// 场景:toolchains 整段不是对象。
// 期望:整段忽略,不影响其它配置加载。
TEST_F(ConfigEnvironmentTest, ToolchainsNonObjectIsIgnored) {
    write_text(config_path, R"({"toolchains":"nope","console":{"default_shell":"cmd"}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_TRUE(cfg.toolchains.node.empty());
    EXPECT_EQ(cfg.console.default_shell, "cmd");
}

// 场景:三个目录都配置了,保存后重新加载。
// 期望:三者逐字节保持。
TEST_F(ConfigEnvironmentTest, ToolchainsAllThreePersist) {
    AppConfig cfg;
    cfg.toolchains.python = "D:\\py";
    cfg.toolchains.node = "D:\\node";
    cfg.toolchains.csharp = "D:\\dotnet";
    save_config(cfg, config_path.string());
    AppConfig back = load_config_from_path(config_path.string());
    EXPECT_EQ(back.toolchains.python, "D:\\py");
    EXPECT_EQ(back.toolchains.node, "D:\\node");
    EXPECT_EQ(back.toolchains.csharp, "D:\\dotnet");
}

// 场景:新格式 console.shell_paths 写了 powershell 与 git-bash 两项。
// 期望:加载后 shell_path_for 能取到;保存回写仍是 shell_paths 对象,且**不会**
// 再写出 legacy 的 git_bash_path 键。
TEST_F(ConfigEnvironmentTest, ShellPathsRoundTrip) {
    write_text(config_path,
        R"({"console":{"default_shell":"powershell",
                       "shell_paths":{"powershell":"C:\\mytool\\pwsh.exe",
                                      "git-bash":"D:\\Git\\bin\\bash.exe"}}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_EQ(cfg.console.default_shell, "powershell");
    EXPECT_EQ(cfg.console.shell_path_for("powershell"), "C:\\mytool\\pwsh.exe");
    EXPECT_EQ(cfg.console.shell_path_for("git-bash"), "D:\\Git\\bin\\bash.exe");

    save_config(cfg, config_path.string());
    auto j = read_json(config_path);
    ASSERT_TRUE(j.contains("console"));
    EXPECT_FALSE(j["console"].contains("git_bash_path"));
    ASSERT_TRUE(j["console"].contains("shell_paths"));
    EXPECT_EQ(j["console"]["shell_paths"]["powershell"], "C:\\mytool\\pwsh.exe");
    EXPECT_EQ(j["console"]["shell_paths"]["git-bash"], "D:\\Git\\bin\\bash.exe");
}

// 场景:老版本 config.json 只有 console.git_bash_path,没有 shell_paths。
// 期望:加载后并入 shell_paths["git-bash"];保存后迁移成 shell_paths 形态。
// 回归背景:控制台停靠区曾用这个 legacy 字段记住用户手填的 bash.exe,升级后不能丢。
TEST_F(ConfigEnvironmentTest, LegacyGitBashPathMigratesIntoShellPaths) {
    write_text(config_path, R"({"console":{"git_bash_path":"E:\\Git\\bin\\bash.exe"}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_EQ(cfg.console.shell_path_for("git-bash"), "E:\\Git\\bin\\bash.exe");

    save_config(cfg, config_path.string());
    auto j = read_json(config_path);
    EXPECT_FALSE(j["console"].contains("git_bash_path"));
    EXPECT_EQ(j["console"]["shell_paths"]["git-bash"], "E:\\Git\\bin\\bash.exe");
}

// 场景:legacy git_bash_path 与新的 shell_paths["git-bash"] 同时存在且不一致。
// 期望:以新字段为准,legacy 值不覆盖。
TEST_F(ConfigEnvironmentTest, ExplicitShellPathWinsOverLegacyGitBashPath) {
    write_text(config_path,
        R"({"console":{"git_bash_path":"E:\\old\\bash.exe",
                       "shell_paths":{"git-bash":"F:\\new\\bash.exe"}}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_EQ(cfg.console.shell_path_for("git-bash"), "F:\\new\\bash.exe");
}

// 场景:shell_paths 里混入非字符串值与空串。
// 期望:非字符串项忽略、空串项不入表,其余正常读入。
TEST_F(ConfigEnvironmentTest, ShellPathsSkipsInvalidEntries) {
    write_text(config_path,
        R"({"console":{"shell_paths":{"powershell":7,"cmd":"","zsh":"/bin/zsh"}}})");
    AppConfig cfg = load_config_from_path(config_path.string());
    EXPECT_EQ(cfg.console.shell_paths.size(), 1u);
    EXPECT_EQ(cfg.console.shell_path_for("zsh"), "/bin/zsh");
}

// 场景:console 段所有字段为空。
// 期望:保存时根本不写 console 键(sparse 不变量,避免 config.json 长出空对象)。
TEST_F(ConfigEnvironmentTest, EmptyConsoleAndToolchainsAreOmittedOnSave) {
    AppConfig cfg;
    save_config(cfg, config_path.string());
    auto j = read_json(config_path);
    EXPECT_FALSE(j.contains("console"));
    EXPECT_FALSE(j.contains("toolchains"));
}
