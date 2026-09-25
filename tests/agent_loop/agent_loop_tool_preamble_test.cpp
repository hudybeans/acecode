// 工具前言(openspec add-tool-preamble)在 AgentLoop 里的端到端行为,用 StubLlmProvider
// 喂流式事件,真实 SessionManager 落盘到临时目录:
//   - prompt 模式:模型正文里的 <text_preamble> 标签 → 阶段前言。标签正文只进
//     loading(agent_progress / tool_start.preamble / on_thinking_title),不进 token
//     流与 Message 帧;落盘正文保留标签原文;前言跨模型步沿用,直到下一条标签
//     或未加标签的可见正文出现;最终回答误打的标签照样剥掉。
//   - reasoning 模式:推理加粗标题 / 首句兜底沿用为批次前言。
//   - 关闭:不发布前言,但标签仍不会露到界面上。
// 回归背景:第一版「先说一句话」与第二版「每次调用必填 preamble 参数」都被用户否掉
// (前者文本先变气泡、后者强迫模型每次填一句体验差),第三版才是标签方案。

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

StreamEvent call_event(const std::string& name, const std::string& args,
                       const std::string& id) {
    StreamEvent evt;
    evt.type = StreamEventType::ToolCall;
    evt.tool_call = ToolCall{id, name, args};
    return evt;
}

StreamEvent probe_call_event(const std::string& id = "call-1") {
    return call_event("probe_read", R"({"file_path":"registry.hpp"})", id);
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
        AgentCallbacks cb;
        cb.on_busy_changed = [this](bool busy) {
            std::lock_guard<std::mutex> lk(busy_mu_);
            busy_ = busy;
            if (!busy) busy_cv_.notify_all();
        };
        cb.on_thinking_title = [this](const std::string& title) {
            std::lock_guard<std::mutex> lk(events_mu_);
            thinking_titles_.push_back(title);
        };
        cb.on_delta = [this](const std::string& token) {
            std::lock_guard<std::mutex> lk(events_mu_);
            tui_deltas_ += token;
        };
        cb.on_message = [this](const std::string& role, const std::string& content, bool is_tool) {
            if (is_tool || role != "assistant") return;
            std::lock_guard<std::mutex> lk(events_mu_);
            tui_assistant_messages_.push_back(content);
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

    void configure(bool enabled, const std::string& mode) {
        ToolPreambleConfig cfg;
        cfg.enabled = enabled;
        cfg.mode = mode;
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

    std::vector<std::string> progress_details(const std::string& phase) const {
        std::vector<std::string> details;
        for (const auto& e : events_of(SessionEventKind::AgentProgress)) {
            if (e.payload.value("phase", std::string{}) == phase) {
                details.push_back(e.payload.value("detail", std::string{}));
            }
        }
        return details;
    }

    // Web 看到的 token 流(daemon 剥过标签)。
    std::string streamed_tokens() const {
        std::string out;
        for (const auto& e : events_of(SessionEventKind::Token)) {
            out += e.payload.value("text", std::string{});
        }
        return out;
    }

    // Web 看到的 assistant Message 帧正文(按顺序)。
    std::vector<std::string> assistant_message_frames() const {
        std::vector<std::string> out;
        for (const auto& e : events_of(SessionEventKind::Message)) {
            if (e.payload.value("role", std::string{}) == "assistant") {
                out.push_back(e.payload.value("content", std::string{}));
            }
        }
        return out;
    }

    std::vector<nlohmann::json> tool_starts() const {
        std::vector<nlohmann::json> out;
        for (const auto& e : events_of(SessionEventKind::ToolStart)) out.push_back(e.payload);
        return out;
    }

    std::vector<std::string> thinking_titles() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return thinking_titles_;
    }
    std::vector<std::string> progress_preambles() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return progress_preambles_;
    }
    std::string tui_deltas() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return tui_deltas_;
    }
    std::vector<std::string> tui_assistant_messages() const {
        std::lock_guard<std::mutex> lk(events_mu_);
        return tui_assistant_messages_;
    }
    std::vector<std::string> received_args() const {
        std::lock_guard<std::mutex> lk(received_->mu);
        return received_->args;
    }

    // 落盘的 assistant(tool_calls) 消息(按顺序)。
    std::vector<ChatMessage> persisted_tool_call_messages() const {
        std::vector<ChatMessage> out;
        for (const auto& m : session_manager_.load_active_messages()) {
            if (m.role == "assistant" && m.tool_calls.is_array() && !m.tool_calls.empty()) {
                out.push_back(m);
            }
        }
        return out;
    }

    std::vector<ChatMessage> persisted_assistant_text_messages() const {
        std::vector<ChatMessage> out;
        for (const auto& m : session_manager_.load_active_messages()) {
            if (m.role == "assistant" && (!m.tool_calls.is_array() || m.tool_calls.empty())) {
                out.push_back(m);
            }
        }
        return out;
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
    std::vector<std::string> thinking_titles_;
    std::vector<std::string> progress_preambles_;
    std::string tui_deltas_;
    std::vector<std::string> tui_assistant_messages_;

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

nlohmann::json preamble_metadata_of(const ChatMessage& message) {
    if (!message.metadata.is_object() || !message.metadata.contains("tool_preamble")) {
        return nullptr;
    }
    return message.metadata["tool_preamble"];
}

constexpr const char* kReadTag =
    "<text_preamble type=\"read\">Reading the loader</text_preamble>\n\n";

} // namespace

