#include <gtest/gtest.h>

#include "session/compact_checkpoint.hpp"
#include "session/session_manager.hpp"
#include "session/session_storage.hpp"
#include "session/thread_repair.hpp"

#include <filesystem>
#include <random>
#include <string>
#include <vector>

namespace {

acecode::ChatMessage message(std::string role, std::string content) {
    acecode::ChatMessage item;
    item.role = std::move(role);
    item.content = std::move(content);
    return item;
}

nlohmann::json tool_call(const std::string& id) {
    return nlohmann::json{
        {"id", id},
        {"type", "function"},
        {"function", {
            {"name", "file_write"},
            {"arguments", R"({"path":"a.txt"})"},
        }},
    };
}

std::filesystem::path unique_cwd(const std::string& label) {
    auto cwd = std::filesystem::temp_directory_path() /
        ("acecode_thread_repair_" + label + "_" +
         std::to_string(std::random_device{}()));
    std::filesystem::create_directories(cwd);
    return cwd;
}

bool contains(const std::vector<acecode::ChatMessage>& messages,
              const std::string& text) {
    for (const auto& item : messages) {
        if (item.content.find(text) != std::string::npos) return true;
    }
    return false;
}

} // namespace

TEST(ThreadRepair, PrunesWholeOldTurnAndPreservesCurrentInput) {
    const std::vector<acecode::ChatMessage> history{
        message("user", "old request"),
        message("assistant", "old answer"),
        message("user", "middle request"),
        message("assistant", "middle answer"),
        message("user", "current request"),
    };
    acecode::ThreadRepairOptions options;
    options.force_prune_one_group = true;
    options.target_tokens = 100000;

    const auto result = acecode::plan_thread_repair(history, options);

    ASSERT_EQ(result.status, acecode::ThreadRepairStatus::Repaired);
    EXPECT_EQ(result.pruned_groups, 1);
    EXPECT_EQ(result.pruned_messages, 2);
    EXPECT_FALSE(contains(result.replacement_history, "old request"));
    EXPECT_TRUE(contains(result.replacement_history, "middle request"));
    EXPECT_TRUE(contains(result.replacement_history, "current request"));
}

TEST(ThreadRepair, RecoversMissingToolResultWithoutReplayingTool) {
    auto assistant = message("assistant", "working");
    assistant.tool_calls = nlohmann::json::array({tool_call("call-1")});
    const std::vector<acecode::ChatMessage> history{
        message("user", "write it"),
        assistant,
        message("user", "continue"),
    };

    const auto result = acecode::plan_thread_repair(history, {});

    ASSERT_EQ(result.status, acecode::ThreadRepairStatus::Repaired);
    EXPECT_EQ(result.history_issues.synthesized_tool_results, 1u);
    ASSERT_EQ(result.replacement_history.size(), 4u);
    EXPECT_EQ(result.replacement_history[2].role, "tool");
    EXPECT_EQ(result.replacement_history[2].tool_call_id, "call-1");
    EXPECT_NE(result.replacement_history[2].content.find("outcome is unknown"),
              std::string::npos);
}

TEST(ThreadRepair, ReportsExhaustedInsteadOfTruncatingOnlyCurrentTurn) {
    acecode::ThreadRepairOptions options;
    options.force_prune_one_group = true;
    options.target_tokens = 1;

    const auto result = acecode::plan_thread_repair(
        {message("user", "current input must remain")}, options);

    EXPECT_EQ(result.status, acecode::ThreadRepairStatus::HistoryExhausted);
    EXPECT_TRUE(result.checkpoint.id.empty());
    ASSERT_EQ(result.replacement_history.size(), 1u);
    EXPECT_EQ(result.replacement_history[0].content,
              "current input must remain");
}

