// 覆盖 build_system_prompt 的「附加工作目录」两行(「编辑项目」的附加文件夹)。
// 这两行在可缓存的静态前缀里,所以同时守住:没有附加文件夹时输出逐字节不变。

#include <gtest/gtest.h>

#include "prompt/system_prompt.hpp"
#include "tool/tool_executor.hpp"

#include <string>

namespace {

std::string build_with(const acecode::SystemPromptWorkspaceFolders* folders) {
    acecode::ToolExecutor tools;
    return acecode::build_system_prompt(tools, "C:/work/main", nullptr, nullptr, nullptr,
        nullptr, nullptr, nullptr, true, nullptr, nullptr, nullptr, false, folders);
}

} // namespace

// 场景:项目没有附加文件夹(nullptr 或两个列表都空)。
// 期望:与不传参数的旧输出逐字节相同 —— 老会话的 prompt cache 前缀不受影响。
TEST(SystemPromptWorkspaceFolders, EmptyFoldersAreByteIdenticalToLegacyPrompt) {
    const acecode::SystemPromptWorkspaceFolders empty;
    const std::string legacy = build_with(nullptr);
    EXPECT_EQ(build_with(&empty), legacy);
    EXPECT_EQ(legacy.find("Additional working directories"), std::string::npos);
}

// 场景:项目有两个可写的附加文件夹。
// 期望:# Environment 里列出这两个目录(分号分隔),并说明它们属于本项目、用绝对
// 路径读写;重复构建逐字节稳定。
TEST(SystemPromptWorkspaceFolders, ListsAdditionalWorkingDirectories) {
    acecode::SystemPromptWorkspaceFolders folders;
    folders.additional = {"D:/shared/lib", "E:/docs"};
    const std::string prompt = build_with(&folders);
    EXPECT_NE(prompt.find("- Additional working directories: D:/shared/lib; E:/docs\n"),
              std::string::npos);
    EXPECT_NE(prompt.find("absolute paths"), std::string::npos);
    EXPECT_LT(prompt.find("- Working directory: C:/work/main"),
              prompt.find("- Additional working directories:"));
    EXPECT_EQ(prompt, build_with(&folders));
    EXPECT_EQ(prompt.find("readable but not writable"), std::string::npos);
}

// 场景:worktree 会话里,某个附加文件夹与主 checkout 重叠而被收回写权限。
// 期望:单独一行标明本会话只读,且不出现在可写那一行里。
TEST(SystemPromptWorkspaceFolders, ReadOnlyFoldersGetTheirOwnLine) {
    acecode::SystemPromptWorkspaceFolders folders;
    folders.read_only = {"C:/work"};
    const std::string prompt = build_with(&folders);
    EXPECT_EQ(prompt.find("- Additional working directories:"), std::string::npos);
    EXPECT_NE(prompt.find("readable but not writable in this session"), std::string::npos);
    EXPECT_NE(prompt.find("): C:/work\n"), std::string::npos);
}
