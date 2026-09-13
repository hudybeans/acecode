#pragma once

// bash 工具与终端探测共用的命令行构造(openspec: agent-default-terminal)。
// 纯函数,无平台依赖,便于单测逐字节比对。
//
// 各终端家族的启动形态:
//   cmd        : <program> /c <command>                    (与改动前的 `cmd.exe /c` 逐字节一致)
//   powershell : <program> -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass
//                -OutputFormat Text -EncodedCommand <UTF-16LE base64>
//                —— 用 EncodedCommand 是因为 `-Command` 的剩余参数会先过一遍 Windows argv
//                解析,引号被吞得不可预测;EncodedCommand 不经过任何引号处理。
//   bash/posix : <program> -c <command>                    (非登录、非交互)

#include <string>
#include <vector>

namespace acecode::environment {

// 终端家族。命名对应 system prompt `Shell:` 行与语法指引的切换依据:
//   Cmd = Windows 命令提示符;PowerShell = pwsh / Windows PowerShell;
//   Bash = Windows 上的 Git Bash;Posix = Linux/macOS 的登录 shell 家族。
enum class TerminalFamily { Cmd, PowerShell, Bash, Posix };

const char* terminal_family_name(TerminalFamily family);  // "cmd" / "powershell" / "bash" / "posix"

// 终端类型 id → 家族:powershell → PowerShell;cmd → Cmd;git-bash → Bash;其余 → Posix。
TerminalFamily terminal_family_for_id(const std::string& shell_id);

// 已解析的默认终端。program 为裸名(走 PATH)或绝对路径。
struct ResolvedTerminal {
    std::string id;                       // 终端类型 id(空 = 未解析出可用终端)
    TerminalFamily family = TerminalFamily::Cmd;
    std::string program;                  // 实际启动的程序
    std::string console_command;          // 控制台停靠区新建 tab 用的命令行(含参数)
    std::string fallback_reason;          // 非空 = 发生了回退(或显式路径不可用),给 UI 展示
    bool usable = false;                  // false = 没有任何候选通过启动探测
};

struct ShellCommandLine {
    std::string program;                  // argv[0]
    std::vector<std::string> argv;        // POSIX 用(argv[0] = program)
    std::string windows_command_line;     // Windows 用(交给 CreateProcessW 的完整命令行)
};

// 按 MSVCRT argv 规则给单个参数加引号:含空格 / 制表符 / 引号时包双引号,
// 引号前的反斜杠加倍,引号本身转义。
std::string quote_windows_argument(const std::string& arg);

// UTF-8 → UTF-16LE → base64,PowerShell -EncodedCommand 的参数。
std::string encode_powershell_command(const std::string& utf8_command);

// PowerShell 非交互启动的固定参数(不含 -EncodedCommand)。
std::vector<std::string> powershell_noninteractive_args();

// 启动探测用的"exit 0"参数(每个家族各自的语法)。
std::vector<std::string> probe_arguments(TerminalFamily family);

// 构造 bash 工具执行 `command` 的命令行。
ShellCommandLine build_shell_command_line(const ResolvedTerminal& terminal,
                                          const std::string& command);

}  // namespace acecode::environment
