// OpenAiCompatProvider 接入文本形式工具调用恢复(fix-feedback-0924 第 3 条)的
// 本地 SSE 集成测试。
//
// 现场:yubo2 会话(dots3-note-prev,OpenAI 兼容接口)里模型把工具调用写进正文
// (`<invoke name="Bash">`、`<dots_function_call>` 外壳、不存在的 `exec`),
// provider 返回 tool_calls=0,AgentLoop 走 `Text-only response; ending loop`
// 静默结束回合。这里守护 provider 这一层:标记在 provider 内部扣住、不流到界面;
// 执行级认出的调用以原生 ToolCall 发出;认不出 / 不能执行的经 Done 事件与
// ChatResponse::text_tool_calls 上报诊断,交给 AgentLoop 纠正。
// 写法沿用 openai_provider_dsml_recovery_test.cpp 的 LocalHttpServer + SSE。

#include <gtest/gtest.h>

#include "provider/openai_provider.hpp"

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <functional>
#include <string>
#include <thread>
#include <vector>

namespace {

using namespace std::chrono_literals;
using acecode::ChatMessage;
using acecode::OpenAiCompatProvider;
using acecode::ProviderErrorKind;
using acecode::StreamEvent;
using acecode::StreamEventType;
using acecode::TextToolCallDiagnostic;
using acecode::ToolCall;
using acecode::ToolDef;
using Outcome = acecode::TextToolCallDiagnostic::Outcome;

struct LocalHttpServer {
    httplib::Server server;
    int port = 0;
    std::thread thread;

    explicit LocalHttpServer(std::function<void(httplib::Server&)> setup) {
        setup(server);
        port = server.bind_to_any_port("127.0.0.1");
        thread = std::thread([this] { server.listen_after_bind(); });
        for (int i = 0; i < 50 && !server.is_running(); ++i) {
            std::this_thread::sleep_for(10ms);
        }
    }

