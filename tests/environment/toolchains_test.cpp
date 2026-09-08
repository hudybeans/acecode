// 覆盖 src/environment/toolchains.{hpp,cpp}:工具链目录探测、配置合并、PATH 前插。
//
// 探测走注入的 WhichFn(不依赖真实 PATH);PATH 前插的纯函数逐字节比对;
// apply_toolchain_path 用临时目录真实改进程 PATH,fixture 负责还原。

#include <gtest/gtest.h>

#include "environment/toolchains.hpp"

#include <chrono>
#include <filesystem>
#include <map>
#include <string>

namespace fs = std::filesystem;
using namespace acecode::environment;

namespace {

WhichFn mock_which(std::map<std::string, std::string> table) {
    return [table](const std::string& command) -> std::optional<std::string> {
        auto it = table.find(command);
        if (it == table.end()) return std::nullopt;
        return it->second;
    };
}

}  // namespace

// 场景:Windows 商店的 app-execution alias 桩程序。
// 期望:WindowsApps 下的路径判为桩(大小写、分隔符不敏感);正常安装路径不是。
TEST(ToolchainsDetectTest, WindowsAppsAliasIsRecognized) {
    EXPECT_TRUE(is_windows_app_execution_alias(
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"));
    EXPECT_TRUE(is_windows_app_execution_alias(
        "c:/users/me/appdata/local/microsoft/windowsapps/python3.exe"));
    EXPECT_FALSE(is_windows_app_execution_alias("C:\\Python312\\python.exe"));
    EXPECT_FALSE(is_windows_app_execution_alias("/usr/bin/python3"));
}

// 场景:node 在 PATH 上,python 只有商店桩,dotnet 没有。
// 期望:node 目录 = 可执行文件所在目录;python 因桩被排除而未检出;csharp 未检出;
// anchors 记录命中的完整路径。
TEST(ToolchainsDetectTest, DetectsDirectoriesAndSkipsStoreStub) {
    auto which = mock_which({
        {"node", "C:\\Program Files\\nodejs\\node.exe"},
        {"python", "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"},
    });
    auto d = detect_toolchains(which);
    EXPECT_EQ(d.dir_for("node"), fs::path("C:\\Program Files\\nodejs\\node.exe").parent_path().string());
    EXPECT_TRUE(d.dir_for("python").empty());
    EXPECT_TRUE(d.dir_for("csharp").empty());
    EXPECT_EQ(d.anchors.at("node"), "C:\\Program Files\\nodejs\\node.exe");
    EXPECT_EQ(d.anchors.count("python"), 0u);
}

// 场景:python 没有但 python3 有(Linux/macOS 常态)。
// 期望:第二个锚点命中,目录取自 python3。
TEST(ToolchainsDetectTest, FallsBackToSecondAnchor) {
    auto d = detect_toolchains(mock_which({{"python3", "/usr/bin/python3"}}));
    EXPECT_EQ(d.dir_for("python"), fs::path("/usr/bin/python3").parent_path().string());
    EXPECT_EQ(d.anchors.at("python"), "/usr/bin/python3");
}

// 场景:首次启动填充(fill_unset)与「重新检测」合并(merge)的语义差别。
// 期望:fill 只填空项、不动已设置项;merge 用新探测覆盖已设置项,但探测不到的
// 保留原值(用户手填的目录不会被清掉)。
TEST(ToolchainsConfigMergeTest, FillOnlyUnsetVersusMergeOverwrites) {
    ToolchainDetection d;
    d.dirs["node"] = "D:\\node-new";
    d.dirs["python"] = "D:\\py-new";

    acecode::ToolchainsConfig fill_cfg;
    fill_cfg.node = "D:\\node-manual";
    EXPECT_TRUE(fill_unset_toolchains(fill_cfg, d));
    EXPECT_EQ(fill_cfg.node, "D:\\node-manual") << "已设置项不被首次启动探测覆盖";
    EXPECT_EQ(fill_cfg.python, "D:\\py-new");
    EXPECT_TRUE(fill_cfg.csharp.empty());
    EXPECT_FALSE(fill_unset_toolchains(fill_cfg, d)) << "第二次没有变化";

    acecode::ToolchainsConfig merge_cfg;
    merge_cfg.node = "D:\\node-manual";
    merge_cfg.csharp = "D:\\dotnet-manual";
    EXPECT_TRUE(merge_detected_toolchains(merge_cfg, d));
    EXPECT_EQ(merge_cfg.node, "D:\\node-new") << "重新检测用新结果覆盖";
    EXPECT_EQ(merge_cfg.csharp, "D:\\dotnet-manual") << "探测不到的保留手填值";
}

// 场景:configured_toolchain_dirs 的顺序与过滤。
// 期望:固定 Python → Node.js → C# 顺序,空项不出现。
TEST(ToolchainsConfigMergeTest, ConfiguredDirsKeepFixedOrder) {
    acecode::ToolchainsConfig cfg;
    cfg.csharp = "D:\\dotnet";
    cfg.python = "D:\\py";
    auto dirs = configured_toolchain_dirs(cfg);
    ASSERT_EQ(dirs.size(), 2u);
    EXPECT_EQ(dirs[0].first, "Python");
    EXPECT_EQ(dirs[0].second, "D:\\py");
    EXPECT_EQ(dirs[1].first, "C#");
    EXPECT_EQ(dirs[1].second, "D:\\dotnet");
}

// 场景:PATH 前插纯函数。
// 期望:新目录按给定顺序放最前;上次注入的项被摘掉;PATH 里已有的同名项也被摘掉
// (不重复);新目录列表内部去重;空列表 = 只摘不插。
TEST(ToolchainsPathTest, ComputePrefixRemovesOldAndDedupes) {
    const std::string current = "/old/inject:/usr/bin:/opt/node/bin:/bin";
    std::string out = compute_path_with_prefix(current, {"/old/inject"},
                                               {"/opt/py/bin", "/opt/node/bin", "/opt/py/bin"},
                                               ':');
    EXPECT_EQ(out, "/opt/py/bin:/opt/node/bin:/usr/bin:/bin");

    std::string cleared = compute_path_with_prefix(out, {"/opt/py/bin", "/opt/node/bin"}, {}, ':');
    EXPECT_EQ(cleared, "/usr/bin:/bin");
}

// 场景:Windows 的比较规则 —— 大小写与尾部反斜杠不同的同一目录。
// 期望:视为同一项被摘掉,不会在 PATH 里留两份。
TEST(ToolchainsPathTest, WindowsComparisonIgnoresCaseAndTrailingSlash) {
#ifdef _WIN32
    std::string out = compute_path_with_prefix(
        "C:\\Tools\\Node\\;C:\\Windows", {}, {"c:\\tools\\node"}, ';');
    EXPECT_EQ(out, "c:\\tools\\node;C:\\Windows");
#else
    GTEST_SKIP() << "Windows-only comparison rule";
#endif
}

namespace {
class ToolchainsApplyTest : public ::testing::Test {
protected:
    std::string saved_path;
    fs::path root;
    void SetUp() override {
        saved_path = current_process_path();
        reset_toolchain_runtime_for_test();
        auto now = std::chrono::steady_clock::now().time_since_epoch().count();
        root = fs::temp_directory_path() / ("acecode-toolchains-" + std::to_string(now));
        fs::create_directories(root / "a");
        fs::create_directories(root / "b");
    }
    void TearDown() override {
        set_process_path(saved_path);
        reset_toolchain_runtime_for_test();
        std::error_code ec;
        fs::remove_all(root, ec);
    }
    static std::string first_entry(const std::string& path) {
        auto pos = path.find(path_list_separator());
        return pos == std::string::npos ? path : path.substr(0, pos);
    }
};
}  // namespace

// 场景:真实注入进程 PATH,然后改目录再注入,最后清空。
// 期望:PATH 首项跟随最新目录;旧目录被摘掉;不存在的目录进 skipped 且不入 PATH;
// applied_toolchain_dirs 快照与实际一致。
TEST_F(ToolchainsApplyTest, ApplyReplacesPreviousInjection) {
    acecode::ToolchainsConfig cfg;
    cfg.node = (root / "a").string();
    cfg.python = (root / "missing").string();
    auto r1 = apply_toolchain_path(cfg);
    ASSERT_EQ(r1.applied.size(), 1u);
    EXPECT_EQ(r1.applied[0].first, "Node.js");
    ASSERT_EQ(r1.skipped.size(), 1u);
    EXPECT_EQ(r1.skipped[0].first, "Python");
    EXPECT_EQ(first_entry(current_process_path()), (root / "a").string());
    EXPECT_EQ(current_process_path().find((root / "missing").string()), std::string::npos);
    EXPECT_EQ(applied_toolchain_dirs().size(), 1u);

    cfg.node = (root / "b").string();
    cfg.python.clear();
    apply_toolchain_path(cfg);
    EXPECT_EQ(first_entry(current_process_path()), (root / "b").string());
    EXPECT_EQ(current_process_path().find((root / "a").string()), std::string::npos)
        << "旧注入项必须被摘掉,否则设置页改目录后旧目录仍生效";

    acecode::ToolchainsConfig empty;
    apply_toolchain_path(empty);
    EXPECT_EQ(current_process_path().find((root / "b").string()), std::string::npos);
    EXPECT_TRUE(applied_toolchain_dirs().empty());
    EXPECT_EQ(current_process_path(), saved_path)
        << "清空后 PATH 回到注入前的原样";
}

TEST_F(ToolchainsApplyTest, ClearingConfiguredDirectoryRestoresOriginalPathEntry) {
    const auto original = (root / "b").string() + path_list_separator() + (root / "a").string();
    set_process_path(original);
    acecode::ToolchainsConfig cfg;
    cfg.node = (root / "a").string();
    apply_toolchain_path(cfg);
    EXPECT_EQ(first_entry(current_process_path()), cfg.node);
    apply_toolchain_path({});
    EXPECT_EQ(current_process_path(), original);
}
