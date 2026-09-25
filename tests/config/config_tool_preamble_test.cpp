// 覆盖 config.agent_loop.tool_preamble(openspec add-tool-preamble)的解析与
// 稀疏序列化:
//   1. 默认关闭、mode=prompt
//   2. 合法值往返;非法 mode 归一化为 prompt;已废弃的 sidecar 配置静默降级
//   3. 全默认时 agent_loop 段里不写 tool_preamble 键(sparse-on-write)
// 与 config_desktop_multi_instance_test 同款:写临时 config.json 再
// load_config_from_path,不碰用户 ~/.acecode。

#include <gtest/gtest.h>

#include "config/config.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>

namespace {

class ConfigToolPreamble : public testing::Test {
protected:
    std::filesystem::path directory = std::filesystem::temp_directory_path() /
        ("acecode-tool-preamble-cfg-" + std::to_string(
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

// 场景:结构体默认值与缺省配置。期望:关闭、prompt。
TEST_F(ConfigToolPreamble, DefaultsAreDisabledPromptMode) {
    const acecode::ToolPreambleConfig defaults;
    EXPECT_FALSE(defaults.enabled);
    EXPECT_EQ(defaults.mode, "prompt");

    const auto cfg = load(nlohmann::json::object());
    EXPECT_EQ(cfg.agent_loop.tool_preamble, defaults);
}

// 场景:合法配置 {enabled:true, mode:"reasoning"} 加载后 save 再 load。
// 期望:两个字段保留,且不影响同段落里的 max_iterations。
TEST_F(ConfigToolPreamble, LoadsAndRoundTripsValidValues) {
    auto cfg = load({{"agent_loop", {
        {"max_iterations", 7},
        {"tool_preamble", {{"enabled", true}, {"mode", "reasoning"}}},
    }}});
    EXPECT_TRUE(cfg.agent_loop.tool_preamble.enabled);
    EXPECT_EQ(cfg.agent_loop.tool_preamble.mode, "reasoning");
    EXPECT_EQ(cfg.agent_loop.max_iterations, 7);

    acecode::save_config(cfg, path.string());
    const auto restored = acecode::load_config_from_path(path.string(), false);
    EXPECT_EQ(restored.agent_loop.tool_preamble, cfg.agent_loop.tool_preamble);
    EXPECT_EQ(restored.agent_loop.max_iterations, 7);
}

// 场景:mode 写了不认识的 "auto",enabled 写成字符串 "true"。期望:mode 归一化
// 为 prompt;类型不对的 enabled 保持默认 false,不报错。
TEST_F(ConfigToolPreamble, InvalidValuesAreNormalized) {
    const auto cfg = load({{"agent_loop", {{"tool_preamble", {
        {"enabled", "true"}, {"mode", "auto"}}}}}});
    EXPECT_FALSE(cfg.agent_loop.tool_preamble.enabled);
    EXPECT_EQ(cfg.agent_loop.tool_preamble.mode, "prompt");
}

// 场景:旧版本写下的 {mode:"sidecar", sidecar_model:"fast", sidecar_wait_ms:500}
// (旁路模型摘要已被砍掉)。期望:mode 归一化为 prompt,多余的键静默忽略,
// enabled 照常生效;再 save 时不会把旧键写回去。
TEST_F(ConfigToolPreamble, LegacySidecarConfigDegradesToPrompt) {
    auto cfg = load({{"agent_loop", {{"tool_preamble", {
        {"enabled", true}, {"mode", "sidecar"},
        {"sidecar_model", "fast"}, {"sidecar_wait_ms", 500}}}}}});
    EXPECT_TRUE(cfg.agent_loop.tool_preamble.enabled);
    EXPECT_EQ(cfg.agent_loop.tool_preamble.mode, "prompt");

    acecode::save_config(cfg, path.string());
    std::ifstream input(path);
    const auto saved = nlohmann::json::parse(input);
    const auto& tp = saved.at("agent_loop").at("tool_preamble");
    EXPECT_TRUE(tp.at("enabled").get<bool>());
    EXPECT_FALSE(tp.contains("mode"));
    EXPECT_FALSE(tp.contains("sidecar_model"));
    EXPECT_FALSE(tp.contains("sidecar_wait_ms"));
}

// 场景:全默认配置 save。期望:agent_loop 段不含 tool_preamble 键(sparse);
// 只改 enabled 后 save,只写出 enabled 一个键。
TEST_F(ConfigToolPreamble, SparseWriteOmitsDefaults) {
    auto cfg = load(nlohmann::json::object());
    acecode::save_config(cfg, path.string());
    {
        std::ifstream input(path);
        const auto saved = nlohmann::json::parse(input);
        EXPECT_FALSE(saved.contains("agent_loop") &&
                     saved["agent_loop"].contains("tool_preamble"));
    }

    cfg.agent_loop.tool_preamble.enabled = true;
    acecode::save_config(cfg, path.string());
    std::ifstream input(path);
    const auto saved = nlohmann::json::parse(input);
    ASSERT_TRUE(saved.at("agent_loop").contains("tool_preamble"));
    const auto& tp = saved["agent_loop"]["tool_preamble"];
    EXPECT_TRUE(tp.at("enabled").get<bool>());
    EXPECT_FALSE(tp.contains("mode"));
}

} // namespace