    ~LocalHttpServer() {
        server.stop();
        if (thread.joinable()) thread.join();
    }
};

ToolDef make_tool(std::string name, nlohmann::json properties) {
    ToolDef tool;
    tool.name = std::move(name);
    tool.description = "test tool";
    tool.parameters = {
        {"type", "object"},
        {"properties", std::move(properties)},
    };
    return tool;
}

std::vector<ToolDef> test_tools() {
    return {
        make_tool("bash", {{"command", {{"type", "string"}}},
                           {"timeout_ms", {{"type", "integer"}}}}),
        make_tool("file_read", {{"file_path", {{"type", "string"}}}}),
    };
}

ChatMessage user_message() {
    ChatMessage message;
    message.role = "user";
    message.content = "inspect";
    return message;
}

// 现场形态:参数值两侧各带一个换行。
std::string bash_invoke(const std::string& name, const std::string& command) {
    return "<invoke name=\"" + name + "\">\n<parameter name=\"command\">\n" +
           command + "\n</parameter>\n</invoke>";
}

std::string content_event(const std::string& content) {
    nlohmann::json choice = {{"delta", {{"content", content}}}};
    return "data: " + nlohmann::json({{"choices", {choice}}}).dump() + "\n\n";
}

std::string finish_event(const std::string& finish_reason) {
    nlohmann::json payload = {
        {"choices", {{{"delta", nlohmann::json::object()},
                       {"finish_reason", finish_reason}}}},
    };
    return "data: " + payload.dump() + "\n\n";
}

std::string native_call_event(const std::string& id, const std::string& name,
                              const std::string& arguments) {
    nlohmann::json payload = {
        {"choices", {{{"delta", {{"tool_calls", {{{"index", 0},
                                                      {"id", id},
                                                      {"type", "function"},
                                                      {"function", {
                                                          {"name", name},
                                                          {"arguments", arguments},
                                                      }}}}}}}}}},
    };
    return "data: " + payload.dump() + "\n\n";
}

std::string sse_body(const std::vector<std::string>& chunks,
                     const std::string& finish_reason = "stop",
                     const std::string& extra_events = {}) {
    std::string body;
    for (const auto& chunk : chunks) body += content_event(chunk);
    body += extra_events;
    body += finish_event(finish_reason);
    body += "data: [DONE]\n\n";
    return body;
}

LocalHttpServer sse_server(std::string body) {
    return LocalHttpServer([body](httplib::Server& http) {
        http.Post("/chat/completions", [body](const httplib::Request&,
                                               httplib::Response& response) {
            response.set_content(body, "text/event-stream");
            response.status = 200;
        });
    });
}

struct Collected {
    std::string visible;
    std::vector<ToolCall> calls;
    std::vector<int> call_indexes;
    std::vector<StreamEvent> hold_events;
    int done_count = 0;
    std::string done_reason;
    TextToolCallDiagnostic done_diag;
    std::vector<StreamEvent> errors;
    // 第一个 ToolCall 到达前已收到的扣住进度事件数。
    int holds_before_first_call = -1;
};

Collected run_stream(int port, const std::vector<ToolDef>& tools,
                     std::atomic<bool>* abort_flag = nullptr,
                     std::function<void(const StreamEvent&)> hook = {}) {
    OpenAiCompatProvider provider(
        "http://127.0.0.1:" + std::to_string(port), "", "test-model");
    Collected out;
    auto callback = [&](const StreamEvent& event) {
        if (hook) hook(event);
        switch (event.type) {
        case StreamEventType::Delta:
            out.visible += event.content;
            break;
        case StreamEventType::ToolCall:
            if (out.holds_before_first_call < 0) {
                out.holds_before_first_call =
                    static_cast<int>(out.hold_events.size());
            }
            out.calls.push_back(event.tool_call);
            out.call_indexes.push_back(event.tool_index);
            break;
        case StreamEventType::ToolCallDelta:
            if (event.text_tool_call_hold) out.hold_events.push_back(event);
            break;
        case StreamEventType::Done:
            ++out.done_count;
            out.done_reason = event.finish_reason;
            out.done_diag = event.text_tool_calls;
            break;
        case StreamEventType::Error:
            out.errors.push_back(event);
            break;
        default:
            break;
        }
    };
    provider.chat_stream({user_message()}, tools, callback, abort_flag);
    return out;
}

} // namespace

// 触发场景:yubo2 第 1760 行形态("\n\n\n" + 裸 `<invoke name="Bash">`),且标记被
//   SSE 切成几段、开标签本身跨 chunk(`<inv` | `oke name=…`)。
// 期望行为:界面只收到块前的空白,永远看不到半截 `<invoke`;Done 前以原生形态发出
//   1 个 bash 调用(tool_index=0,id 为 call_text_ 前缀),finish_reason=tool_calls,
//   Done 事件带 Recovered 诊断。
// 回归:旧实现 provider 把整段标记当正文流出,tool_calls=0,回合静默结束。
TEST(OpenAiProviderTextToolCallRecoveryTest, StreamingRecoversSplitInvokeWithoutVisibleMarkup) {
    auto server = sse_server(sse_body({
        "\n\n\n<inv",
        "oke name=\"Bash\">\n<parameter name=\"comm",
        "and\">\nls -la\n</param",
        "eter>\n</invoke>",
    }));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible, "\n\n\n");
    EXPECT_EQ(out.visible.find('<'), std::string::npos);
    ASSERT_EQ(out.calls.size(), 1u);
    EXPECT_EQ(out.calls[0].function_name, "bash");
    EXPECT_EQ(out.calls[0].id.rfind("call_text_", 0), 0u);
    EXPECT_EQ(nlohmann::json::parse(out.calls[0].function_arguments),
              nlohmann::json({{"command", "ls -la"}}));
    EXPECT_EQ(out.call_indexes, std::vector<int>({0}));
    EXPECT_EQ(out.done_count, 1);
    EXPECT_EQ(out.done_reason, "tool_calls");
    EXPECT_EQ(out.done_diag.outcome, Outcome::Recovered);
    EXPECT_EQ(out.done_diag.format, "invoke");
    EXPECT_EQ(out.done_diag.recovered_count, 1);
}

