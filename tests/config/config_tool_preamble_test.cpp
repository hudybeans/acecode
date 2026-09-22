// 覆盖 config.agent_loop.tool_preamble(openspec add-tool-preamble)的解析与
// 稀疏序列化:
//   1. 默认关闭、mode=prompt、sidecar_wait_ms=2000
//   2. 合法值往返;非法 mode 归一化为 prompt;sidecar_wait_ms 越界 clamp
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

// 场景:结构体默认值与缺省配置。期望:关闭、prompt、无旁路模型、等待 2000ms。
TEST_F(ConfigToolPreamble, DefaultsAreDisabledPromptMode) {
    const acecode::ToolPreambleConfig defaults;
    EXPECT_FALSE(defaults.enabled);
    EXPECT_EQ(defaults.mode, "prompt");
    EXPECT_TRUE(defaults.sidecar_model.empty());
    EXPECT_EQ(defaults.sidecar_wait_ms, 2000);

    const auto cfg = load(nlohmann::json::object());
    EXPECT_EQ(cfg.agent_loop.tool_preamble, defaults);
}

// 场景:合法配置 {enabled:true, mode:"sidecar", sidecar_model:"fast",
// sidecar_wait_ms:500} 加载后 save 再 load。期望:四个字段逐一保留,且不影响
// 同段落里的 max_iterations。
TEST_F(ConfigToolPreamble, LoadsAndRoundTripsValidValues) {
    auto cfg = load({{"agent_loop", {
        {"max_iterations", 7},
        {"tool_preamble", {
            {"enabled", true},
            {"mode", "sidecar"},
            {"sidecar_model", "fast"},
            {"sidecar_wait_ms", 500},
        }},
    }}});
    EXPECT_TRUE(cfg.agent_loop.tool_preamble.enabled);
    EXPECT_EQ(cfg.agent_loop.tool_preamble.mode, "sidecar");
    EXPECT_EQ(cfg.agent_loop.tool_preamble.sidecar_model, "fast");
    EXPECT_EQ(cfg.agent_loop.tool_preamble.sidecar_wait_ms, 500);
    EXPECT_EQ(cfg.agent_loop.max_iterations, 7);

    acecode::save_config(cfg, path.string());
    const auto restored = acecode::load_config_from_path(path.string(), false);
    EXPECT_EQ(restored.agent_loop.tool_preamble, cfg.agent_loop.tool_preamble);
    EXPECT_EQ(restored.agent_loop.max_iterations, 7);
}

// 场景:mode 写了不认识的 "auto",sidecar_wait_ms 分别写 -5 与 99999,
// enabled 写成字符串 "true"。期望:mode 归一化为 prompt;等待时间 clamp 到
// 0 / 15000;类型不对的 enabled 保持默认 false,不报错。
TEST_F(ConfigToolPreamble, InvalidValuesAreNormalized) {
    const auto low = load({{"agent_loop", {{"tool_preamble", {
        {"enabled", "true"}, {"mode", "auto"}, {"sidecar_wait_ms", -5}}}}}});
    EXPECT_FALSE(low.agent_loop.tool_preamble.enabled);
    EXPECT_EQ(low.agent_loop.tool_preamble.mode, "prompt");
    EXPECT_EQ(low.agent_loop.tool_preamble.sidecar_wait_ms, 0);

    const auto high = load({{"agent_loop", {{"tool_preamble", {
        {"sidecar_wait_ms", 99999}}}}}});
    EXPECT_EQ(high.agent_loop.tool_preamble.sidecar_wait_ms, 15000);
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
    EXPECT_FALSE(tp.contains("sidecar_model"));
    EXPECT_FALSE(tp.contains("sidecar_wait_ms"));
}

} // namespace