namespace {

acecode::ChatMessage assistant_call(const std::string& id,
                                    std::string arguments = R"({"path":"a.txt"})") {
    acecode::ChatMessage item = message("assistant", "");
    item.tool_calls = nlohmann::json::array({nlohmann::json{
        {"id", id},
        {"type", "function"},
        {"function", {
            {"name", "file_write"},
            {"arguments", std::move(arguments)},
        }},
    }});
    return item;
}

acecode::ChatMessage tool_result(const std::string& id, std::string content) {
    acecode::ChatMessage item = message("tool", std::move(content));
    item.tool_call_id = id;
    return item;
}

// 只有当前回合、三次工具往返、每个输出 4000 字节的历史。
std::vector<acecode::ChatMessage> single_turn_with_tool_outputs() {
    return {
        message("user", "current request"),
        assistant_call("c1"),
        tool_result("c1", std::string(4000, 'A')),
        assistant_call("c2"),
        tool_result("c2", std::string(4000, 'B')),
        assistant_call("c3"),
        tool_result("c3", std::string(4000, 'C')),
    };
}

} // namespace

// 触发场景:只剩当前回合(没有整组可丢),目标要求腾空间,调用方允许清工具
// 输出(PA 兜底 / 摘要失败后的机械兜底)。
// 期望行为:从最旧的工具输出开始换成占位符,最近一条保留给模型继续干活;
// 调用与结果的配对不变,用户输入不动;状态 Repaired 并写 checkpoint。
// 回归背景:旧实现在这种历史上直接报 HistoryExhausted,回合里读了一堆大文件
// 之后一旦撞墙就只剩紧急档一条路,截图里那次致命 400 就是这么来的。
TEST(ThreadRepair, ClearsOldestToolOutputsWhenOnlyCurrentTurnRemains) {
    acecode::ThreadRepairOptions options;
    options.force_prune_one_group = true;
    options.target_tokens = 1;
    options.clear_tool_outputs = true;
    options.keep_recent_tool_outputs = 1;

    const auto result = acecode::plan_thread_repair(
        single_turn_with_tool_outputs(), options);

    EXPECT_EQ(result.status, acecode::ThreadRepairStatus::Repaired);
    EXPECT_EQ(result.pruned_groups, 0);
    EXPECT_EQ(result.cleared_tool_outputs, 2);
    EXPECT_EQ(result.reason, "old tool outputs were cleared");
    EXPECT_FALSE(result.checkpoint.id.empty());
    EXPECT_LT(result.post_tokens, result.pre_tokens);
    ASSERT_EQ(result.replacement_history.size(), 7u);
    EXPECT_EQ(result.replacement_history[0].content, "current request");
    EXPECT_EQ(result.replacement_history[2].content,
              acecode::kClearedToolOutputPlaceholder);
    EXPECT_EQ(result.replacement_history[2].tool_call_id, "c1");
    EXPECT_EQ(result.replacement_history[4].content,
              acecode::kClearedToolOutputPlaceholder);
    EXPECT_EQ(result.replacement_history[6].content, std::string(4000, 'C'))
        << "最近一条工具输出必须保留";
}

// 触发场景:同样的历史,但调用方没有打开 clear_tool_outputs(默认)。
// 期望行为:与旧行为完全一致 —— HistoryExhausted、历史原样、不写 checkpoint。
TEST(ThreadRepair, DoesNotClearToolOutputsUnlessAllowed) {
    acecode::ThreadRepairOptions options;
    options.force_prune_one_group = true;
    options.target_tokens = 1;

    const auto result = acecode::plan_thread_repair(
        single_turn_with_tool_outputs(), options);

    EXPECT_EQ(result.status, acecode::ThreadRepairStatus::HistoryExhausted);
    EXPECT_EQ(result.cleared_tool_outputs, 0);
    EXPECT_TRUE(result.checkpoint.id.empty());
    ASSERT_EQ(result.replacement_history.size(), 7u);
    EXPECT_EQ(result.replacement_history[2].content, std::string(4000, 'A'));
}