// 场景:prompt 模式,模型先流出一个完整的 read 标签(带空行),再调 probe_read,
// 下一轮纯文本收尾。
// 期望:
//   - 系统提示含「# Progress preamble」段;工具定义里没有 preamble 参数;
//   - Web token 流与 TUI on_delta 都没有标签(空串 —— 标签后的空行也吞掉);
//   - on_thinking_title 收到前言;agent_progress 有 phase=preamble 的帧,label 就是
//     前言且 payload.preamble.kind=read;
//   - tool_start 带 preamble / preamble_source=prompt / preamble_kind=read,
//     tool_running 的 label 是前言;
//   - 落盘的 assistant(tool_calls) 正文保留标签原文,metadata.tool_preamble =
//     {source:prompt, title, kind:read};
//   - 工具步没有 assistant Message 帧(可见正文为空),TUI on_message 也没收到空正文。
TEST(AgentLoopToolPreamble, TextTagBecomesPhasePreambleAndStaysOutOfTranscript) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_tag");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({delta_event(kReadTag), probe_call_event(), done_event()});
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_NE(h.system_prompt_of_turn(0).find("# Progress preamble"), std::string::npos);
    const auto def = h.tool_def_of_turn(0, "probe_read");
    ASSERT_TRUE(def.has_value());
    EXPECT_FALSE(def->parameters["properties"].contains("preamble"));

    EXPECT_EQ(h.streamed_tokens(), "done");
    EXPECT_EQ(h.tui_deltas(), "done");
    EXPECT_EQ(h.thinking_titles(), std::vector<std::string>{"Reading the loader"});

    const auto preamble_frames = h.events_of(SessionEventKind::AgentProgress);
    bool saw_preamble_phase = false;
    for (const auto& e : preamble_frames) {
        if (e.payload.value("phase", std::string{}) != "preamble") continue;
        saw_preamble_phase = true;
        EXPECT_EQ(e.payload.value("label", std::string{}), "Reading the loader");
        ASSERT_TRUE(e.payload.contains("preamble"));
        EXPECT_EQ(e.payload["preamble"].value("kind", std::string{}), "read");
        EXPECT_EQ(e.payload["preamble"].value("source", std::string{}), "prompt");
    }
    EXPECT_TRUE(saw_preamble_phase);

    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_EQ(starts[0].value("preamble", std::string{}), "Reading the loader");
    EXPECT_EQ(starts[0].value("preamble_source", std::string{}), "prompt");
    EXPECT_EQ(starts[0].value("preamble_kind", std::string{}), "read");
    const auto running = h.progress_labels("tool_running");
    ASSERT_FALSE(running.empty());
    EXPECT_EQ(running.front(), "Reading the loader");

    const auto persisted = h.persisted_tool_call_messages();
    ASSERT_EQ(persisted.size(), 1u);
    EXPECT_EQ(persisted[0].content, kReadTag);
    const auto meta = preamble_metadata_of(persisted[0]);
    ASSERT_TRUE(meta.is_object());
    EXPECT_EQ(meta.value("source", std::string{}), "prompt");
    EXPECT_EQ(meta.value("title", std::string{}), "Reading the loader");
    EXPECT_EQ(meta.value("kind", std::string{}), "read");

    for (const auto& frame : h.assistant_message_frames()) {
        EXPECT_EQ(frame.find("text_preamble"), std::string::npos) << frame;
        EXPECT_FALSE(frame.empty());
    }
    EXPECT_EQ(h.tui_assistant_messages(), std::vector<std::string>{"done"});
}

