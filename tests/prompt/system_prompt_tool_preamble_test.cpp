// 覆盖 build_system_prompt 的 prompt_tool_preamble 开关(openspec add-tool-preamble):
//   1. 关闭(默认)→ 与改动前逐字节一致
//   2. 开启 → 追加「# Tool call preamble」段,要求模型填每个调用的 `preamble` 参数;
//      「不要叙述工具调用 / 批量调用」的既有口径原样保留 —— 前言在参数里,
//      不是调用前的一句话(第一版做成先说一句话,文本先变气泡再搬进 loading,已废)
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
    EXPECT_EQ(off.find("# Tool call preamble"), std::string::npos);
}

// 场景:开关打开。期望:多出「# Tool call preamble」段(参数名 `preamble`、8-12 词、
// 放在参数第一位、执行前剥掉),同时「不要叙述工具调用」「批量调用」的口径原样
// 保留 —— 前言替代的是叙述文本,不是批处理。
TEST_F(SystemPromptToolPreambleTest, EnabledAddsParameterGuidanceAndKeepsLegacyRules) {
    const std::string on = build(true);
    EXPECT_NE(on.find("# Tool call preamble"), std::string::npos);
    EXPECT_NE(on.find("Every tool accepts an extra `preamble` argument"), std::string::npos);
    EXPECT_NE(on.find("8-12 words"), std::string::npos);
    EXPECT_NE(on.find("Put `preamble` first in the arguments"), std::string::npos);
    EXPECT_NE(on.find("stripped before the tool executes"), std::string::npos);
    EXPECT_NE(on.find("Do not narrate every tool call"), std::string::npos);
    EXPECT_NE(on.find("prefer silent batches of tool calls"), std::string::npos);
    EXPECT_NE(on.find("batch them in the same assistant message"), std::string::npos);
    EXPECT_EQ(on.find("send a brief preamble"), std::string::npos);
    EXPECT_NE(on, build(false));
}

// 场景:同一输入连续两次构造。期望:逐字节一致 —— 静态 system prompt 是
// prompt cache 的前缀,开关本身不能引入任何随机 / 时间成分。
TEST_F(SystemPromptToolPreambleTest, EnabledPromptIsByteStableAcrossCalls) {
    EXPECT_EQ(build(true), build(true));
}
