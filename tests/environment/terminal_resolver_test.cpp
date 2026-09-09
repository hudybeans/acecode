// 覆盖 src/environment/terminal_resolver.{hpp,cpp}:默认终端的启动探测与逐级回退。
//
// 用注入式 ShellProbe(文件在不在 / 环境变量)+ 假 LaunchProbe(某程序能不能启动)
// 覆盖回退链,不依赖真实安装的 shell。候选列表按平台不同,Windows 与 POSIX 各自
// 一组用例;平台无关的部分(探测参数形态、控制台命令行)两边都跑。

#include <gtest/gtest.h>

#include "environment/terminal_resolver.hpp"
#include "environment/terminal_runtime.hpp"

#include <map>
#include <set>
#include <string>

namespace {

acecode::ShellProbe mock_probe(std::set<std::string> existing,
                               std::map<std::string, std::string> env) {
    acecode::ShellProbe p;
    p.exists = [existing](const std::string& path) { return existing.count(path) > 0; };
    p.getenv = [env](const std::string& name) {
        auto it = env.find(name);
        return it == env.end() ? std::string{} : it->second;
    };
    p.git_install_path = []() { return std::string{}; };
    p.login_shell = []() { return std::string{}; };
    return p;
}

// 假启动探测:failures 里列出的程序返回对应错误,其余全部成功。
acecode::environment::LaunchProbe mock_launch(std::map<std::string, std::string> failures) {
    return [failures](const std::string& program, const std::vector<std::string>&) {
        acecode::environment::LaunchProbeResult r;
        auto it = failures.find(program);
        if (it != failures.end()) {
            r.error = it->second;
            return r;
        }
        r.ok = true;
        return r;
    };
}

const acecode::environment::TerminalCandidate* find_candidate(
    const acecode::environment::TerminalResolution& res, const std::string& id) {
    for (const auto& c : res.candidates) if (c.id == id) return &c;
    return nullptr;
}

}  // namespace

using acecode::environment::TerminalFamily;

// 场景:探测参数形态。
// 期望:cmd 用 /d /c exit 0;PowerShell 用非交互固定参数 + EncodedCommand(与 bash
// 工具真实启动形态一致,这样探测通过就等于 EncodedCommand 在这台机器上可用);
// bash / posix 用 -c "exit 0"。
TEST(TerminalResolverTest, ProbeArgumentsMatchLaunchShape) {
    using acecode::environment::probe_arguments;
    auto cmd = probe_arguments(TerminalFamily::Cmd);
    ASSERT_EQ(cmd.size(), 4u);
    EXPECT_EQ(cmd[0], "/d");
    EXPECT_EQ(cmd[1], "/c");

    auto ps = probe_arguments(TerminalFamily::PowerShell);
    ASSERT_GE(ps.size(), 9u);
    EXPECT_EQ(ps[0], "-NoLogo");
    EXPECT_EQ(ps[2], "-NonInteractive");
    EXPECT_EQ(ps[ps.size() - 2], "-EncodedCommand");
    EXPECT_EQ(ps.back(), "ZQB4AGkAdAAgADAA");  // "exit 0" 的 UTF-16LE base64

    auto sh = probe_arguments(TerminalFamily::Posix);
    ASSERT_EQ(sh.size(), 2u);
    EXPECT_EQ(sh[0], "-c");
    EXPECT_EQ(sh[1], "exit 0");
}

// 场景:控制台停靠区的启动命令行。
// 期望:git-bash 带 --login -i(交互 tab 需要登录环境);带空格的路径加引号;
// POSIX 家族原样。
TEST(TerminalResolverTest, ConsoleCommandPerFamily) {
    using acecode::environment::console_command_for;
    EXPECT_EQ(console_command_for(TerminalFamily::Bash, "C:\\Program Files\\Git\\bin\\bash.exe"),
              "\"C:\\Program Files\\Git\\bin\\bash.exe\" --login -i");
    EXPECT_EQ(console_command_for(TerminalFamily::PowerShell, "C:\\mytool\\pwsh.exe"),
              "C:\\mytool\\pwsh.exe");
    EXPECT_EQ(console_command_for(TerminalFamily::Cmd, "cmd.exe"), "cmd.exe");
    EXPECT_EQ(console_command_for(TerminalFamily::Posix, "/bin/zsh"), "/bin/zsh");
}

