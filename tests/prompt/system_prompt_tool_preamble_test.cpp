// 覆盖 build_system_prompt 的 prompt_tool_preamble 开关(openspec add-tool-preamble):
//   1. 关闭(默认)→ 与改动前逐字节一致
//   2. 开启 → 追加「# Progress preamble」段,要求模型在多步工具任务里用
//      <text_preamble type="read|write"> 标签标出阶段前言(用户原话的那句规则),
//      「不要叙述工具调用 / 批量调用」的既有口径原样保留;工具定义不再注入参数
//      (参数版被用户否掉:强迫模型每次调用都填一句体验很差)
//   3. 同一输入两次调用逐字节一致(prompt cache 前缀不变量)

#include <gtest/gtest.h>

#include "prompt/system_prompt.hpp"
#include "tool/tool_executor.hpp"

#include <cstdlib>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

namespace {

#ifdef _WIN32
constexpr const char* kHomeEnvName = "USERPROFILE";
#else
constexpr const char* kHomeEnvName = "HOME";
#endif

void set_env(const char* n, const std::string& v) {
#ifdef _WIN32
    _putenv_s(n, v.c_str());
#else
    setenv(n, v.c_str(), 1);
#endif
}

// 与 system_prompt_test.cpp 同款的临时 HOME:cwd 会进 # Environment,不能碰
// 用户真实目录。
class SystemPromptToolPreambleTest : public ::testing::Test {
protected:
    fs::path temp_home;
    std::string prev_home;

    void SetUp() override {
        const char* e = std::getenv(kHomeEnvName);
        prev_home = e ? e : "";
        temp_home = fs::temp_directory_path() /
                    fs::path("acecode-sysprompt-preamble-" +
                             std::to_string(reinterpret_cast<std::uintptr_t>(this)));
        std::error_code ec;
        fs::remove_all(temp_home, ec);
        fs::create_directories(temp_home);
        set_env(kHomeEnvName, temp_home.string());
    }
    void TearDown() override {
        std::error_code ec;
        fs::remove_all(temp_home, ec);
        set_env(kHomeEnvName, prev_home);
    }

    std::string build(bool prompt_tool_preamble) {
        acecode::ToolExecutor tools;
        return acecode::build_system_prompt(
            tools, temp_home.string(), nullptr, nullptr, nullptr, nullptr,
            nullptr, nullptr, true, nullptr, nullptr, nullptr,
            prompt_tool_preamble);
    }
};

} // namespace

// 场景:开关关闭(默认参数)与显式传 false。期望:两者逐字节一致,且没有前言段。
TEST_F(SystemPromptToolPreambleTest, DisabledIsByteIdenticalToLegacyPrompt) {
    acecode::ToolExecutor tools;
    const std::string legacy = acecode::build_system_prompt(tools, temp_home.string());
    const std::string off = build(false);
    EXPECT_EQ(legacy, off);
    EXPECT_NE(off.find("Do not narrate every tool call"), std::string::npos);
    EXPECT_EQ(off.find("# Progress preamble"), std::string::npos);
    EXPECT_EQ(off.find("text_preamble"), std::string::npos);
}

// 场景:开关打开。期望:多出「# Progress preamble」段,含用户定下的那句规则
// (第一次调用前 + 阶段变化时、type=read|write、最终回答不打标签)与语言 / 单行
// 约束;「Using your tools」里的批量调用口径原样保留 —— 标签替代的是进度提示,
// 不是批处理;「别把结论塞进中途消息」这条与标签无关,也保留。
TEST_F(SystemPromptToolPreambleTest, EnabledAddsTextPreambleGuidanceAndKeepsLegacyRules) {
    const std::string on = build(true);
    EXPECT_NE(on.find("# Progress preamble"), std::string::npos);
    EXPECT_NE(on.find("emit exactly one short sentence in <text_preamble type=\"read\">...</text_preamble>"),
              std::string::npos);
    EXPECT_NE(on.find("use type=\"write\" for state-changing actions"), std::string::npos);
    EXPECT_NE(on.find("before the first call and at major phase/plan changes"), std::string::npos);
    EXPECT_NE(on.find("never tag final answers"), std::string::npos);
    EXPECT_NE(on.find("language of the user's latest message"), std::string::npos);
    EXPECT_NE(on.find("batch independent calls in one message"), std::string::npos);
    EXPECT_NE(on.find("batch them in the same assistant message"), std::string::npos);
    EXPECT_NE(on.find("Do NOT put conclusions, explanations, reasoning, lists of changes"),
              std::string::npos);
    // 参数版的措辞不能再出现:工具定义里没有 preamble 参数了。
    EXPECT_EQ(on.find("`preamble` argument"), std::string::npos);
    EXPECT_EQ(on.find("# Tool call preamble"), std::string::npos);
}

// 场景:开关打开时,2026-06-14 加入的「Sharing progress updates」一节整节不出 ——
// 它教模型在工具调用之间写 10 词以内的裸文本进度句,Good 示例本身就是裸文本。
// 回归:grok-4.7 在用户会话 20260925-031619-1f93 里 20 步全部照着那些示例写裸文本
// 进度句、零标签,带示例的一节压过了只讲规则的标签要求。期望:开启时没有该节标题
// 与裸文本示例,示例改为带标签的形态并明说裸文本是错误;关闭时该节仍在(与旧提示
// 逐字节一致,由 DisabledIsByteIdenticalToLegacyPrompt 守着)。
TEST_F(SystemPromptToolPreambleTest, EnabledDropsPlainTextProgressSection) {
    const std::string on = build(true);
    EXPECT_EQ(on.find("# Sharing progress updates"), std::string::npos);
    EXPECT_EQ(on.find("Good: \"Checking the test results.\""), std::string::npos);
    EXPECT_EQ(on.find("Keep progress updates **extremely short**"), std::string::npos);
    // Good 示例按用户定的规则示范:第一次调用前写下一步(read),阶段变化时写
    // 已验证的结果 + 下一步(write);Bad 示例是裸文本进度句。
    EXPECT_NE(on.find("Good (before the first call, next step): <text_preamble type=\"read\">"),
              std::string::npos);
    EXPECT_NE(on.find("Good (at a phase change, verified result + next step): <text_preamble type=\"write\">"),
              std::string::npos);
    EXPECT_NE(on.find("Bad:  \"Reading the loader now.\" as plain text before a tool call"),
              std::string::npos);
    EXPECT_NE(on.find("This tag is the only form of progress update"), std::string::npos);

    const std::string off = build(false);
    EXPECT_NE(off.find("# Sharing progress updates"), std::string::npos);
    EXPECT_NE(off.find("Good: \"Checking the test results.\""), std::string::npos);
    EXPECT_EQ(off.find("<text_preamble"), std::string::npos);
}

// 场景:开关打开,同一输入连续构造两次。期望:逐字节一致(段落里没有时间戳 /
// 随机内容,不打穿 prompt cache 前缀)。
TEST_F(SystemPromptToolPreambleTest, EnabledPromptIsByteStableAcrossCalls) {
    EXPECT_EQ(build(true), build(true));
    EXPECT_NE(build(true), build(false));
}
