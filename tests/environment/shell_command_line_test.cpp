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
    // 编码的是「编码前置脚本 + 原命令」(fix-feedback-0924 第 4 条)。
    EXPECT_EQ(line.windows_command_line.substr(expected_prefix.size()),
              encode_powershell_command(with_powershell_utf8_prelude(command)));
    EXPECT_EQ(with_powershell_utf8_prelude(command), powershell_utf8_prelude() + command);
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

// 场景:bash 工具执行 PowerShell 命令前拼的编码前置脚本(fix-feedback-0924 第 4 条:
// Windows PowerShell 5.1 用 Get-Content 读无 BOM 的 UTF-8 源码得到 GBK 乱码,写回后
// 整份中文永久损坏)。期望:前置脚本把控制台输出编码与原生命令 stdin 编码设成无 BOM
// 的 UTF-8,且两者在各自独立的 try 里(合并后 SetConsoleOutputCP 失败会连带 stdin
// 编码也没设上);只在 5.1 上改 7 个文件 cmdlet 的默认编码并关闭进度记录;单行、
// 以唯一一个换行结尾。
// 回归哨兵:不得调用 New-Object / Remove-Variable 等会触发模块自动加载的 cmdlet ——
// 否则 5.1 每条命令的 stderr 都多出一段 GBK 编码的 "#< CLIXML" 进度记录。
TEST(ShellCommandLineTest, PowerShellPreludeSetsUtf8AndIsSingleLine) {
    const std::string& prelude = powershell_utf8_prelude();
    for (const char* needle : {"[Console]::OutputEncoding=", "$OutputEncoding=",
                               "UTF8Encoding]::new($false)", "PYTHONIOENCODING", "-lt 6",
                               "$ProgressPreference='SilentlyContinue'", "'Get-Content'",
                               "'Set-Content'", "'Add-Content'", "'Out-File'",
                               "'Select-String'", "'Import-Csv'", "'Export-Csv'"}) {
        EXPECT_NE(prelude.find(needle), std::string::npos) << needle;
    }
    const auto console_at = prelude.find("[Console]::OutputEncoding=");
    const auto stdin_at = prelude.find("$OutputEncoding=");
    ASSERT_LT(console_at, stdin_at);
    EXPECT_NE(prelude.substr(console_at, stdin_at - console_at).find("}catch{};try{"),
              std::string::npos) << "两个编码设置必须在各自独立的 try 里";
    ASSERT_FALSE(prelude.empty());
    EXPECT_EQ(prelude.back(), '\n');
    EXPECT_EQ(prelude.find('\n'), prelude.size() - 1) << "前置脚本必须独占一行";
    EXPECT_EQ(prelude.find("New-Object"), std::string::npos);
    EXPECT_EQ(prelude.find("Remove-Variable"), std::string::npos);
}

// 场景:using 语句、param 块、[特性]param、具名块只能出现在脚本开头。
// 期望:这些命令原样返回(不拼前置脚本);其余命令(包括看起来像但不是的写法)
// 照常加前置脚本。
// 回归表现:拼上前置脚本后原本能运行的命令报 UsingMustBeAtStartOfScript 或
// 「意外的属性 'CmdletBinding'」这类解析错误。
TEST(ShellCommandLineTest, PowerShellPreludeSkippedForLeadingOnlyStatements) {
    for (const std::string command : {
             std::string("using namespace System.Text\n[Text.Encoding]::UTF8"),
             std::string("  \r\nUSING module Foo"),
             std::string("# c\n#requires -Version 5\nusing namespace X"),
             std::string("<# c #>\nparam($a)"),
             std::string("param($a)"),
             std::string("Param ($a)"),
             std::string("[CmdletBinding()]param($a)"),
             std::string("[CmdletBinding()]\nparam()"),
             std::string("[CmdletBinding()]\n[OutputType([string])]\nparam()"),
             std::string("[Parameter(HelpMessage='a]b')]param($x)"),
             std::string("begin {}\nprocess {}"),
             std::string("<# never closed"),
         }) {
        EXPECT_EQ(with_powershell_utf8_prelude(command), command) << command;
    }
    for (const std::string command : {
             std::string("usingFoo"),
             std::string("Write-Output using"),
             std::string("parameters"),
             std::string("$param = 1"),
             std::string("[int]$x = 1"),
             std::string("[IO.File]::ReadAllText('a')"),
             std::string("endpoint-check"),
             std::string("# only a comment\nGet-ChildItem"),
         }) {
        EXPECT_EQ(with_powershell_utf8_prelude(command), powershell_utf8_prelude() + command)
            << command;
    }
}

// 场景:-EncodedCommand 把命令膨胀约 8/3 倍(UTF-16LE 再 base64),CreateProcessW
// 命令行上限 32767 个 wchar。期望:前置脚本编码后不超过 1400 字符,可用命令长度
// 只减少约 4%。
TEST(ShellCommandLineTest, PowerShellPreludeFitsCommandLineBudget) {
    EXPECT_LE(encode_powershell_command(powershell_utf8_prelude()).size(), 1400u);
}

// 场景:终端探测只跑 `exit 0`、不解析输出。期望:探测参数不带前置脚本。
TEST(ShellCommandLineTest, ProbeArgumentsDoNotCarryPrelude) {
    const auto args = probe_arguments(TerminalFamily::PowerShell);
    ASSERT_FALSE(args.empty());
    EXPECT_EQ(args.back(), encode_powershell_command("exit 0"));
}
