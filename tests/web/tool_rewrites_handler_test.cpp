#include <gtest/gtest.h>

#include "web/handlers/tool_rewrites_handler.hpp"

#include <string>
#include <vector>

using namespace acecode;
using namespace acecode::web;
using nlohmann::json;

namespace {

RegisteredToolInfo make_registered(std::string name,
                                   ToolSource source = ToolSource::Builtin,
                                   bool read_only = false) {
    RegisteredToolInfo info;
    info.definition.name = std::move(name);
    info.definition.description = "desc of " + info.definition.name;
    info.is_read_only = read_only;
    info.source = source;
    return info;
}

std::vector<RegisteredToolInfo> registry() {
    return {
        make_registered("file_write"),
        make_registered("bash"),
        make_registered("file_read", ToolSource::Builtin, true),
        make_registered("mcp__probe__search", ToolSource::Mcp),
    };
}

} // namespace

// 场景:GET 响应。
// 期望:tools 只含 Builtin、按名字排序、带 read_only;rewrites / defaults 是
// native→public 对象;path 原样;warning 只在加载出错时出现。
TEST(ToolRewritesHandler, SnapshotListsSortedBuiltinToolsAndMappings) {
    tool_rewrites::ToolRewriteSettings settings;
    settings.enabled = true;
    settings.rewrites = {{"file_read", "peek"}};

    const json snapshot = tool_rewrites_snapshot(
        settings, registry(), "C:/data/tool-rewrites.json");
    EXPECT_EQ(snapshot["enabled"], true);
    EXPECT_EQ(snapshot["rewrites"], json({{"file_read", "peek"}}));
    EXPECT_EQ(snapshot["defaults"]["file_write"], "write");
    EXPECT_EQ(snapshot["path"], "C:/data/tool-rewrites.json");
    EXPECT_FALSE(snapshot.contains("warning"));
    ASSERT_EQ(snapshot["tools"].size(), 3u);
    EXPECT_EQ(snapshot["tools"][0]["name"], "bash");
    EXPECT_EQ(snapshot["tools"][1]["name"], "file_read");
    EXPECT_EQ(snapshot["tools"][1]["read_only"], true);
    EXPECT_EQ(snapshot["tools"][1]["description"], "desc of file_read");
    EXPECT_EQ(snapshot["tools"][2]["name"], "file_write");

    const json warned = tool_rewrites_snapshot(settings, registry(), "p", "broken json");
    EXPECT_EQ(warned["warning"], "broken json");
}

// 场景:PUT body 合法(整体替换,含 no-op 条目)。
// 期望:解析出 enabled 与去掉 no-op 后的映射。
TEST(ToolRewritesHandler, ParsesValidRequest) {
    tool_rewrites::ToolRewriteSettings out;
    std::string error;
    ASSERT_TRUE(parse_tool_rewrites_request(
        json{{"enabled", true},
             {"rewrites", {{"file_read", "peek"}, {"bash", ""}, {"file_write", "file_write"}}}},
        registry(), out, error)) << error;
    EXPECT_TRUE(out.enabled);
    ASSERT_EQ(out.rewrites.size(), 1u);
    EXPECT_EQ(out.rewrites[0].native_name, "file_read");
    EXPECT_EQ(out.rewrites[0].public_name, "peek");
}

// 场景:各种非法 PUT body。
// 期望:全部 400 语义(返回 false + 文案),out 不被改动。
TEST(ToolRewritesHandler, RejectsInvalidRequestsWithoutTouchingOutput) {
    tool_rewrites::ToolRewriteSettings out;
    out.enabled = true;
    out.rewrites = {{"sentinel", "kept"}};
    std::string error;

    const std::vector<json> invalid = {
        json::array(),
        json{{"rewrites", json::object()}},                         // 缺 enabled
        json{{"enabled", "yes"}, {"rewrites", json::object()}},      // enabled 非布尔
        json{{"enabled", true}, {"rewrites", json::array()}},        // rewrites 非对象
        json{{"enabled", true}, {"rewrites", {{"file_read", 3}}}},   // 目标非字符串
        json{{"enabled", true}, {"rewrites", {{"file_read", "bash"}}}},        // 撞真工具
        json{{"enabled", true}, {"rewrites", {{"file_read", "read file"}}}},   // 非法字符
        json{{"enabled", true}, {"rewrites", {{"file_read", "x"}, {"file_write", "x"}}}}, // 重复 public
        json{{"enabled", true}, {"rewrites", {{"file_read", "file_write"}, {"file_write", "w"}}}}, // 撞映射内 native
    };
    for (const auto& body : invalid) {
        EXPECT_FALSE(parse_tool_rewrites_request(body, registry(), out, error))
            << body.dump();
        EXPECT_FALSE(error.empty()) << body.dump();
        ASSERT_EQ(out.rewrites.size(), 1u);
        EXPECT_EQ(out.rewrites[0].native_name, "sentinel");
    }
}
