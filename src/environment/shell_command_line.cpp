#include "shell_command_line.hpp"

#include "../utils/base64.hpp"
#include "../web/pty/pty_backend.hpp"

#include <cstdint>

namespace acecode::environment {

const char* terminal_family_name(TerminalFamily family) {
    switch (family) {
        case TerminalFamily::Cmd:        return "cmd";
        case TerminalFamily::PowerShell: return "powershell";
        case TerminalFamily::Bash:       return "bash";
        case TerminalFamily::Posix:      return "posix";
    }
    return "posix";
}

TerminalFamily terminal_family_for_id(const std::string& shell_id) {
    if (shell_id == "powershell") return TerminalFamily::PowerShell;
    if (shell_id == "cmd") return TerminalFamily::Cmd;
    if (shell_id == "git-bash") return TerminalFamily::Bash;
    return TerminalFamily::Posix;
}

std::string quote_windows_argument(const std::string& arg) {
    const bool needs_quotes = arg.empty() ||
        arg.find_first_of(" \t\n\v\"") != std::string::npos;
    if (!needs_quotes) return arg;
    std::string out;
    out.reserve(arg.size() + 2);
    out.push_back('"');
    std::size_t backslashes = 0;
    for (char c : arg) {
        if (c == '\\') {
            ++backslashes;
            continue;
        }
        if (c == '"') {
            // 引号前的反斜杠加倍,再转义引号本身。
            out.append(backslashes * 2 + 1, '\\');
            out.push_back('"');
            backslashes = 0;
            continue;
        }
        out.append(backslashes, '\\');
        backslashes = 0;
        out.push_back(c);
    }
    // 结尾反斜杠加倍,否则会把收尾引号转义掉。
    out.append(backslashes * 2, '\\');
    out.push_back('"');
    return out;
}

std::string encode_powershell_command(const std::string& utf8_command) {
    // 手写 UTF-8 → UTF-16LE:std::wstring 在 POSIX 是 32 位,不能拿来当 UTF-16 用。
    std::string bytes;
    bytes.reserve(utf8_command.size() * 2);
    auto push16 = [&](std::uint32_t unit) {
        bytes.push_back(static_cast<char>(unit & 0xFF));
        bytes.push_back(static_cast<char>((unit >> 8) & 0xFF));
    };
    std::size_t i = 0;
    while (i < utf8_command.size()) {
        const unsigned char lead = static_cast<unsigned char>(utf8_command[i]);
        std::uint32_t cp = 0;
        std::size_t len = 1;
        if (lead < 0x80) {
            cp = lead;
        } else if ((lead & 0xE0) == 0xC0) {
            cp = lead & 0x1F; len = 2;
        } else if ((lead & 0xF0) == 0xE0) {
            cp = lead & 0x0F; len = 3;
        } else if ((lead & 0xF8) == 0xF0) {
            cp = lead & 0x07; len = 4;
        } else {
            cp = 0xFFFD;
        }
        if (len > 1) {
            if (i + len > utf8_command.size()) {
                cp = 0xFFFD;
                len = 1;
            } else {
                for (std::size_t k = 1; k < len; ++k) {
                    const unsigned char cc = static_cast<unsigned char>(utf8_command[i + k]);
                    if ((cc & 0xC0) != 0x80) {
                        cp = 0xFFFD;
                        len = 1;
                        break;
                    }
                    cp = (cp << 6) | (cc & 0x3F);
                }
            }
        }
        i += len;
        if (cp >= 0x10000) {
            cp -= 0x10000;
            push16(0xD800 | (cp >> 10));
            push16(0xDC00 | (cp & 0x3FF));
        } else {
            push16(cp);
        }
    }
    return base64_encode(bytes);
}

std::vector<std::string> powershell_noninteractive_args() {
    return {"-NoLogo", "-NoProfile", "-NonInteractive",
            "-ExecutionPolicy", "Bypass", "-OutputFormat", "Text"};
}

std::vector<std::string> probe_arguments(TerminalFamily family) {
    switch (family) {
        case TerminalFamily::Cmd:
            return {"/d", "/c", "exit", "0"};
        case TerminalFamily::PowerShell: {
            auto args = powershell_noninteractive_args();
            args.push_back("-EncodedCommand");
            args.push_back(encode_powershell_command("exit 0"));
            return args;
        }
        case TerminalFamily::Bash:
        case TerminalFamily::Posix:
            return {"-c", "exit 0"};
    }
    return {"-c", "exit 0"};
}

ShellCommandLine build_shell_command_line(const ResolvedTerminal& terminal,
                                          const std::string& command) {
    ShellCommandLine out;
    out.program = terminal.program;
    const std::string quoted_program = quote_shell_path_if_needed(terminal.program);
    switch (terminal.family) {
        case TerminalFamily::Cmd:
            // 与改动前的 `cmd.exe /c <command>` 逐字节一致:cmd 自己解析剩余文本。
            out.windows_command_line = quoted_program + " /c " + command;
            out.argv = {terminal.program, "/c", command};
            break;
        case TerminalFamily::PowerShell: {
            out.argv.push_back(terminal.program);
            std::string line = quoted_program;
            for (const auto& a : powershell_noninteractive_args()) {
                out.argv.push_back(a);
                line += " " + a;
            }
            const std::string encoded = encode_powershell_command(command);
            out.argv.push_back("-EncodedCommand");
            out.argv.push_back(encoded);
            line += " -EncodedCommand " + encoded;
            out.windows_command_line = line;
            break;
        }
        case TerminalFamily::Bash:
        case TerminalFamily::Posix:
            out.argv = {terminal.program, "-c", command};
            out.windows_command_line =
                quoted_program + " -c " + quote_windows_argument(command);
            break;
    }
    return out;
}

}  // namespace acecode::environment
