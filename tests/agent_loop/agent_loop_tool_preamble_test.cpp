// 覆盖 AgentLoop 的工具前言(openspec add-tool-preamble)三种模式的端到端行为:
//   1. reasoning:推理流里的 **加粗** 成为批次标题 —— agent_progress 的 reasoning
//      label 换成标题、tool_preamble 事件、tool_start 带 preamble、assistant(tool_calls)
//      消息 metadata 落盘
//   2. reasoning 兜底:没有加粗时取推理首句(去口头填充)
//   3. prompt(参数模式):每个工具定义多一个 `preamble` 参数;模型在调用参数里填的
//      那句话随 tool_start 下发、进度 label、metadata.calls 落盘,执行前从参数里剥掉
//      (工具与落盘的参数都看不到它);参数还在流式传输时就从前缀里抽出来当
//      tool_planning 的 label;不填参数时一切照旧;系统提示保留「不要叙述」口径
//   4. sidecar:旁路摘要器拿到本步材料,结果在落盘前等到 → 进 metadata;
//      等不到 → 先无标题落盘,工具执行完补发 late=true 事件
//   5. 关闭:一切照旧(无事件、无 metadata、label 仍是「正在推理」)
// 用 StubLlmProvider 精确脚本流事件;probe 工具可注入延迟以制造 sidecar 迟到,
// 并记录自己实际收到的参数。

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

struct ReceivedArgs {
    std::mutex mu;
    std::vector<std::string> args;
};