#ifdef _WIN32

namespace {
const char* kPwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const std::map<std::string, std::string> kWinEnv = {
    {"ProgramFiles", "C:\\Program Files"},
    {"COMSPEC", "C:\\Windows\\System32\\cmd.exe"},
};
}  // namespace

// 场景:什么都没配置,pwsh 已安装且能启动。
// 期望:选中 powershell 家族、程序是 pwsh,没有回退原因(这就是首选)。
TEST(TerminalResolverWindowsTest, DefaultPicksPwshWhenUsable) {
    acecode::ConsoleConfig console;
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh}, kWinEnv), mock_launch({}));
    EXPECT_TRUE(res.resolved.usable);
    EXPECT_EQ(res.resolved.id, "powershell");
    EXPECT_EQ(res.resolved.family, TerminalFamily::PowerShell);
    EXPECT_EQ(res.resolved.program, kPwsh);
    EXPECT_TRUE(res.resolved.fallback_reason.empty());
}

// 场景:pwsh 存在但被策略拒绝启动(拒绝访问)。
// 期望:同类备选 powershell.exe 接管,类型仍是 powershell,回退原因点名 pwsh。
// 回归背景:用户要求「PowerShell 要确保找到了并且可用,拒绝访问就回退」。
TEST(TerminalResolverWindowsTest, PwshDeniedFallsBackToWindowsPowerShell) {
    acecode::ConsoleConfig console;
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh}, kWinEnv), mock_launch({{kPwsh, "access denied"}}));
    EXPECT_TRUE(res.resolved.usable);
    EXPECT_EQ(res.resolved.id, "powershell");
    EXPECT_EQ(res.resolved.program, "powershell.exe");
    EXPECT_NE(res.resolved.fallback_reason.find("pwsh.exe"), std::string::npos);
    EXPECT_NE(res.resolved.fallback_reason.find("access denied"), std::string::npos);
}

// 场景:pwsh 与 powershell.exe 都启动失败,Git Bash 未安装。
// 期望:退到 cmd,原因里两条 PowerShell 失败都在。
TEST(TerminalResolverWindowsTest, AllPowerShellUnusableFallsBackToCmd) {
    acecode::ConsoleConfig console;
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh}, kWinEnv),
        mock_launch({{kPwsh, "access denied"}, {"powershell.exe", "exit code 1"}}));
    EXPECT_TRUE(res.resolved.usable);
    EXPECT_EQ(res.resolved.id, "cmd");
    EXPECT_EQ(res.resolved.family, TerminalFamily::Cmd);
    EXPECT_EQ(res.resolved.program, "C:\\Windows\\System32\\cmd.exe");
    EXPECT_NE(res.resolved.fallback_reason.find("access denied"), std::string::npos);
    EXPECT_NE(res.resolved.fallback_reason.find("exit code 1"), std::string::npos);
    EXPECT_NE(res.resolved.fallback_reason.find("Git Bash"), std::string::npos)
        << "未安装的候选也要出现在原因里,用户才知道为什么跳过";
}

// 场景:用户为 powershell 指定了显式路径且能启动。
// 期望:用显式路径,没有回退原因;候选明细里 configured_path 与 program 一致。
TEST(TerminalResolverWindowsTest, ConfiguredPathIsUsedWhenUsable) {
    acecode::ConsoleConfig console;
    console.default_shell = "powershell";
    console.shell_paths["powershell"] = "C:\\mytool\\pwsh.exe";
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh, "C:\\mytool\\pwsh.exe"}, kWinEnv), mock_launch({}));
    EXPECT_EQ(res.resolved.program, "C:\\mytool\\pwsh.exe");
    EXPECT_TRUE(res.resolved.fallback_reason.empty());
    const auto* c = find_candidate(res, "powershell");
    ASSERT_NE(c, nullptr);
    EXPECT_EQ(c->configured_path, "C:\\mytool\\pwsh.exe");
    EXPECT_TRUE(c->usable);
}

