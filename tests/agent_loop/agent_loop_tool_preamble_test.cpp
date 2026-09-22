// 覆盖 AgentLoop 的工具前言(openspec add-tool-preamble)三种模式的端到端行为:
//   1. reasoning:推理流里的 **加粗** 成为批次标题 —— agent_progress 的 reasoning
//      label 换成标题、tool_preamble 事件、assistant(tool_calls) 消息 metadata 落盘
//   2. reasoning 兜底:没有加粗时取推理首句(去口头填充)
//   3. prompt:含工具调用的 assistant 短句成为标题;多段正文不算前言;
//      系统提示切换成 preamble 指引
//   4. sidecar:旁路摘要器拿到本步材料,结果在落盘前等到 → 进 metadata;
//      等不到 → 先无标题落盘,工具执行完补发 late=true 事件
//   5. 关闭:一切照旧(无事件、无 metadata、label 仍是「正在推理」)
// 用 StubLlmProvider 精确脚本流事件;probe 工具可注入延迟以制造 sidecar 迟到。

#include <gtest/gtest.h>

#include "agent_loop.hpp"
#include "permissions.hpp"
#include "provider/llm_provider.hpp"
#include "session/event_dispatcher.hpp"
#include "session/session_manager.hpp"
#include "session/session_storage.hpp"
#include "stub_provider.hpp"
#include "tool/tool_executor.hpp"
#include "tool_preamble/tool_preamble.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using acecode::AgentCallbacks;
using acecode::AgentLoop;
using acecode::ChatMessage;
using acecode::PermissionManager;
using acecode::PermissionMode;
using acecode::SessionEvent;
using acecode::SessionEventKind;
using acecode::StreamEvent;
using acecode::StreamEventType;
using acecode::ToolCall;
using acecode::ToolContext;
using acecode::ToolDef;
using acecode::ToolExecutor;
using acecode::ToolImpl;
using acecode::ToolPreambleConfig;
using acecode::ToolResult;
using acecode::ToolSource;
using acecode_test::ScriptedResponse;
using acecode_test::StubLlmProvider;

namespace fs = std::filesystem;
using namespace std::chrono_literals;