ToolImpl make_probe_tool(int delay_ms, std::shared_ptr<ReceivedArgs> received) {
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
    impl.execute = [delay_ms, received](const std::string& args, const ToolContext&) -> ToolResult {
        if (received) {
            std::lock_guard<std::mutex> lk(received->mu);
            received->args.push_back(args);
        }
        if (delay_ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
        return ToolResult{"probe ok", true};
    };
    return impl;
}

// 非只读探针:走顺序执行的写工具路径(有 TUI 进度头)。
ToolImpl make_write_probe_tool(std::shared_ptr<ReceivedArgs> received) {
    ToolImpl impl = make_probe_tool(0, std::move(received));
    impl.definition.name = "probe_write";
    impl.definition.description = "Tool preamble write probe";
    impl.is_read_only = false;
    return impl;
}

// schema 自己就声明了 `preamble` 的工具(MCP 工具撞名的情形)。
ToolImpl make_native_preamble_tool(std::shared_ptr<ReceivedArgs> received) {
    ToolImpl impl = make_probe_tool(0, std::move(received));
    impl.definition.name = "probe_native";
    impl.definition.description = "Tool whose own schema declares preamble";
    impl.definition.parameters["properties"]["preamble"] = {
        {"type", "string"}, {"description", "Document preamble text"}};
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

StreamEvent probe_call_event(const std::string& args = R"({"file_path":"registry.hpp"})",
                             const std::string& id = "call-1") {
    StreamEvent evt;
    evt.type = StreamEventType::ToolCall;
    evt.tool_call = ToolCall{id, "probe_read", args};
    return evt;
}

// 任意工具的完整调用事件(写工具 / 自带 preamble 参数的工具用)。
StreamEvent call_event(const std::string& name, const std::string& args,
                       const std::string& id = "call-1") {
    StreamEvent evt;
    evt.type = StreamEventType::ToolCall;
    evt.tool_call = ToolCall{id, name, args};
    return evt;
}

StreamEvent probe_call_delta_event(const std::string& args_prefix,
                                   const std::string& id = "call-1") {
    StreamEvent evt;
    evt.type = StreamEventType::ToolCallDelta;
    evt.tool_index = 0;
    evt.tool_call = ToolCall{id, "probe_read", args_prefix};
    evt.tool_call_argument_bytes = args_prefix.size();
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
        : cwd_(std::move(cwd)), received_(std::make_shared<ReceivedArgs>()) {
        tools_.register_tool(make_probe_tool(tool_delay_ms, received_));
        tools_.register_tool(make_write_probe_tool(received_));
        tools_.register_tool(make_native_preamble_tool(received_));
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
        cb.on_tool_progress_start = [this](const std::string&, const std::string&,
                                           const std::string& preamble) {
            std::lock_guard<std::mutex> lk(events_mu_);
            progress_preambles_.push_back(preamble);
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

    std::vector<std::string> progress_labels(const std::string& phase) const {
        std::vector<std::string> labels;
        for (const auto& e : events_of(SessionEventKind::AgentProgress)) {
            if (e.payload.value("phase", std::string{}) == phase) {
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
    std::vector<std::string> progress_preambles() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return progress_preambles_;
    }
    std::vector<std::string> received_args() const {
        std::lock_guard<std::mutex> lk(received_->mu);
        return received_->args;
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

    std::optional<ToolDef> tool_def_of_turn(int turn, const std::string& name) const {
        for (const auto& def : provider_->tools_for_turn(turn)) {
            if (def.name == name) return def;
        }
        return std::nullopt;
    }

private:
    std::string cwd_;
    std::shared_ptr<ReceivedArgs> received_;
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
    std::vector<std::string> progress_preambles_;

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

bool has_tool_preamble_metadata(const std::optional<ChatMessage>& message) {
    return message.has_value() && message->metadata.is_object() &&
           message->metadata.contains("tool_preamble");
}

std::string first_tool_start_preamble(const ToolPreambleHarness& h) {
    const auto starts = h.events_of(SessionEventKind::ToolStart);
    if (starts.empty()) return "<no tool_start>";
    return starts[0].payload.value("preamble", std::string{});
}

} // namespace

// 场景:reasoning 模式,provider 先流回摘要 "**Reading registry sections**\n\n…",
// 再给一个 probe_read 调用,下一轮纯文本收尾。
// 期望:
//   - agent_progress 的 reasoning label 至少有一条等于标题(实时指示行);
//   - on_thinking_title 回调收到标题(TUI 等待短语);
//   - 恰好一条 tool_preamble 事件:title / source=reasoning / late=false /
//     tool_call_ids=["call-1"] / batch_id="call-1";
//   - tool_start 带 preamble(工具行直接显示),TUI 进度回调也拿到它;
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

    const auto labels = h.progress_labels("reasoning");
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
    EXPECT_EQ(first_tool_start_preamble(h), "Reading registry sections");
    // probe_read 是只读工具,走并行读路径,不驱动 TUI 进度头(on_tool_progress_start
    // 只给顺序执行的写工具)—— 这里为空是既有行为,不是标题丢了。
    EXPECT_TRUE(h.progress_preambles().empty());
    EXPECT_EQ(h.callback_titles(), std::vector<std::string>{"reasoning:Reading registry sections"});

    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(has_tool_preamble_metadata(persisted));
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

    const auto labels = h.progress_labels("reasoning");
    ASSERT_FALSE(labels.empty());
    EXPECT_EQ(labels.back(), "正在推理");
    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_EQ(preambles[0].payload.value("title", ""), "inspect the loader first");
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(has_tool_preamble_metadata(persisted));
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""), "inspect the loader first");
}

// 场景:prompt(参数)模式,模型在调用参数里填了
// {"preamble":"Reading the registry loader","file_path":"registry.hpp"};下一轮收尾。
// 期望:
//   - 发给 provider 的 probe_read 定义多了 `preamble` 字符串参数;
//   - 系统提示含「# Tool call preamble」段,且保留「Do not narrate every tool call」;
//   - tool_start 带 preamble / preamble_source=prompt,tool_running 的 label 是前言;
//     on_tool_preamble 回调逐调用送到 TUI(source=prompt,TUI 挂到该 tool_call 行);
//   - 工具实际收到的参数、落盘的 tool_calls 参数都没有 preamble 键(剥干净);
//   - 落盘 metadata.tool_preamble = {source:"prompt", calls:{"call-1": 前言}},没有 title;
//   - 参数模式没有批次标题:没有 tool_preamble 事件。
// 回归背景:第一版做成「先说一句话再调工具」—— 文本先变气泡、批次开始才搬进 loading、
// 连续单工具步堆成一摞标题行;参数模式把前言绑在调用上,这些时序问题就没有了。
TEST(AgentLoopToolPreamble, PromptModeInjectsParameterAndStripsItPerCall) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        probe_call_event(R"({"preamble":"Reading the registry loader","file_path":"registry.hpp"})"),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto def = h.tool_def_of_turn(0, "probe_read");
    ASSERT_TRUE(def.has_value());
    EXPECT_EQ(def->parameters["properties"]["preamble"]["type"], "string");
    // 发给模型的定义里 preamble 必须在 required 里:grok 对可选参数几乎不填
    // (实测会话 20260923-164654-8908 与隔离基线 27 次调用只填 1 次)。
    bool preamble_required = false;
    for (const auto& item : def->parameters["required"]) {
        if (item.is_string() && item.get<std::string>() == "preamble") preamble_required = true;
    }
    EXPECT_TRUE(preamble_required);
    const std::string system_prompt = h.system_prompt_of_turn(0);
    EXPECT_NE(system_prompt.find("# Tool call preamble"), std::string::npos);
    EXPECT_NE(system_prompt.find("Do not narrate every tool call"), std::string::npos);

    const auto starts = h.events_of(SessionEventKind::ToolStart);
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_EQ(starts[0].payload.value("preamble", ""), "Reading the registry loader");
    EXPECT_EQ(starts[0].payload.value("preamble_source", ""), "prompt");
    EXPECT_FALSE(starts[0].payload["args"].contains("preamble"));
    const auto running = h.progress_labels("tool_running");
    ASSERT_FALSE(running.empty());
    EXPECT_EQ(running.front(), "Reading the registry loader");
    // 只读工具不驱动 TUI 进度头(见 ReasoningModeUsesBoldTitleForBatch);TUI 靠
    // on_tool_preamble(source=prompt) 逐调用拿前言,挂到紧接着的 tool_call 行上。
    EXPECT_TRUE(h.progress_preambles().empty());
    EXPECT_EQ(h.callback_titles(), std::vector<std::string>{"prompt:Reading the registry loader"});

    const auto received = h.received_args();
    ASSERT_EQ(received.size(), 1u);
    EXPECT_EQ(nlohmann::json::parse(received[0]), nlohmann::json({{"file_path", "registry.hpp"}}));

    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(has_tool_preamble_metadata(persisted));
    const auto persisted_args = nlohmann::json::parse(
        persisted->tool_calls[0]["function"]["arguments"].get<std::string>());
    EXPECT_FALSE(persisted_args.contains("preamble"));
    const auto& meta = persisted->metadata["tool_preamble"];
    EXPECT_EQ(meta.value("source", ""), "prompt");
    EXPECT_FALSE(meta.contains("title"));
    EXPECT_EQ(meta["calls"].value("call-1", ""), "Reading the registry loader");

    EXPECT_TRUE(h.events_of(SessionEventKind::ToolPreamble).empty());
}

// 场景:prompt 模式,模型调用的是写工具(probe_write,非只读,顺序执行路径),参数里
// 带 {"preamble":"Writing the loader","file_path":"a"}。期望:TUI 进度头回调
// on_tool_progress_start 的第三参拿到前言(写工具才有进度头),on_tool_preamble 也
// 逐调用送到(source=prompt),工具收到的参数不含 preamble。
TEST(AgentLoopToolPreamble, PromptModeWriteToolPreambleReachesProgressHeader) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt_write");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        call_event("probe_write", R"({"preamble":"Writing the loader","file_path":"a"})"),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_EQ(h.progress_preambles(), std::vector<std::string>{"Writing the loader"});
    EXPECT_EQ(h.callback_titles(), std::vector<std::string>{"prompt:Writing the loader"});
    EXPECT_EQ(first_tool_start_preamble(h), "Writing the loader");
    const auto received = h.received_args();
    ASSERT_EQ(received.size(), 1u);
    EXPECT_EQ(nlohmann::json::parse(received[0]), nlohmann::json({{"file_path", "a"}}));
}

// 场景:prompt 模式,工具 probe_native 的 schema 自己就声明了 `preamble`(MCP 工具
// 撞名的情形),模型按该工具的真实语义传 {"preamble":"keep me","file_path":"a"}。
// 期望:发给模型的定义里 preamble 仍是工具自己那份(说明文案没被注入的覆盖),
// 执行与落盘的参数原样保留 preamble(不剥),tool_start 没有前言、没有
// on_tool_preamble 回调、没有 metadata.tool_preamble —— 那不是前言,是入参。
TEST(AgentLoopToolPreamble, PromptModeLeavesNativePreambleParameterAlone) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt_native");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        call_event("probe_native", R"({"preamble":"keep me","file_path":"a"})"),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto def = h.tool_def_of_turn(0, "probe_native");
    ASSERT_TRUE(def.has_value());
    EXPECT_EQ(def->parameters["properties"]["preamble"]["description"],
              "Document preamble text");
    const auto received = h.received_args();
    ASSERT_EQ(received.size(), 1u);
    EXPECT_EQ(nlohmann::json::parse(received[0]),
              nlohmann::json({{"preamble", "keep me"}, {"file_path", "a"}}));
    EXPECT_EQ(first_tool_start_preamble(h), "");
    EXPECT_TRUE(h.callback_titles().empty());
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(persisted.has_value());
    EXPECT_FALSE(has_tool_preamble_metadata(persisted));
    const auto persisted_args = nlohmann::json::parse(
        persisted->tool_calls[0]["function"]["arguments"].get<std::string>());
    EXPECT_EQ(persisted_args.value("preamble", ""), "keep me");
}

// 场景:prompt 模式,参数还在流式传输 —— 先到一个 ToolCallDelta,参数前缀是
// {"preamble":"Checking the loader","file_path":"regi(值已闭合、参数没流完),
// 再到完整的 ToolCall。
// 期望:tool_planning 的 label 在参数流完之前就换成了前言,原来的「正在准备调用
// probe_read」退到 detail —— 这就是「参数一流出来就当 loading 文案」。
TEST(AgentLoopToolPreamble, PromptModeStreamingPrefixDrivesPlanningLabel) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt_stream");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        probe_call_delta_event(R"({"preamble":"Checking the loader","file_path":"regi)"),
        probe_call_event(R"({"preamble":"Checking the loader","file_path":"registry.hpp"})"),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto planning = h.events_of(SessionEventKind::AgentProgress);
    bool seen = false;
    for (const auto& e : planning) {
        if (e.payload.value("phase", "") != "tool_planning") continue;
        seen = true;
        EXPECT_EQ(e.payload.value("label", ""), "Checking the loader");
        EXPECT_EQ(e.payload.value("detail", ""), "正在准备调用 probe_read");
    }
    EXPECT_TRUE(seen);
    EXPECT_EQ(first_tool_start_preamble(h), "Checking the loader");
}

// 场景:prompt 模式,但模型这次没填 preamble 参数(或写了长段正文再调工具)。
// 期望:一切照旧 —— tool_start 没有 preamble、没有 tool_preamble 事件、落盘
// metadata 没有 tool_preamble、正文照常作为普通消息;reasoning 模式下系统提示
// 保持旧口径也在这里一并验证。
TEST(AgentLoopToolPreamble, PromptModeWithoutParameterFallsBackToDefaults) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_prompt_plain");
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
    EXPECT_EQ(first_tool_start_preamble(h), "");
    EXPECT_FALSE(has_tool_preamble_metadata(h.persisted_tool_call_message()));
    EXPECT_TRUE(h.progress_preambles().empty());
    EXPECT_TRUE(h.callback_titles().empty());

    ToolPreambleHarness r(make_temp_dir("acecode_tool_preamble_reasoning_prompt").string());
    r.configure(true, "reasoning");
    r.provider().push_text("done");
    ASSERT_TRUE(r.submit_and_wait());
    const std::string system_prompt = r.system_prompt_of_turn(0);
    EXPECT_NE(system_prompt.find("Do not narrate every tool call"), std::string::npos);
    EXPECT_EQ(system_prompt.find("# Tool call preamble"), std::string::npos);
    const auto def = r.tool_def_of_turn(0, "probe_read");
    ASSERT_TRUE(def.has_value());
    EXPECT_FALSE(def->parameters["properties"].contains("preamble"));
}