// 场景:显式路径存在但启动失败。
// 期望:退到该类型的探测路径(pwsh),回退原因点名显式路径 —— UI 用它显示
// 「已回退」而不是让用户以为自己的设置生效了。
TEST(TerminalResolverWindowsTest, ConfiguredPathUnusableFallsBackWithReason) {
    acecode::ConsoleConfig console;
    console.default_shell = "powershell";
    console.shell_paths["powershell"] = "C:\\mytool\\pwsh.exe";
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh, "C:\\mytool\\pwsh.exe"}, kWinEnv),
        mock_launch({{"C:\\mytool\\pwsh.exe", "exit code 9009"}}));
    EXPECT_TRUE(res.resolved.usable);
    EXPECT_EQ(res.resolved.id, "powershell");
    EXPECT_EQ(res.resolved.program, kPwsh);
    EXPECT_NE(res.resolved.fallback_reason.find("C:\\mytool\\pwsh.exe"), std::string::npos);
}

// 场景:显式路径指向不存在的文件(移动了 / 卸载了)。
// 期望:不去启动它,原因写"configured path not found",继续用探测路径。
TEST(TerminalResolverWindowsTest, MissingConfiguredPathIsReportedNotLaunched) {
    acecode::ConsoleConfig console;
    console.default_shell = "cmd";
    console.shell_paths["cmd"] = "D:\\gone\\cmd.exe";
    int launches_of_missing = 0;
    auto launch = [&](const std::string& program, const std::vector<std::string>&) {
        acecode::environment::LaunchProbeResult r;
        if (program == "D:\\gone\\cmd.exe") ++launches_of_missing;
        r.ok = true;
        return r;
    };
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({}, kWinEnv), launch);
    EXPECT_EQ(launches_of_missing, 0);
    EXPECT_EQ(res.resolved.program, "C:\\Windows\\System32\\cmd.exe");
    EXPECT_NE(res.resolved.fallback_reason.find("configured path not found"), std::string::npos);
}

// 场景:配置的类型是 git-bash 但机器上没装。
// 期望:回退到平台顺序的第一个可用项(powershell),原因说明 Git Bash 未安装。
TEST(TerminalResolverWindowsTest, ConfiguredTypeNotInstalledFallsBack) {
    acecode::ConsoleConfig console;
    console.default_shell = "git-bash";
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({kPwsh}, kWinEnv), mock_launch({}));
    EXPECT_EQ(res.resolved.id, "powershell");
    EXPECT_NE(res.resolved.fallback_reason.find("Git Bash"), std::string::npos);
    const auto* gb = find_candidate(res, "git-bash");
    ASSERT_NE(gb, nullptr);
    EXPECT_TRUE(gb->needs_path);
}

// 场景:用户明确选了 cmd。
// 期望:直接用 cmd,不去碰 PowerShell(不做无谓探测),无回退原因。
TEST(TerminalResolverWindowsTest, ConfiguredCmdIsPreferredOverPlatformOrder) {
    acecode::ConsoleConfig console;
    console.default_shell = "cmd";
    int powershell_launches = 0;
    auto launch = [&](const std::string& program, const std::vector<std::string>&) {
        acecode::environment::LaunchProbeResult r;
        if (program.find("pwsh") != std::string::npos ||
            program.find("powershell") != std::string::npos) ++powershell_launches;
        r.ok = true;
        return r;
    };
    auto res = acecode::environment::resolve_terminal(console, mock_probe({kPwsh}, kWinEnv), launch);
    EXPECT_EQ(res.resolved.id, "cmd");
    EXPECT_TRUE(res.resolved.fallback_reason.empty());
    EXPECT_EQ(powershell_launches, 0);
}

