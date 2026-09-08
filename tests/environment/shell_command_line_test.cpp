// 覆盖 src/environment/shell_command_line.{hpp,cpp}:bash 工具按终端家族构造命令行。
//
// 关键不变量:
//   - cmd 家族的 Windows 命令行必须与改动前的 `cmd.exe /c <command>` 逐字节一致
//   - PowerShell 走 -EncodedCommand(UTF-16LE base64),引号原样到达 PowerShell
//   - bash / posix 走 -c,Windows 命令行按 MSVCRT argv 规则给 command 加引号

#include <gtest/gtest.h>

#include "environment/shell_command_line.hpp"

using namespace acecode::environment;

namespace {
ResolvedTerminal make_terminal(TerminalFamily family, const std::string& program) {
    ResolvedTerminal t;
    t.family = family;
    t.program = program;
    t.usable = true;
    return t;
}
}  // namespace

// 场景:家族名与 id → 家族映射。
// 期望:四个字面量固定(system prompt 与 REST 都用它们);git-bash 归 bash 家族,
// 未知 id 归 posix。
TEST(ShellCommandLineTest, FamilyNamesAndIdMapping) {
    EXPECT_STREQ(terminal_family_name(TerminalFamily::Cmd), "cmd");
    EXPECT_STREQ(terminal_family_name(TerminalFamily::PowerShell), "powershell");
    EXPECT_STREQ(terminal_family_name(TerminalFamily::Bash), "bash");
    EXPECT_STREQ(terminal_family_name(TerminalFamily::Posix), "posix");
    EXPECT_EQ(terminal_family_for_id("powershell"), TerminalFamily::PowerShell);
    EXPECT_EQ(terminal_family_for_id("cmd"), TerminalFamily::Cmd);
    EXPECT_EQ(terminal_family_for_id("git-bash"), TerminalFamily::Bash);
    EXPECT_EQ(terminal_family_for_id("zsh"), TerminalFamily::Posix);
    EXPECT_EQ(terminal_family_for_id("shell"), TerminalFamily::Posix);
}

// 场景:cmd 家族。
// 期望:命令行 `cmd.exe /c dir /b` 与改动前逐字节一致(回归哨兵:老用户选回 cmd 后
// 行为不能变);程序路径带空格时加引号。
TEST(ShellCommandLineTest, CmdFamilyMatchesLegacyByteForByte) {
    auto line = build_shell_command_line(make_terminal(TerminalFamily::Cmd, "cmd.exe"),
                                         "dir /b \"C:\\Program Files\"");
    EXPECT_EQ(line.windows_command_line, "cmd.exe /c dir /b \"C:\\Program Files\"");
    EXPECT_EQ(line.program, "cmd.exe");

    auto spaced = build_shell_command_line(
        make_terminal(TerminalFamily::Cmd, "C:\\my tools\\cmd.exe"), "echo hi");
    EXPECT_EQ(spaced.windows_command_line, "\"C:\\my tools\\cmd.exe\" /c echo hi");
}

