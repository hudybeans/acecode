// 覆盖 resume 回放对 metadata.tool_preamble 的还原(openspec add-tool-preamble):
//   1. reasoning / sidecar 来源:assistant 正文行之后、tool_call 行之前多一行
//      role=preamble 的标题伪行
//   2. prompt 来源:那句正文就是标题,只出标题行,不再重复推正文行
//   3. 没有 tool_calls 的 assistant 消息即使带 metadata 也不出标题行(标题只
//      属于工具批次);没有 metadata 的老会话与改动前完全一致

#include <gtest/gtest.h>

#include "session/session_replay.hpp"
#include "tool/tool_executor.hpp"
#include "provider/llm_provider.hpp"
#include "tui_state.hpp"

#include <nlohmann/json.hpp>

using acecode::ChatMessage;
using acecode::ToolExecutor;
using acecode::TuiState;
using acecode::replay_session_messages;

namespace {

nlohmann::json one_tool_call(const std::string& id,
                             const std::string& name,
                             const std::string& args_json) {
    nlohmann::json tc;
    tc["id"] = id;
    tc["type"] = "function";
    tc["function"]["name"] = name;
    tc["function"]["arguments"] = args_json;
    return nlohmann::json::array({tc});
}

ChatMessage assistant_with_tool(const std::string& content,
                                const std::string& source,
                                const std::string& title) {
    ChatMessage m;
    m.role = "assistant";
    m.content = content;
    m.tool_calls = one_tool_call("call-1", "file_read", R"({"file_path":"a.txt"})");
    if (!title.empty()) {
        m.metadata = {{"tool_preamble", {{"title", title}, {"source", source}}}};
    }
    return m;
}

ChatMessage tool_result(const std::string& content) {
    ChatMessage t;
    t.role = "tool";
    t.content = content;
    t.tool_call_id = "call-1";
    return t;
}

std::vector<std::string> roles_of(const std::vector<TuiState::Message>& rows) {
    std::vector<std::string> out;
    for (const auto& row : rows) out.push_back(row.role);
    return out;
}

} // namespace

// 场景:reasoning 来源,assistant 有正文 "Let me look." + 1 个 tool_call,后跟结果。
// 期望:行序 assistant → preamble(标题)→ tool_call → tool_result;标题行内容
// 就是 metadata 里的 title。
TEST(SessionReplayToolPreamble, ReasoningTitleRowPrecedesToolCallRows) {
    ToolExecutor tools;
    const auto rows = replay_session_messages({
        assistant_with_tool("Let me look.", "reasoning", "Reading registry sections"),
        tool_result("ok"),
    }, tools);
    ASSERT_EQ(roles_of(rows), (std::vector<std::string>{
        "assistant", "preamble", "tool_call", "tool_result"}));
    EXPECT_EQ(rows[1].content, "Reading registry sections");
    EXPECT_FALSE(rows[1].is_tool);
}

// 场景:prompt 来源,正文 "Reading the loader" 本身就是前言。期望:不出重复的
// assistant 正文行,只有标题行 + 工具行。
TEST(SessionReplayToolPreamble, PromptSourceFoldsTextIntoTitleRow) {
    ToolExecutor tools;
    const auto rows = replay_session_messages({
        assistant_with_tool("Reading the loader", "prompt", "Reading the loader"),
        tool_result("ok"),
    }, tools);
    ASSERT_EQ(roles_of(rows), (std::vector<std::string>{
        "preamble", "tool_call", "tool_result"}));
    EXPECT_EQ(rows[0].content, "Reading the loader");
}

// 场景:没有 metadata 的老会话 / 没有 tool_calls 但带 metadata 的消息。
// 期望:前者与改动前一致(assistant → tool_call → tool_result);后者不出标题行。
TEST(SessionReplayToolPreamble, NoTitleWithoutMetadataOrWithoutToolCalls) {
    ToolExecutor tools;
    const auto legacy = replay_session_messages({
        assistant_with_tool("Let me look.", "", ""),
        tool_result("ok"),
    }, tools);
    EXPECT_EQ(roles_of(legacy), (std::vector<std::string>{
        "assistant", "tool_call", "tool_result"}));

    ChatMessage text_only;
    text_only.role = "assistant";
    text_only.content = "Done.";
    text_only.metadata = {{"tool_preamble", {{"title", "Stray"}, {"source", "reasoning"}}}};
    const auto rows = replay_session_messages({text_only}, tools);
    EXPECT_EQ(roles_of(rows), (std::vector<std::string>{"assistant"}));
}