namespace {

ToolImpl make_probe_tool(int delay_ms) {
    ToolDef def;
    def.name = "probe_read";
    def.description = "Tool preamble probe";
    def.parameters = {
        {"type", "object"},
        {"properties", nlohmann::json::object({
            {"file_path", {{"type", "string"}}},
        })},
    };
    ToolImpl impl;
    impl.definition = def;
    impl.is_read_only = true;
    impl.source = ToolSource::Builtin;
    impl.execute = [delay_ms](const std::string&, const ToolContext&) -> ToolResult {
        if (delay_ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
        return ToolResult{"probe ok", true};
    };
    return impl;
}

fs::path make_temp_dir(const std::string& name) {
    static std::atomic<unsigned> seq{0};
    auto p = fs::temp_directory_path() /
        (name + "_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed()) +
         "_" + std::to_string(seq.fetch_add(1)));
    fs::remove_all(p);
    fs::create_directories(p);
    return p;
}

StreamEvent reasoning_event(std::string text) {
    StreamEvent evt;
    evt.type = StreamEventType::ReasoningDelta;
    evt.content = std::move(text);
    return evt;
}

StreamEvent delta_event(std::string text) {
    StreamEvent evt;
    evt.type = StreamEventType::Delta;
    evt.content = std::move(text);
    return evt;
}

StreamEvent probe_call_event(const std::string& id = "call-1") {
    StreamEvent evt;
    evt.type = StreamEventType::ToolCall;
    evt.tool_call = ToolCall{id, "probe_read", R"({"file_path":"registry.hpp"})"};
    return evt;
}

StreamEvent done_event() {
    StreamEvent evt;
    evt.type = StreamEventType::Done;
    return evt;
}

class ToolPreambleHarness {
public:
    explicit ToolPreambleHarness(std::string cwd, int tool_delay_ms = 0)
        : cwd_(std::move(cwd)) {
        tools_.register_tool(make_probe_tool(tool_delay_ms));
        AgentCallbacks cb;
        cb.on_busy_changed = [this](bool busy) {
            std::lock_guard<std::mutex> lk(busy_mu_);
            busy_ = busy;
            if (!busy) busy_cv_.notify_all();
        };
        cb.on_tool_preamble = [this](const std::string& title, const std::string& source) {
            std::lock_guard<std::mutex> lk(events_mu_);
            callback_titles_.push_back(source + ":" + title);
        };
        cb.on_thinking_title = [this](const std::string& title) {
            std::lock_guard<std::mutex> lk(events_mu_);
            thinking_titles_.push_back(title);
        };
        auto accessor = [this]() -> std::shared_ptr<acecode::LlmProvider> { return provider_; };
        perms_.set_mode(PermissionMode::Yolo);
        loop_ = std::make_unique<AgentLoop>(accessor, tools_, cb, cwd_, perms_);
        sub_ = loop_->events().subscribe([this](const SessionEvent& e) {
            std::lock_guard<std::mutex> lk(events_mu_);
            events_.push_back(e);
        });
        session_manager_.start_session(cwd_, "stub", "stub-model");
        loop_->set_session_manager(&session_manager_);
    }

    ~ToolPreambleHarness() {
        if (loop_ && sub_ != 0) loop_->events().unsubscribe(sub_);
        if (loop_) loop_->shutdown();
        loop_.reset();
    }

    StubLlmProvider& provider() { return *provider_; }
    AgentLoop& loop() { return *loop_; }

    void configure(bool enabled, const std::string& mode, int sidecar_wait_ms = 2000) {
        ToolPreambleConfig cfg;
        cfg.enabled = enabled;
        cfg.mode = mode;
        cfg.sidecar_wait_ms = sidecar_wait_ms;
        loop_->set_tool_preamble_config(cfg);
    }

    bool submit_and_wait(std::chrono::milliseconds timeout = 10s) {
        {
            std::lock_guard<std::mutex> lk(busy_mu_);
            busy_ = true;
        }
        loop_->submit("go");
        std::unique_lock<std::mutex> lk(busy_mu_);
        return busy_cv_.wait_for(lk, timeout, [this] { return !busy_; });
    }

    std::vector<SessionEvent> events_of(SessionEventKind kind) const {
        std::lock_guard<std::mutex> lk(events_mu_);
        std::vector<SessionEvent> out;
        for (const auto& e : events_) {
            if (e.kind == kind) out.push_back(e);
        }
        return out;
    }

    std::vector<std::string> reasoning_progress_labels() const {
        std::vector<std::string> labels;
        for (const auto& e : events_of(SessionEventKind::AgentProgress)) {
            if (e.payload.value("phase", std::string{}) == "reasoning") {
                labels.push_back(e.payload.value("label", std::string{}));
            }
        }
        return labels;
    }

    std::vector<std::string> callback_titles() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return callback_titles_;
    }
    std::vector<std::string> thinking_titles() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return thinking_titles_;
    }

    // 落盘的 assistant(tool_calls) 消息(第一条)。
    std::optional<ChatMessage> persisted_tool_call_message() const {
        for (const auto& m : session_manager_.load_active_messages()) {
            if (m.role == "assistant" && m.tool_calls.is_array() && !m.tool_calls.empty()) {
                return m;
            }
        }
        return std::nullopt;
    }

    std::string system_prompt_of_turn(int turn) const {
        for (const auto& m : provider_->messages_for_turn(turn)) {
            if (m.role == "system") return m.content;
        }
        return {};
    }

private:
    std::string cwd_;
    std::shared_ptr<StubLlmProvider> provider_ = std::make_shared<StubLlmProvider>();
    ToolExecutor tools_;
    PermissionManager perms_;
    acecode::SessionManager session_manager_;
    std::unique_ptr<AgentLoop> loop_;
    acecode::EventDispatcher::SubscriptionId sub_ = 0;

    mutable std::mutex events_mu_;
    std::vector<SessionEvent> events_;
    std::vector<std::string> callback_titles_;
    std::vector<std::string> thinking_titles_;

    std::mutex busy_mu_;
    std::condition_variable busy_cv_;
    bool busy_ = false;
};

struct ProjectDirCleanup {
    fs::path project_dir;
    ~ProjectDirCleanup() {
        std::error_code ec;
        fs::remove_all(project_dir, ec);
    }
};

} // namespace

