#include <gtest/gtest.h>
#include "config/config.hpp"
#include "../sandbox/test_support.hpp"
#include <nlohmann/json.hpp>

using namespace acecode;

// 场景:sandbox 段字段类型全错(字符串 / 数字 / null / 相对路径与空串)。
// 期望:逐字段静默回落默认值(enabled=true、不放行网络、无额外根),不阻塞启动。
TEST(ConfigSandbox, DefaultsAndInvalidFieldTypesRemainConservative) {
    sandbox::test::TempTree tree;
    auto path = tree.root / "config.json";
    tree.write(path, R"({"sandbox":{"enabled":"no","network_access":1,"exclude_tmpdir":null,
        "writable_roots":["relative",12,""]}})");
    auto config = load_config_from_path(path_to_utf8(path));
    EXPECT_TRUE(config.sandbox.enabled);
    EXPECT_FALSE(config.sandbox.network_access);
    EXPECT_FALSE(config.sandbox.exclude_tmpdir);
    EXPECT_TRUE(config.sandbox.writable_roots.empty());
}

// 场景:旧配置 `acceptEdits` + 非默认 sandbox 段。期望:模式归一成 auto;
// sandbox 四个字段 load → save → load 逐字段一致。
TEST(ConfigSandbox, RoundTripsSandboxAndNormalizesLegacyMode) {
    sandbox::test::TempTree tree;
    auto path = tree.root / "config.json";
    auto extra = path_to_utf8(tree.dir("extra"));
    tree.write(path, nlohmann::json{{"default_permission_mode", "acceptEdits"},
        {"sandbox", {{"enabled", false}, {"network_access", true},
                     {"exclude_tmpdir", true}, {"writable_roots", {extra}}}}}.dump());
    auto config = load_config_from_path(path_to_utf8(path));
    EXPECT_EQ(config.default_permission_mode, "auto");
    EXPECT_FALSE(config.sandbox.enabled);
    EXPECT_TRUE(config.sandbox.network_access);
    EXPECT_TRUE(config.sandbox.exclude_tmpdir);
    EXPECT_EQ(config.sandbox.writable_roots, std::vector<std::string>{extra});
    save_config(config, path_to_utf8(path));
    auto restored = load_config_from_path(path_to_utf8(path));
    EXPECT_EQ(restored.default_permission_mode, "auto");
    EXPECT_EQ(restored.sandbox.writable_roots, config.sandbox.writable_roots);
    EXPECT_EQ(restored.sandbox.enabled, config.sandbox.enabled);
    EXPECT_EQ(restored.sandbox.network_access, config.sandbox.network_access);
    EXPECT_EQ(restored.sandbox.exclude_tmpdir, config.sandbox.exclude_tmpdir);
}