// 场景:sidecar 模式,注入的摘要器立即返回 "Checking registry sections"。
// 期望:摘要器拿到的材料里有用户请求 "go"、第一个工具名 probe_read 与参数预览;
// 结果在落盘前等到 → tool_preamble 事件 late=false、tool_start 带前言、metadata 里有标题。
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
    EXPECT_EQ(first_tool_start_preamble(h), "Checking registry sections");
    const auto persisted = h.persisted_tool_call_message();
    ASSERT_TRUE(has_tool_preamble_metadata(persisted));
    EXPECT_EQ(persisted->metadata["tool_preamble"].value("title", ""), "Checking registry sections");
}

// 场景:sidecar 模式,摘要器要 300ms 才回,sidecar_wait_ms 只给 50ms,而 probe
// 工具本身要跑 600ms(旁路结果在工具执行期间到达)。
// 期望:
//   - 落盘的 assistant(tool_calls) 消息没有 metadata.tool_preamble(等不到不落盘);
//   - tool_start 没有前言;
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

    EXPECT_FALSE(has_tool_preamble_metadata(h.persisted_tool_call_message()));
    EXPECT_EQ(first_tool_start_preamble(h), "");

    const auto preambles = h.events_of(SessionEventKind::ToolPreamble);
    ASSERT_EQ(preambles.size(), 1u);
    EXPECT_TRUE(preambles[0].payload.value("late", false));
    EXPECT_EQ(preambles[0].payload.value("title", ""), "Late label");
    EXPECT_EQ(preambles[0].payload.value("batch_id", ""), "call-1");
    EXPECT_TRUE(h.callback_titles().empty());
}

