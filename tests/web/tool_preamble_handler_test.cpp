// 覆盖 src/web/handlers/tool_preamble_handler.cpp 的纯函数(openspec add-tool-preamble):
//   1. tool_preamble_snapshot:GET 响应体的字段与候选列表
//   2. parse_tool_preamble_request:PUT 的 patch 语义、逐字段类型 / 取值校验、
//      失败时 out 不变;已废弃的 sidecar 相关键被当作未知键忽略

#include <gtest/gtest.h>

#include "web/handlers/tool_preamble_handler.hpp"

#include <string>
#include <vector>

using acecode::ToolPreambleConfig;
using acecode::web::parse_tool_preamble_request;
using acecode::web::tool_preamble_snapshot;

namespace {

ToolPreambleConfig current_cfg() {
    ToolPreambleConfig cfg;
    cfg.enabled = true;
    cfg.mode = "reasoning";
    return cfg;
}

} // namespace

// 场景:GET 快照。期望:两个配置字段原样,modes 固定两项且顺序为
// prompt / reasoning(设置页按此顺序渲染,默认选第一项),没有旁路模型字段。
TEST(ToolPreambleHandler, SnapshotExposesConfigAndChoices) {
    const auto snap = tool_preamble_snapshot(current_cfg());
    EXPECT_TRUE(snap.at("enabled").get<bool>());
    EXPECT_EQ(snap.at("mode").get<std::string>(), "reasoning");
    ASSERT_EQ(snap.at("modes").size(), 2u);
    EXPECT_EQ(snap["modes"][0].get<std::string>(), "prompt");
    EXPECT_EQ(snap["modes"][1].get<std::string>(), "reasoning");
    EXPECT_FALSE(snap.contains("sidecar_model"));
    EXPECT_FALSE(snap.contains("saved_models"));
}

// 场景:PUT 只带 {enabled:false}。期望:patch 语义 —— mode 沿用当前值。
TEST(ToolPreambleHandler, PatchKeepsUnmentionedFields) {
    ToolPreambleConfig out;
    std::string error;
    ASSERT_TRUE(parse_tool_preamble_request({{"enabled", false}}, current_cfg(), out, error))
        << error;
    EXPECT_FALSE(out.enabled);
    EXPECT_EQ(out.mode, "reasoning");
}

// 场景:PUT {mode:"prompt"};旧前端可能还带 sidecar_model / sidecar_wait_ms。
// 期望:mode 生效,多余的旧键不报错也不影响结果。
TEST(ToolPreambleHandler, AcceptsModeAndIgnoresLegacySidecarKeys) {
    ToolPreambleConfig out;
    std::string error;
    ASSERT_TRUE(parse_tool_preamble_request(
        {{"mode", "prompt"}, {"sidecar_model", "fast"}, {"sidecar_wait_ms", 500}},
        current_cfg(), out, error)) << error;
    EXPECT_EQ(out.mode, "prompt");
    EXPECT_TRUE(out.enabled);
}

// 场景:非法请求 —— body 不是对象 / mode 不在二选一里(含已废弃的 sidecar)/
// mode 非字符串 / enabled 非布尔。期望:全部返回 false 且 out 保持调用前的值
// (这里预置成 current 以便比对),error 非空。
TEST(ToolPreambleHandler, RejectsInvalidRequestsWithoutTouchingOutput) {
    const auto cases = std::vector<nlohmann::json>{
        nlohmann::json::array(),
        {{"mode", "auto"}},
        {{"mode", "sidecar"}},
        {{"mode", 3}},
        {{"enabled", "yes"}},
    };
    for (const auto& body : cases) {
        ToolPreambleConfig out = current_cfg();
        std::string error;
        EXPECT_FALSE(parse_tool_preamble_request(body, current_cfg(), out, error))
            << body.dump();
        EXPECT_FALSE(error.empty()) << body.dump();
        EXPECT_EQ(out, current_cfg()) << body.dump();
    }
}