// 场景:reasoning 模式,provider 先流回摘要 "**Reading registry sections**\n\n…",
// 再给一个 probe_read 调用,下一轮纯文本收尾。
// 期望:
//   - agent_progress 的 reasoning label 至少有一条等于标题(实时指示行);
//   - on_thinking_title 回调收到标题(TUI 等待短语);
//   - 恰好一条 tool_preamble 事件:title / source=reasoning / late=false /
//     tool_call_ids=["call-1"] / batch_id="call-1";
//   - on_tool_preamble 回调收到 "reasoning:Reading registry sections";
//   - 落盘的 assistant(tool_calls) 消息 metadata.tool_preamble 与事件一致。
TEST(AgentLoopToolPreamble, ReasoningModeUsesBoldTitleForBatch) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_reasoning");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "reasoning");
    h.provider().push_events({
        reasoning_event("**Reading registry sections**\n\nOkay, the loader lives in src/experts."),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto labels = h.reasoning_progress_labels();
    ASSERT_FALSE(labels.empty());
    EXPECT_EQ(labels.back(), "Reading registry sections");
    EXPECT_EQ(h.thinking_titles(), std::vector<std::string>{"Reading registry sections"});

    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    const auto& p = preambles[0].payload;
    EXPECT_EQ(p.value("title", ""), "Reading registry sections");
    EXPECT_EQ(p.value("source", ""), "reasoning");
    EXPECT_FALSE(p.value("late", true));
    EXPECT_EQ(p.value("batch_id", ""), "call-1");
    ASSERT_EQ(p.at("tool_call_ids").size(), 1u);
    EXPECT_EQ(p["tool_call_ids"][0].get<std::string>(), "call-1");
    EXPECT_EQ(h.callback_titles(), std::vector<std::string>{"reasoning:Reading registry sections"});

    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    ASSERT_TRUE(persisted->metadata.is_object());
    ASSERT_TRUE(persisted->metadata.contains("tool_preamble"));
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""), "Reading registry sections");
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("source", ""), "reasoning");
}

// 场景:reasoning 模式,但 provider 的推理是 DeepSeek 式原始思维链,没有加粗:
// "Okay, I need to inspect the loader first. Then compare..."。
// 期望:标题 = 去掉 "Okay, " / "I need to " 后的首句 "inspect the loader first";
// 流式期间没有加粗所以 reasoning label 仍是「正在推理」(标题只在落盘时兜底)。
TEST(AgentLoopToolPreamble, ReasoningModeFallsBackToFirstSentence) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_reasoning_fallback");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "reasoning");
    h.provider().push_events({
        reasoning_event("Okay, I need to inspect the loader first. Then compare the registry."),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto labels = h.reasoning_progress_labels();
    ASSERT_FALSE(labels.empty());
    EXPECT_EQ(labels.back(), "正在推理");
    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_EQ(preambles[0].payload.value("title", ""), "inspect the loader first");
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""), "inspect the loader first");
}

// 场景:prompt 模式,模型按提示先写一句 "Reading the registry loader and expert config"
// 再调 probe_read;下一轮收尾。
// 期望:
//   - 请求里的系统提示含 preamble 指引、不含旧的「Do not narrate」口径;
//   - tool_preamble 事件 source=prompt、title=那句话;
//   - 带正文的工具回合会补发 assistant Message 帧,帧里带 metadata.tool_preamble
//     (前端靠它把气泡折成标题);
//   - 落盘 metadata 同样存在。
TEST(AgentLoopToolPreamble, PromptModeUsesShortAssistantLine) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        delta_event("Reading the registry loader and expert config"),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const std::string system_prompt = h.system_prompt_of_turn(0);
    EXPECT_NE(system_prompt.find("Before making tool calls, send a brief preamble"), std::string::npos);
    EXPECT_EQ(system_prompt.find("Do not narrate every tool call"), std::string::npos);

    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_EQ(preambles[0].payload.value("source", ""), "prompt");
    EXPECT_EQ(preambles[0].payload.value("title", ""), "Reading the registry loader and expert config");

    bool message_carries_metadata = false;
    for (const auto& e : h.events_of(SessionEventKind::Message)) {
        if (e.payload.value("role", "") != "assistant") continue;
        if (e.payload.contains("metadata") &&
            e.payload["metadata"].contains("tool_preamble")) {
            message_carries_metadata = true;
            EXPECT_EQ(e.payload["metadata"]["tool_preamble"].value("source", ""), "prompt");
        }
    }
    EXPECT_TRUE(message_carries_metadata);

    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""),
              "Reading the registry loader and expert config");
}

// 场景:prompt 模式,但模型写的是两段说明(不是一句前言)再调工具。
// 期望:不算前言 —— 没有 tool_preamble 事件,落盘 metadata 没有 tool_preamble,
// 正文照常作为普通消息。reasoning 模式下系统提示保持旧口径也在这里一并验证。
TEST(AgentLoopToolPreamble, PromptModeIgnoresLongTextAndReasoningKeepsLegacyPrompt) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt_long");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        delta_event("First I will look at the loader.\n\nThen I will compare it with the registry."),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());
    EXPECT_TRUE(h.events_of(SessionEventKind::ToolPreamble).empty());
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_FALSE(persisted->metadata.is_object() && persisted->metadata.contains("tool_preamble"));

    ToolPreambleHarness r(make_temp_dir("acecode_tool_preamble_reasoning_prompt").string());
    r.configure(true, "reasoning");
    r.provider().push_text("done");
    ASSERT_TRUE(r.submit_and_wait());
    const std::string system_prompt = r.system_prompt_of_turn(0);
    EXPECT_NE(system_prompt.find("Do not narrate every tool call"), std::string::npos);
    EXPECT_EQ(system_prompt.find("send a brief preamble"), std::string::npos);
}