// 场景:PowerShell 家族,命令里带双引号、分号与 $env。
// 期望:固定非交互参数 + -EncodedCommand;命令本身不出现在命令行里(全部编码),
// 因此引号不会被 Windows argv 解析吞掉。
TEST(ShellCommandLineTest, PowerShellUsesEncodedCommand) {
    const std::string command = "Write-Output \"a b\"; $env:X";
    auto line = build_shell_command_line(
        make_terminal(TerminalFamily::PowerShell, "C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
        command);
    const std::string expected_prefix =
        "\"C:\\Program Files\\PowerShell\\7\\pwsh.exe\" -NoLogo -NoProfile -NonInteractive "
        "-ExecutionPolicy Bypass -OutputFormat Text -EncodedCommand ";
    ASSERT_EQ(line.windows_command_line.substr(0, expected_prefix.size()), expected_prefix);
    EXPECT_EQ(line.windows_command_line.find("Write-Output"), std::string::npos)
        << "命令必须整体编码,不能明文出现在命令行里";
    EXPECT_EQ(line.windows_command_line.substr(expected_prefix.size()),
              encode_powershell_command(command));
    // POSIX argv 形态同样以 -EncodedCommand 收尾(pwsh 在 Linux/macOS 也接受)。
    ASSERT_GE(line.argv.size(), 3u);
    EXPECT_EQ(line.argv[line.argv.size() - 2], "-EncodedCommand");
}

// 场景:UTF-8 → UTF-16LE base64 编码。
// 期望:"exit 0" 得到 PowerShell 文档里的经典值;中文(BMP)与 emoji(代理对)
// 都按 UTF-16LE 小端编码;非法 UTF-8 字节替换为 U+FFFD 而不是崩溃。
TEST(ShellCommandLineTest, EncodePowerShellCommandHandlesUnicode) {
    EXPECT_EQ(encode_powershell_command("exit 0"), "ZQB4AGkAdAAgADAA");
    EXPECT_EQ(encode_powershell_command("\xE4\xB8\xAD"), "LU4=");            // 中 U+4E2D → 2D 4E
    EXPECT_EQ(encode_powershell_command("\xF0\x9F\x98\x80"), "PdgA3g==");    // 😀 → D83D DE00
    EXPECT_EQ(encode_powershell_command("\xFF"), "/f8=");                    // U+FFFD → FD FF
    EXPECT_EQ(encode_powershell_command(""), "");
}

// 场景:bash 家族(Windows 上的 Git Bash),命令含双引号与空格。
// 期望:Windows 命令行 `bash.exe -c "<按 argv 规则转义>"`;POSIX argv 三段。
TEST(ShellCommandLineTest, BashFamilyQuotesCommandForWindowsArgv) {
    const std::string command = "echo \"a b\" && ls -la";
    auto line = build_shell_command_line(
        make_terminal(TerminalFamily::Bash, "C:\\Program Files\\Git\\bin\\bash.exe"), command);
    EXPECT_EQ(line.windows_command_line,
              "\"C:\\Program Files\\Git\\bin\\bash.exe\" -c \"echo \\\"a b\\\" && ls -la\"");
    ASSERT_EQ(line.argv.size(), 3u);
    EXPECT_EQ(line.argv[0], "C:\\Program Files\\Git\\bin\\bash.exe");
    EXPECT_EQ(line.argv[1], "-c");
    EXPECT_EQ(line.argv[2], command);
}

// 场景:POSIX 家族。
// 期望:argv = [program, "-c", command],command 原样不改。
TEST(ShellCommandLineTest, PosixFamilyArgv) {
    auto line = build_shell_command_line(make_terminal(TerminalFamily::Posix, "/bin/zsh"),
                                         "ls -la \"$ACECODE_TMPDIR\"");
    ASSERT_EQ(line.argv.size(), 3u);
    EXPECT_EQ(line.argv[0], "/bin/zsh");
    EXPECT_EQ(line.argv[1], "-c");
    EXPECT_EQ(line.argv[2], "ls -la \"$ACECODE_TMPDIR\"");
}

// 场景:Windows 单参数引号规则。
// 期望:无特殊字符原样;含空格包引号;内嵌引号转义;引号前反斜杠加倍;结尾反斜杠加倍
//(否则会把收尾引号转义掉,这是 CreateProcess 命令行最常见的坑)。
TEST(ShellCommandLineTest, QuoteWindowsArgumentRules) {
    EXPECT_EQ(quote_windows_argument("plain"), "plain");
    EXPECT_EQ(quote_windows_argument("has space"), "\"has space\"");
    EXPECT_EQ(quote_windows_argument("say \"hi\""), "\"say \\\"hi\\\"\"");
    EXPECT_EQ(quote_windows_argument("back\\\"slash"), "\"back\\\\\\\"slash\"");
    EXPECT_EQ(quote_windows_argument("C:\\dir with space\\"), "\"C:\\dir with space\\\\\"");
    EXPECT_EQ(quote_windows_argument(""), "\"\"");
}