// 触发场景:yubo2 第 1416 行形态 —— `<invoke name="exec">`,exec 不是任何已注册工具。
// 期望行为:不执行、标记不外流(可见正文只剩块前空白);Done 带 Rejected 诊断,
//   reason=unknown_tool,attempted_tools 记下模型写的原名 exec,finish_reason 保持 stop。
// 回归:旧实现标记原样流出、回合静默结束,模型以为命令跑过了。
TEST(OpenAiProviderTextToolCallRecoveryTest, StreamingRejectedCallReportsDiagnosticOnDone) {
    auto server = sse_server(sse_body({"\n\n", bash_invoke("exec", "dir")}));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible, "\n\n");
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_reason, "stop");
    EXPECT_EQ(out.done_diag.outcome, Outcome::Rejected);
    EXPECT_EQ(out.done_diag.reason, "unknown_tool");
    EXPECT_NE(out.done_diag.error.find("exec"), std::string::npos) << out.done_diag.error;
    ASSERT_EQ(out.done_diag.attempted_tools.size(), 1u);
    EXPECT_EQ(out.done_diag.attempted_tools[0], "exec");
    EXPECT_NE(out.done_diag.raw_excerpt.find("<invoke"), std::string::npos);
}

// 触发场景:yubo2 第 1758 行形态 —— 同一回复里既有原生 file_read 调用,又在正文里
//   写了一个**不同**的 `<invoke name="Bash">`。
// 期望行为:只发出原生调用;文本调用不执行、不外流;Done 带 IgnoredWithNative,
//   unexecuted_detail 为 "bash(command)"(只带参数键名,不带参数值)。
// 回归:旧实现原生调用执行了,Bash 没执行,模型却以为执行了。
TEST(OpenAiProviderTextToolCallRecoveryTest, NativeCallWithDifferentTextCallReportsIgnored) {
    auto server = sse_server(sse_body(
        {"\n", bash_invoke("Bash", "git status")}, "tool_calls",
        native_call_event("call_native", "file_read", R"({"file_path":"a.txt"})")));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible.find('<'), std::string::npos);
    ASSERT_EQ(out.calls.size(), 1u);
    EXPECT_EQ(out.calls[0].id, "call_native");
    EXPECT_EQ(out.calls[0].function_name, "file_read");
    EXPECT_EQ(out.done_diag.outcome, Outcome::IgnoredWithNative);
    EXPECT_EQ(out.done_diag.unexecuted_detail,
              std::vector<std::string>({"bash(command)"}));
    EXPECT_EQ(out.done_diag.attempted_tools, std::vector<std::string>({"bash"}));
}

// 触发场景:Qwen / Hermes 模板把原生调用在正文里原样回显一遍(名字大小写不同、
//   参数相同)。
// 期望行为:只发出原生调用,诊断为 None —— 回显不能被当成「未执行的调用」提示给
//   模型,否则会诱导它把同一个调用(可能是 rm / mv)再发一次。
TEST(OpenAiProviderTextToolCallRecoveryTest, NativeCallEchoedInTextIsNotReported) {
    auto server = sse_server(sse_body(
        {bash_invoke("Bash", "ls")}, "tool_calls",
        native_call_event("call_native", "bash", R"({"command":"ls"})")));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible.find('<'), std::string::npos);
    ASSERT_EQ(out.calls.size(), 1u);
    EXPECT_EQ(out.calls[0].id, "call_native");
    EXPECT_EQ(out.done_diag.outcome, Outcome::None);
}