// 场景:sidecar 模式,注入的摘要器立即返回 "Checking registry sections"。
// 期望:摘要器拿到的材料里有用户请求 "go"、第一个工具名 probe_read 与参数预览;
// 结果在落盘前等到 → tool_preamble 事件 late=false、metadata 里有标题。
TEST(AgentLoopToolPreamble, SidecarModeWaitsForSummarizer) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_sidecar");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "sidecar", 2000);
    std::mutex input_mu;
    acecode::tool_preamble::SidecarSummaryInput seen;
    h.loop().set_tool_preamble_sidecar_summarizer(
        [&](const acecode::tool_preamble::SidecarSummaryInput& input) {
            std::lock_guard<std::mutex> lk(input_mu);
            seen = input;
            return std::string("Checking registry sections");
        });
    h.provider().push_events({
        delta_event("Let me look."),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    {
        std::lock_guard<std::mutex> lk(input_mu);
        EXPECT_EQ(seen.user_request, "go");
        EXPECT_EQ(seen.assistant_text, "Let me look.");
        ASSERT_EQ(seen.calls.size(), 1u);
        EXPECT_EQ(seen.calls[0].name, "probe_read");
        EXPECT_NE(seen.calls[0].args_preview.find("registry.hpp"), std::string::npos);
    }
    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_EQ(preambles[0].payload.value("title", ""), "Checking registry sections");
    EXPECT_EQ(preambles[0].payload.value("source", ""), "sidecar");
    EXPECT_FALSE(preambles[0].payload.value("late", true));
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""), "Checking registry sections");
}

// 场景:sidecar 模式,摘要器要 300ms 才回,sidecar_wait_ms 只给 50ms,而 probe
// 工具本身要跑 600ms(旁路结果在工具执行期间到达)。
// 期望:
//   - 落盘的 assistant(tool_calls) 消息没有 metadata.tool_preamble(等不到不落盘);
//   - 工具执行完补发一条 tool_preamble 事件,late=true、标题正确、ids 正确;
//   - 回合不因等待失败而出错(仍正常结束)。
// 修复前的坑:若在落盘处无限等待,每一步都会被旁路模型的延迟拖住。
TEST(AgentLoopToolPreamble, SidecarModeLateResultEmitsLateEvent) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_sidecar_late");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string(), /*tool_delay_ms=*/600);
    h.configure(true, "sidecar", 50);
    h.loop().set_tool_preamble_sidecar_summarizer(
        [](const acecode::tool_preamble::SidecarSummaryInput&) {
            std::this_thread::sleep_for(300ms);
            return std::string("Late label");
        });
    h.provider().push_events({probe_call_event(), done_event()});
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait(15s));

    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_FALSE(persisted->metadata.is_object() && persisted->metadata.contains("tool_preamble"));

    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_TRUE(preambles[0].payload.value("late", false));
    EXPECT_EQ(preambles[0].payload.value("title", ""), "Late label");
    EXPECT_EQ(preambles[0].payload.value("batch_id", ""), "call-1");
    EXPECT_TRUE(h.callback_titles().empty());
}

// 场景:功能关闭(默认),provider 照样流回加粗摘要 + 工具调用。
// 期望:没有 tool_preamble 事件与回调,reasoning label 仍是「正在推理」,
// 落盘 metadata 没有 tool_preamble —— 默认关闭时行为与改动前一致。
TEST(AgentLoopToolPreamble, DisabledLeavesTranscriptUntouched) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_disabled");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(false, "reasoning");
    h.provider().push_events({
        reasoning_event("**Reading registry sections**\n\nDetails."),
        probe_call_event(),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_TRUE(h.events_of(SessionEventKind::ToolPreamble).empty());
    EXPECT_TRUE(h.callback_titles().empty());
    EXPECT_TRUE(h.thinking_titles().empty());
    const auto labels = h.reasoning_progress_labels();
    ASSERT_FALSE(labels.empty());
    EXPECT_EQ(labels.back(), "正在推理");
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_FALSE(persisted->metadata.is_object() && persisted->metadata.contains("tool_preamble"));
}
