// 覆盖 src/web/handlers/tool_preamble_handler.cpp 的纯函数(openspec add-tool-preamble):
//   1. tool_preamble_snapshot:GET 响应体的字段与候选列表
//   2. parse_tool_preamble_request:PUT 的 patch 语义、逐字段类型 / 取值校验、
//      失败时 out 不变

#include <gtest/gtest.h>

#include "web/handlers/tool_preamble_handler.hpp"

#include <string>
#include <vector>

using acecode::ToolPreambleConfig;
using acecode::web::parse_tool_preamble_request;
using acecode::web::tool_preamble_snapshot;

namespace {

const std::vector<std::string> kModels{"main", "fast"};

ToolPreambleConfig current_cfg() {
    ToolPreambleConfig cfg;
    cfg.enabled = true;
    cfg.mode = "reasoning";
    cfg.sidecar_model = "fast";
    cfg.sidecar_wait_ms = 800;
    return cfg;
}

} // namespace

// 场景:GET 快照。期望:四个配置字段原样,modes 固定三项且顺序为
// prompt / reasoning / sidecar(设置页按此顺序渲染,默认选第一项),
// saved_models 透传给旁路模型下拉。
TEST(ToolPreambleHandler, SnapshotExposesConfigAndChoices) {
    const auto snap = tool_preamble_snapshot(current_cfg(), kModels);
    EXPECT_TRUE(snap.at("enabled").get<bool>());
    EXPECT_EQ(snap.at("mode").get<std::string>(), "reasoning");
    EXPECT_EQ(snap.at("sidecar_model").get<std::string>(), "fast");
    EXPECT_EQ(snap.at("sidecar_wait_ms").get<int>(), 800);
    ASSERT_EQ(snap.at("modes").size(), 3u);
    EXPECT_EQ(snap["modes"][0].get<std::string>(), "prompt");
    EXPECT_EQ(snap["modes"][1].get<std::string>(), "reasoning");
    EXPECT_EQ(snap["modes"][2].get<std::string>(), "sidecar");
    ASSERT_EQ(snap.at("saved_models").size(), 2u);
    EXPECT_EQ(snap["saved_models"][1].get<std::string>(), "fast");
}

// 场景:PUT 只带 {enabled:false}。期望:patch 语义 —— 其它字段沿用当前值。
TEST(ToolPreambleHandler, PatchKeepsUnmentionedFields) {
    ToolPreambleConfig out;
    std::string error;
    ASSERT_TRUE(parse_tool_preamble_request({{"enabled", false}}, current_cfg(), kModels, out, error))
        << error;
    EXPECT_FALSE(out.enabled);
    EXPECT_EQ(out.mode, "reasoning");
    EXPECT_EQ(out.sidecar_model, "fast");
    EXPECT_EQ(out.sidecar_wait_ms, 800);
}

// 场景:PUT 全字段合法 {mode:"sidecar", sidecar_model:"main", sidecar_wait_ms:0};
// sidecar_model 传 null 表示清空(沿用会话模型)。期望:逐字段生效。
TEST(ToolPreambleHandler, AcceptsAllFieldsAndNullClearsModel) {
    ToolPreambleConfig out;
    std::string error;
    ASSERT_TRUE(parse_tool_preamble_request(
        {{"mode", "sidecar"}, {"sidecar_model", "main"}, {"sidecar_wait_ms", 0}},
        current_cfg(), kModels, out, error)) << error;
    EXPECT_EQ(out.mode, "sidecar");
    EXPECT_EQ(out.sidecar_model, "main");
    EXPECT_EQ(out.sidecar_wait_ms, 0);

    ASSERT_TRUE(parse_tool_preamble_request(
        {{"sidecar_model", nullptr}}, current_cfg(), kModels, out, error)) << error;
    EXPECT_TRUE(out.sidecar_model.empty());
    ASSERT_TRUE(parse_tool_preamble_request(
        {{"sidecar_model", ""}}, current_cfg(), kModels, out, error)) << error;
    EXPECT_TRUE(out.sidecar_model.empty());
}

// 场景:非法请求 —— body 不是对象 / mode 不在三选一里 / sidecar_model 不是
// 已保存模型 / sidecar_wait_ms 越界或非整数 / enabled 非布尔。
// 期望:全部返回 false 且 out 保持调用前的值(这里预置成 current 以便比对),
// error 非空。
TEST(ToolPreambleHandler, RejectsInvalidRequestsWithoutTouchingOutput) {
    const auto cases = std::vector<nlohmann::json>{
        nlohmann::json::array(),
        {{"mode", "auto"}},
        {{"mode", 3}},
        {{"sidecar_model", "missing"}},
        {{"sidecar_model", 1}},
        {{"sidecar_wait_ms", -1}},
        {{"sidecar_wait_ms", 15001}},
        {{"sidecar_wait_ms", "500"}},
        {{"enabled", "yes"}},
    };
    for (const auto& body : cases) {
        ToolPreambleConfig out = current_cfg();
        std::string error;
        EXPECT_FALSE(parse_tool_preamble_request(body, current_cfg(), kModels, out, error))
            << body.dump();
        EXPECT_FALSE(error.empty()) << body.dump();
        EXPECT_EQ(out, current_cfg()) << body.dump();
    }
}