// 触发场景:非流式 chat() 收到 `<dots_function_call>` 外壳的文本调用(第 1745 行形态)。
// 期望行为:与流式同语义 —— content 只剩块前空白,tool_calls 为恢复出的原生形态调用,
//   finish_reason=tool_calls,ChatResponse::text_tool_calls 为 Recovered。
TEST(OpenAiProviderTextToolCallRecoveryTest, NonStreamingRecoversWithSameSemantics) {
    const std::string content = "\n\n<dots_function_call>\n" +
                                bash_invoke("bash", "Get-ChildItem") +
                                "\n</dots_function_call>";
    LocalHttpServer server([content](httplib::Server& http) {
        http.Post("/chat/completions", [content](const httplib::Request&,
                                                  httplib::Response& response) {
            nlohmann::json payload = {
                {"choices", {{{"message", {{"role", "assistant"},
                                             {"content", content}}},
                               {"finish_reason", "stop"}}}},
            };
            response.set_content(payload.dump(), "application/json");
            response.status = 200;
        });
    });

    OpenAiCompatProvider provider(
        "http://127.0.0.1:" + std::to_string(server.port), "", "test-model");
    const auto response = provider.chat({user_message()}, test_tools());

    EXPECT_EQ(response.content, "\n\n");
    ASSERT_EQ(response.tool_calls.size(), 1u);
    EXPECT_EQ(response.tool_calls[0].function_name, "bash");
    EXPECT_EQ(nlohmann::json::parse(response.tool_calls[0].function_arguments),
              nlohmann::json({{"command", "Get-ChildItem"}}));
    EXPECT_EQ(response.finish_reason, "tool_calls");
    EXPECT_EQ(response.text_tool_calls.outcome, Outcome::Recovered);
    EXPECT_EQ(response.text_tool_calls.format, "dots_function_call");
}

// 触发场景:请求不带工具(压缩摘要、标题生成、旁路提问都是这样),模型却写了文本调用。
// 期望行为:不构造过滤器,标记原样透传(流式与非流式都是),不产生调用,诊断为 None。
//   压缩摘要校验依赖这一点:它要看到原文才能判定「摘要被工具调用污染」并重试。
TEST(OpenAiProviderTextToolCallRecoveryTest, RequestWithoutToolsPassesMarkupThrough) {
    const std::string markup = "<dots_function_call>\n" + bash_invoke("Bash", "ls") +
                               "\n</dots_function_call>";
    LocalHttpServer server([markup](httplib::Server& http) {
        http.Post("/chat/completions", [markup](const httplib::Request& request,
                                                 httplib::Response& response) {
            const auto body = nlohmann::json::parse(request.body);
            if (body.value("stream", false)) {
                response.set_content(sse_body({markup}), "text/event-stream");
            } else {
                nlohmann::json payload = {
                    {"choices", {{{"message", {{"role", "assistant"},
                                                 {"content", markup}}},
                                   {"finish_reason", "stop"}}}},
                };
                response.set_content(payload.dump(), "application/json");
            }
            response.status = 200;
        });
    });

    const auto out = run_stream(server.port, {});
    EXPECT_EQ(out.visible, markup);
    EXPECT_TRUE(out.calls.empty());
    EXPECT_TRUE(out.hold_events.empty());
    EXPECT_EQ(out.done_diag.outcome, Outcome::None);

    OpenAiCompatProvider provider(
        "http://127.0.0.1:" + std::to_string(server.port), "", "test-model");
    const auto response = provider.chat({user_message()}, {});
    EXPECT_EQ(response.content, markup);
    EXPECT_TRUE(response.tool_calls.empty());
    EXPECT_EQ(response.text_tool_calls.outcome, Outcome::None);
}