// 场景:功能关闭(默认),provider 照样流回加粗摘要 + 带 preamble 参数的工具调用。
// 期望:没有 tool_preamble 事件与回调,reasoning label 仍是「正在推理」,工具定义
// 里没有 preamble 参数,参数原样传给工具(关闭时不剥 —— 那是工具自己的参数),
// 落盘 metadata 没有 tool_preamble —— 默认关闭时行为与改动前一致。
TEST(AgentLoopToolPreamble, DisabledLeavesTranscriptUntouched) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_disabled");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(false, "reasoning");
    h.provider().push_events({
        reasoning_event("**Reading registry sections**\n\nDetails."),
        probe_call_event(R"({"preamble":"Own parameter","file_path":"a"})"),
        done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_TRUE(h.events_of(SessionEventKind::ToolPreamble).empty());
    EXPECT_TRUE(h.callback_titles().empty());
    EXPECT_TRUE(h.thinking_titles().empty());
    const auto labels = h.progress_labels("reasoning");
    ASSERT_FALSE(labels.empty());
    EXPECT_EQ(labels.back(), "正在推理");
    const auto def = h.tool_def_of_turn(0, "probe_read");
    ASSERT_TRUE(def.has_value());
    EXPECT_FALSE(def->parameters["properties"].contains("preamble"));
    const auto received = h.received_args();
    ASSERT_EQ(received.size(), 1u);
    EXPECT_TRUE(nlohmann::json::parse(received[0]).contains("preamble"));
    EXPECT_EQ(first_tool_start_preamble(h), "");
    EXPECT_FALSE(has_tool_preamble_metadata(h.persisted_tool_call_message()));
}