// 场景:标签被 provider 切成任意碎片("<text_pre" / "amble type=\"wri" / …),
// 且模型用的是 write。期望:与整段到达一样 —— 前言 "Editing config",kind=write,
// token 流里没有半截标签,tool_start 带 preamble_kind=write。
TEST(AgentLoopToolPreamble, TextTagSplitAcrossDeltasStillWorks) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_tag_split");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        delta_event("<text_pre"), delta_event("amble type=\"wri"), delta_event("te\">Editing con"),
        delta_event("fig</text_pre"), delta_event("amble>\n\n"),
        probe_call_event(), done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_EQ(h.streamed_tokens(), "done");
    EXPECT_EQ(h.thinking_titles(), std::vector<std::string>{"Editing config"});
    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_EQ(starts[0].value("preamble", std::string{}), "Editing config");
    EXPECT_EQ(starts[0].value("preamble_kind", std::string{}), "write");
}

// 场景:四个模型步 —— A:标签「Phase one」+ 工具;B:只有工具(没写标签);
// C:标签「Phase two」+ 工具;D:普通正文 "Plain narration.\n" + 工具;最后收尾。
// 期望(用户定的规则「前言沿用到下一个正文或下一条前言出现」):
//   - B 的 tool_start 沿用 "Phase one";C 换成 "Phase two";D 因为出现了未加标签的
//     正文,tool_start 没有前言,而那句正文正常进 token 流;
//   - 落盘 metadata 逐步同上;D 的 assistant(tool_calls) 没有 metadata.tool_preamble。
TEST(AgentLoopToolPreamble, PhasePreamblePersistsUntilNextTagOrVisibleText) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_phase");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        delta_event("<text_preamble type=\"read\">Phase one</text_preamble>\n\n"),
        probe_call_event("call-a"), done_event(),
    });
    h.provider().push_events({probe_call_event("call-b"), done_event()});
    h.provider().push_events({
        delta_event("<text_preamble type=\"read\">Phase two</text_preamble>\n\n"),
        probe_call_event("call-c"), done_event(),
    });
    h.provider().push_events({
        delta_event("Plain narration.\n"), probe_call_event("call-d"), done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 4u);
    EXPECT_EQ(starts[0].value("preamble", std::string{}), "Phase one");
    EXPECT_EQ(starts[1].value("preamble", std::string{}), "Phase one");
    EXPECT_EQ(starts[2].value("preamble", std::string{}), "Phase two");
    EXPECT_EQ(starts[3].value("preamble", std::string{}), "");
    EXPECT_EQ(h.thinking_titles(), (std::vector<std::string>{"Phase one", "Phase two"}));
    EXPECT_EQ(h.streamed_tokens(), "Plain narration.\ndone");

    // 批次之间等待模型的那一帧也要显示前言:五次模型调用各发一条 model_waiting,
    // 第 1 次还没有前言、第 5 次已被 "Plain narration." 清掉,只有它们是通用文案;
    // 中间三次的 label 是当时的阶段前言,通用文案退到 detail。回归:实测会话
    // 20260925-013722-4299 里 Web 实时行曾在「前言 → 正在等待模型响应 → 前言」之间闪动。
    EXPECT_EQ(h.progress_labels("model_waiting"),
              (std::vector<std::string>{"正在等待模型响应", "Phase one", "Phase one",
                                        "Phase two", "正在等待模型响应"}));
    EXPECT_EQ(h.progress_details("model_waiting"),
              (std::vector<std::string>{"", "正在等待模型响应", "正在等待模型响应",
                                        "正在等待模型响应", ""}));

    const auto persisted = h.persisted_tool_call_messages();
    ASSERT_EQ(persisted.size(), 4u);
    EXPECT_EQ(preamble_metadata_of(persisted[0]).value("title", std::string{}), "Phase one");
    EXPECT_EQ(preamble_metadata_of(persisted[1]).value("title", std::string{}), "Phase one");
    EXPECT_EQ(preamble_metadata_of(persisted[2]).value("title", std::string{}), "Phase two");
    EXPECT_TRUE(preamble_metadata_of(persisted[3]).is_null());
    EXPECT_EQ(persisted[3].content, "Plain narration.\n");
}