// 触发场景:模型用文本调用写一个很长的参数(约 2KB,分 100 字节一段流过来),
//   provider 扣住期间界面收不到任何 Delta。
// 期望行为:刚进入扣住态就发一个 ToolCallDelta(text_tool_call_hold=true,
//   tool_index=-1,不带工具名),之后扣住字节每增长 >=512 再发一个,字节数单调递增;
//   这些进度事件都在恢复出的 ToolCall 之前。512 是为了既让界面看得出在动,又不在
//   几百 KB 的 file_write 参数上每个 chunk 发一次。
TEST(OpenAiProviderTextToolCallRecoveryTest, EmitsHoldProgressDeltaWhileHoldingCandidate) {
    const std::string input = bash_invoke("bash", "echo " + std::string(2000, 'a'));
    std::vector<std::string> chunks;
    for (std::size_t i = 0; i < input.size(); i += 100) {
        chunks.push_back(input.substr(i, 100));
    }
    auto server = sse_server(sse_body(chunks));

    const auto out = run_stream(server.port, test_tools());

    ASSERT_EQ(out.calls.size(), 1u);
    EXPECT_EQ(out.visible, "");
    ASSERT_GE(out.hold_events.size(), 4u);
    EXPECT_EQ(out.holds_before_first_call,
              static_cast<int>(out.hold_events.size()));
    EXPECT_LE(out.hold_events.front().tool_call_argument_bytes, 100u);
    for (std::size_t i = 0; i < out.hold_events.size(); ++i) {
        const auto& evt = out.hold_events[i];
        EXPECT_EQ(evt.tool_index, -1);
        EXPECT_TRUE(evt.tool_call.function_name.empty());
        if (i > 0) {
            EXPECT_GE(evt.tool_call_argument_bytes,
                      out.hold_events[i - 1].tool_call_argument_bytes + 512);
        }
    }
}

// 触发场景:行首的完整调用块后面还跟着正文(模型在讲解一段 XML 示例)。
// 期望行为:块后出现非空白正文 → 执行级不成立,整段按原文释放给界面(不吞字),
//   不执行任何调用。标记在围栏外,可疑级仍会命中 → Rejected/malformed,
//   visible_cut 指向块所在行行首,由 AgentLoop 走一次纠正(误判代价 = 多一次请求,
//   纠正文案会让模型把示例放进代码围栏)。
TEST(OpenAiProviderTextToolCallRecoveryTest, ProseAfterBlockIsReleasedAsText) {
    const std::string prefix = "\n";
    const std::string input =
        prefix + bash_invoke("bash", "ls") + "\nThat is how the XML looks.";
    auto server = sse_server(sse_body({input.substr(0, 20), input.substr(20)}));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible, input);
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_reason, "stop");
    EXPECT_EQ(out.done_diag.outcome, Outcome::Rejected);
    EXPECT_EQ(out.done_diag.reason, "malformed");
    EXPECT_EQ(out.done_diag.visible_cut, prefix.size());
}

// 触发场景:模型在一行正文中间写调用("Let me run <invoke name=…>"),执行级
//   只认行首开标签,所以这段已经作为正文流到了界面。
// 期望行为:不执行;Done 带 Rejected/malformed 诊断,visible_cut 指向该行行首
//   (AgentLoop 据此把落盘内容截成前面那句中文),可见正文就是已发出的原文。
TEST(OpenAiProviderTextToolCallRecoveryTest, MidLineInvokeIsReportedAsSuspicious) {
    const std::string first_line = u8"好的,我来看看。\n";
    const std::string input = first_line +
                              "Let me run <invoke name=\"bash\">\n"
                              "<parameter name=\"command\">ls</parameter>\n</invoke>";
    auto server = sse_server(sse_body({input}));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible, input);
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_diag.outcome, Outcome::Rejected);
    EXPECT_EQ(out.done_diag.reason, "malformed");
    EXPECT_EQ(out.done_diag.format, "invoke");
    EXPECT_EQ(out.done_diag.visible_cut, first_line.size());
}

// 触发场景:DeepSeek DSML 协议被网关漏到正文,且内容解析失败(调用了不存在的工具)。
// 期望行为:DSML 标记照旧被藏起来、不执行;新增的是 Done 上报
//   Rejected{format=dsml, reason=parse_error, error=DSML 的错误},让 AgentLoop 纠正。
// 回归:旧实现标记藏起来后内容为空,回合静默结束,用户什么都看不到。
TEST(OpenAiProviderTextToolCallRecoveryTest, DsmlParseFailureIsReportedAsRejected) {
    auto server = sse_server(sse_body({
        u8"<｜DSML｜tool_calls><｜DSML｜invoke name=\"unknown\">"
        u8"</｜DSML｜invoke></｜DSML｜tool_calls>",
    }));

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(out.visible.find(u8"<｜DSML｜"), std::string::npos);
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_diag.outcome, Outcome::Rejected);
    EXPECT_EQ(out.done_diag.format, "dsml");
    EXPECT_EQ(out.done_diag.reason, "parse_error");
    EXPECT_FALSE(out.done_diag.error.empty());
}