// 场景:所有候选都启动失败(极端受限环境)。
// 期望:usable=false,id 为空,原因非空;运行时 current() 返回 nullopt 让 bash 工具
// 走改动前的行为,而不是彻底罢工。
TEST(TerminalResolverWindowsTest, NothingUsableReportsAndRuntimeFallsBack) {
    acecode::ConsoleConfig console;
    auto& rt = acecode::environment::terminal();
    rt.reset_for_test();
    auto res = rt.reresolve(console, mock_probe({kPwsh}, kWinEnv),
                            mock_launch({{kPwsh, "denied"},
                                         {"powershell.exe", "denied"},
                                         {"C:\\Windows\\System32\\cmd.exe", "denied"}}));
    EXPECT_FALSE(res.resolved.usable);
    EXPECT_TRUE(res.resolved.id.empty());
    EXPECT_FALSE(res.resolved.fallback_reason.empty());
    EXPECT_FALSE(rt.current().has_value());
    ASSERT_TRUE(rt.last().has_value());
    rt.reset_for_test();
}

#else  // POSIX

// 场景:POSIX 未配置,登录 shell 是 zsh,bash 也装了。
// 期望:先选登录 shell(id=shell,程序 /bin/zsh),家族 Posix,无回退原因。
TEST(TerminalResolverPosixTest, DefaultPicksLoginShell) {
    acecode::ConsoleConfig console;
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({"/bin/bash", "/bin/zsh"}, {{"SHELL", "/bin/zsh"}}),
        mock_launch({}));
    EXPECT_TRUE(res.resolved.usable);
    EXPECT_EQ(res.resolved.id, "shell");
    EXPECT_EQ(res.resolved.program, "/bin/zsh");
    EXPECT_EQ(res.resolved.family, TerminalFamily::Posix);
    EXPECT_TRUE(res.resolved.fallback_reason.empty());
}

// 场景:登录 shell 启动失败(例如 chsh 指向了被删掉的 shell)。
// 期望:退到 bash,原因点名登录 shell。
TEST(TerminalResolverPosixTest, BrokenLoginShellFallsBackToBash) {
    acecode::ConsoleConfig console;
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({"/bin/bash"}, {{"SHELL", "/opt/gone/fish"}}),
        mock_launch({{"/opt/gone/fish", "no such file"}}));
    EXPECT_EQ(res.resolved.id, "bash");
    EXPECT_EQ(res.resolved.program, "/bin/bash");
    EXPECT_NE(res.resolved.fallback_reason.find("/opt/gone/fish"), std::string::npos);
}

// 场景:用户选了 zsh 并给了显式路径。
// 期望:用显式路径,无回退原因。
TEST(TerminalResolverPosixTest, ConfiguredZshPathIsUsed) {
    acecode::ConsoleConfig console;
    console.default_shell = "zsh";
    console.shell_paths["zsh"] = "/opt/homebrew/bin/zsh";
    auto res = acecode::environment::resolve_terminal(
        console, mock_probe({"/bin/bash", "/bin/zsh", "/opt/homebrew/bin/zsh"},
                            {{"SHELL", "/bin/bash"}}),
        mock_launch({}));
    EXPECT_EQ(res.resolved.id, "zsh");
    EXPECT_EQ(res.resolved.program, "/opt/homebrew/bin/zsh");
    EXPECT_TRUE(res.resolved.fallback_reason.empty());
}

#endif

// 场景:运行时发布与快照。
// 期望:set_for_test 后 current() 返回同一终端;reset 后为 nullopt。
TEST(TerminalRuntimeTest, PublishAndSnapshot) {
    auto& rt = acecode::environment::terminal();
    rt.reset_for_test();
    EXPECT_FALSE(rt.current().has_value());

    acecode::environment::ResolvedTerminal t;
    t.id = "powershell";
    t.family = TerminalFamily::PowerShell;
    t.program = "pwsh";
    t.usable = true;
    rt.set_for_test(t);
    auto cur = rt.current();
    ASSERT_TRUE(cur.has_value());
    EXPECT_EQ(cur->program, "pwsh");

    rt.reset_for_test();
    EXPECT_FALSE(rt.current().has_value());
}
