// 覆盖 src/web/handlers/tool_preamble_handler.cpp 的纯函数(openspec add-tool-preamble,
// 设置 > 常规 > 工作模式:「适合日常工作」= 开启具体进度提示):
//   1. tool_preamble_snapshot:GET 响应体只有 enabled
//   2. parse_tool_preamble_request:PUT 的 patch 语义、enabled 类型校验、失败时 out
//      不变;前三版遗留的 mode / sidecar_* 键被当作未知键忽略(旧前端还会带)

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
    return cfg;
}

} // namespace

// 场景:GET 快照。期望:只有 enabled 一个字段;提示驱动 / 推理摘要的 mode、modes
// 与旁路模型字段都不再出现。
TEST(ToolPreambleHandler, SnapshotExposesOnlyEnabled) {
    const auto snap = tool_preamble_snapshot(current_cfg());
    EXPECT_TRUE(snap.at("enabled").get<bool>());
    EXPECT_EQ(snap.size(), 1u);
    EXPECT_FALSE(snap.contains("mode"));
    EXPECT_FALSE(snap.contains("modes"));
    EXPECT_FALSE(snap.contains("sidecar_model"));
}

// 场景:工作模式切换发 PUT {enabled:false} / {enabled:true}。期望:按 body 生效。
TEST(ToolPreambleHandler, TogglesEnabled) {
    ToolPreambleConfig out;
    std::string error;
    ASSERT_TRUE(parse_tool_preamble_request({{"enabled", false}}, current_cfg(), out, error))
        << error;
    EXPECT_FALSE(out.enabled);
    ToolPreambleConfig off;
    ASSERT_TRUE(parse_tool_preamble_request({{"enabled", true}}, off, out, error)) << error;
    EXPECT_TRUE(out.enabled);
}

// 场景:旧前端还会发 {enabled:true, mode:"prompt"} 或带 sidecar_model / sidecar_wait_ms;
// 空对象是合法的 patch。期望:多余的旧键不报错也不影响结果;空 patch 沿用当前值。
TEST(ToolPreambleHandler, IgnoresLegacyModeKeys) {
    ToolPreambleConfig out;
    std::string error;
    ToolPreambleConfig off;
    ASSERT_TRUE(parse_tool_preamble_request(
        {{"enabled", true}, {"mode", "sidecar"}, {"sidecar_model", "fast"}, {"sidecar_wait_ms", 500}},
        off, out, error)) << error;
    EXPECT_TRUE(out.enabled);
    ASSERT_TRUE(parse_tool_preamble_request(nlohmann::json::object(), current_cfg(), out, error))
        << error;
    EXPECT_TRUE(out.enabled);
}

// 场景:非法请求 —— body 不是对象 / enabled 非布尔。期望:返回 false 且 out 保持
// 调用前的值,error 非空。
TEST(ToolPreambleHandler, RejectsInvalidRequestsWithoutTouchingOutput) {
    const auto cases = std::vector<nlohmann::json>{
        nlohmann::json::array(),
        {{"enabled", "yes"}},
        {{"enabled", 1}},
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