// 触发场景:provider 正扣住一段文本调用(参数还没写完)时用户点了停止。
// 期望行为:扣住的标记不作为 Delta 流出(只写日志),不发出 ToolCall,
//   以 UserCancelled 错误结束。被中断的调用没执行,若写进 interrupted_output
//   就会在历史里留下一个供模型模仿的文本调用样本。
TEST(OpenAiProviderTextToolCallRecoveryTest, AbortWhileHoldingDoesNotLeakMarkup) {
    std::atomic<bool> finished_serving{false};
    LocalHttpServer server([&](httplib::Server& http) {
        http.Post("/chat/completions", [&](const httplib::Request&,
                                            httplib::Response& response) {
            response.status = 200;
            response.set_chunked_content_provider(
                "text/event-stream",
                [&, step = 0](size_t, httplib::DataSink& sink) mutable {
                    if (step == 0) {
                        const std::string head = content_event(
                            "\n\n<invoke name=\"bash\">\n<parameter name=\"command\">\nrm");
                        sink.write(head.data(), head.size());
                    } else {
                        // 保活注释:让客户端的写回调有机会看到 abort 并取消请求。
                        const std::string keepalive = ": keepalive\n\n";
                        if (!sink.write(keepalive.data(), keepalive.size())) {
                            finished_serving = true;
                            return false;
                        }
                    }
                    ++step;
                    std::this_thread::sleep_for(20ms);
                    if (step > 250) {
                        finished_serving = true;
                        sink.done();
                        return false;
                    }
                    return true;
                });
        });
    });

    std::atomic<bool> abort_flag{false};
    const auto out = run_stream(server.port, test_tools(), &abort_flag,
                                [&](const StreamEvent& event) {
                                    if (event.type == StreamEventType::ToolCallDelta &&
                                        event.text_tool_call_hold) {
                                        abort_flag = true;
                                    }
                                });

    ASSERT_FALSE(out.hold_events.empty());
    EXPECT_EQ(out.visible, "\n\n");
    EXPECT_EQ(out.visible.find('<'), std::string::npos);
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_count, 0);
    ASSERT_FALSE(out.errors.empty());
    EXPECT_EQ(out.errors.back().provider_error.kind, ProviderErrorKind::UserCancelled);
}

// 触发场景:第一次尝试流到一半(正扣住文本调用)连接断开、[DONE] 没来,provider 自动
//   重试;第二次尝试是普通正文。
// 期望行为:过滤器每次尝试新建,上一次扣住的半截调用不会与第二次的正文拼在一起,
//   不发出任何调用,诊断为 None。
TEST(OpenAiProviderTextToolCallRecoveryTest, RetryDoesNotJoinCandidateAcrossAttempts) {
    std::atomic<int> requests{0};
    LocalHttpServer server([&](httplib::Server& http) {
        http.Post("/chat/completions", [&](const httplib::Request&,
                                            httplib::Response& response) {
            const int request = ++requests;
            if (request == 1) {
                response.set_header("Retry-After", "0");
                response.set_content(
                    content_event("<invoke name=\"bash\">\n<parameter name=\"comm"),
                    "text/event-stream");
                response.status = 200;
                return;
            }
            response.set_content(sse_body({"normal after retry"}),
                                 "text/event-stream");
            response.status = 200;
        });
    });

    const auto out = run_stream(server.port, test_tools());

    EXPECT_EQ(requests.load(), 2);
    EXPECT_EQ(out.visible, "normal after retry");
    EXPECT_TRUE(out.calls.empty());
    EXPECT_EQ(out.done_diag.outcome, Outcome::None);
}