// 场景:模型违规给最终回答也打了标签:"<text_preamble>x</text_preamble>\n\nAll done."。
// 期望:落盘正文保留原文;Web Message 帧与 token 流、TUI on_message 都只有 "All done."。
TEST(AgentLoopToolPreamble, TaggedFinalAnswerIsStrippedForDisplayOnly) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_final");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_text("<text_preamble>x</text_preamble>\n\nAll done.");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_EQ(h.streamed_tokens(), "All done.");
    EXPECT_EQ(h.assistant_message_frames(), std::vector<std::string>{"All done."});
    EXPECT_EQ(h.tui_assistant_messages(), std::vector<std::string>{"All done."});
    const auto persisted = h.persisted_assistant_text_messages();
    ASSERT_EQ(persisted.size(), 1u);
    EXPECT_EQ(persisted[0].content, "<text_preamble>x</text_preamble>\n\nAll done.");
}

// 场景:prompt 模式,标签之后调的是写工具(probe_write,顺序执行路径)。
// 期望:TUI 进度头回调 on_tool_progress_start 的第三参拿到前言。
TEST(AgentLoopToolPreamble, WriteToolPreambleReachesTuiProgressHeader) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_write");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(true, "prompt");
    h.provider().push_events({
        delta_event("<text_preamble type=\"write\">Writing the loader</text_preamble>\n"),
        call_event("probe_write", R"({"file_path":"a"})", "call-1"), done_event(),
    });
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_EQ(h.progress_preambles(), std::vector<std::string>{"Writing the loader"});
    const auto received = h.received_args();
    ASSERT_EQ(received.size(), 1u);
    EXPECT_EQ(nlohmann::json::parse(received[0]), nlohmann::json({{"file_path", "a"}}));
}

// 场景:reasoning 模式,provider 先流回摘要 "**Reading registry sections**\n\n…",
// 再给一个 probe_read 调用,下一轮纯文本收尾。
// 期望:agent_progress 的 reasoning label 至少有一条等于标题;on_thinking_title 收到
// 标题;tool_start 带 preamble / preamble_source=reasoning;落盘 metadata 一致。
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
    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_EQ(starts[0].value("preamble", std::string{}), "Reading registry sections");
    EXPECT_EQ(starts[0].value("preamble_source", std::string{}), "reasoning");
    const auto persisted = h.persisted_tool_call_messages();
    ASSERT_EQ(persisted.size(), 1u);
    const auto meta = preamble_metadata_of(persisted[0]);
    ASSERT_TRUE(meta.is_object());
    EXPECT_EQ(meta.value("title", std::string{}), "Reading registry sections");
    EXPECT_EQ(meta.value("source", std::string{}), "reasoning");
}

// 场景:reasoning 模式,但推理是 DeepSeek 式原始思维链,没有加粗:
// "Okay, I need to inspect the loader first. Then compare..."。
// 期望:标题 = 去掉 "Okay, " / "I need to " 后的首句 "inspect the loader first";
// 流式期间没有加粗所以 reasoning label 仍是「正在推理」(标题只在落盘前兜底)。
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
    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_EQ(starts[0].value("preamble", std::string{}), "inspect the loader first");
    const auto persisted = h.persisted_tool_call_messages();
    ASSERT_EQ(persisted.size(), 1u);
    EXPECT_EQ(preamble_metadata_of(persisted[0]).value("title", std::string{}),
              "inspect the loader first");
}

// 场景:功能关闭,模型却照着历史习惯打了标签。期望:不发布任何前言(没有
// thinking title、tool_start 没有 preamble、没有 metadata、系统提示没有该段),
// 但标签仍不会露到 token 流与 Message 帧上;落盘正文保留原文。
TEST(AgentLoopToolPreamble, DisabledPublishesNothingButStillHidesTags) {
    const auto cwd = make_temp_dir("acecode_tool_preamble_disabled");
    ProjectDirCleanup cleanup{acecode::SessionStorage::get_project_dir(cwd.string())};
    ToolPreambleHarness h(cwd.string());
    h.configure(false, "prompt");
    h.provider().push_events({delta_event(kReadTag), probe_call_event(), done_event()});
    h.provider().push_text("done");
    ASSERT_TRUE(h.submit_and_wait());

    EXPECT_EQ(h.system_prompt_of_turn(0).find("# Progress preamble"), std::string::npos);
    EXPECT_TRUE(h.thinking_titles().empty());
    EXPECT_TRUE(h.progress_labels("preamble").empty());
    const auto starts = h.tool_starts();
    ASSERT_EQ(starts.size(), 1u);
    EXPECT_FALSE(starts[0].contains("preamble"));
    EXPECT_EQ(h.streamed_tokens(), "done");
    const auto persisted = h.persisted_tool_call_messages();
    ASSERT_EQ(persisted.size(), 1u);
    EXPECT_EQ(persisted[0].content, kReadTag);
    EXPECT_TRUE(preamble_metadata_of(persisted[0]).is_null());
}