// 触发场景:工具输出清完仍超目标,历史里有一条 file_write 调用带着整篇文件
// 内容(参数超过 4KB),还有一条小参数调用。
// 期望行为:大参数换成占位 JSON,小参数原样保留,最近一条调用不动。
TEST(ThreadRepair, ClearsOversizedToolCallArgumentsAfterOutputs) {
    const std::string big_arguments =
        R"({"path":"big.txt","content":")" + std::string(6000, 'W') + R"("})";
    std::vector<acecode::ChatMessage> history{
        message("user", "current request"),
        assistant_call("c1", big_arguments),
        tool_result("c1", std::string(4000, 'x')),
        assistant_call("c2"),
        tool_result("c2", std::string(4000, 'y')),
        assistant_call("c3", big_arguments),
        tool_result("c3", std::string(4000, 'z')),
    };
    acecode::ThreadRepairOptions options;
    options.force_prune_one_group = true;
    options.target_tokens = 1;
    options.clear_tool_outputs = true;
    options.keep_recent_tool_outputs = 1;

    const auto result = acecode::plan_thread_repair(history, options);

    EXPECT_EQ(result.status, acecode::ThreadRepairStatus::Repaired);
    // 两条工具输出(c1、c2)+ 一条大参数调用(c1);c3 是最近一条调用,保留。
    EXPECT_EQ(result.cleared_tool_outputs, 3);
    ASSERT_EQ(result.replacement_history.size(), 7u);
    EXPECT_EQ(result.replacement_history[1].tool_calls[0]["function"]["arguments"],
              acecode::kClearedToolArgumentsJson);
    EXPECT_EQ(result.replacement_history[3].tool_calls[0]["function"]["arguments"],
              R"({"path":"a.txt"})")
        << "小参数不值得清";
    EXPECT_EQ(result.replacement_history[5].tool_calls[0]["function"]["arguments"],
              big_arguments)
        << "最近一条调用必须保留";
}

TEST(ThreadRepair, HealthyHistoryReportsNoChangeWithoutWritingCheckpoint) {
    const auto result = acecode::plan_thread_repair(
        {message("user", "request"), message("assistant", "answer")}, {});

    EXPECT_EQ(result.status, acecode::ThreadRepairStatus::NoChange);
    EXPECT_TRUE(result.checkpoint.id.empty());
    EXPECT_EQ(result.reason, "provider history is already consistent");
}

TEST(ThreadRepair, ApplyAppendsCheckpointWithoutRewritingTranscript) {
    const auto cwd = unique_cwd("append");
    const std::string cwd_string = cwd.string();
    const std::string project_dir =
        acecode::SessionStorage::get_project_dir(cwd_string);
    std::filesystem::remove_all(project_dir);

    {
        acecode::SessionManager manager;
        manager.start_session(cwd_string, "stub", "model");
        std::vector<acecode::ChatMessage> history{
            message("user", "old request"),
            message("assistant", "old answer"),
            message("user", "current request"),
        };
        for (const auto& item : history) manager.on_message(item);
        const std::string id = manager.current_session_id();

        acecode::ThreadRepairOptions options;
        options.trigger = "repair-test";
        options.force_prune_one_group = true;
        const auto result = acecode::apply_thread_repair(
            &manager, history, options);
        ASSERT_TRUE(result.repaired());

        const auto raw = acecode::SessionStorage::load_messages(
            acecode::SessionStorage::session_path(project_dir, id));
        ASSERT_EQ(raw.size(), 4u);
        EXPECT_EQ(raw[0].content, "old request");
        EXPECT_EQ(raw[1].content, "old answer");
        EXPECT_EQ(raw[2].content, "current request");
        EXPECT_TRUE(acecode::is_compact_checkpoint_message(raw[3]));
        const auto effective =
            acecode::reconstruct_effective_model_history(raw);
        ASSERT_EQ(effective.size(), 1u);
        EXPECT_EQ(effective[0].content, "current request");
        manager.finalize();
    }

    std::filesystem::remove_all(project_dir);
    std::filesystem::remove_all(cwd);
}
