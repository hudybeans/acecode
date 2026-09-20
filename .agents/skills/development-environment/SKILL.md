---
name: development-environment
description: Start ACECode's Web, Desktop, or TUI development environment safely, reusing a compatible build from the current Git worktree when possible.
---

# Development Environment

Use this skill when the user asks to run, start, or open the ACECode development environment.

## Select the target

If the request does not name a target, ask exactly which development surface to run:

- **Web** — starts the daemon-backed browser UI.
- **Desktop** — starts the native desktop shell against the local development frontend.
- **TUI** — starts the terminal interface in a new terminal window.

Do not start anything until the user selects one target. If they name a target, proceed without repeating the question.

## Use the shared launcher

Run the target-specific repository launcher instead of implementing launch logic in the conversation:

```powershell
.\scripts\dev_web.bat
.\scripts\dev_desktop.bat
.\scripts\dev_tui.bat
```

On macOS or Linux:

```bash
./scripts/dev_web.sh
./scripts/dev_desktop.sh
./scripts/dev_tui.sh
```

Pass `--build-dir <path>` only when the user explicitly supplies a candidate build directory. Do not copy `acecode`, `acecode-desktop`, DLLs, or other build artifacts between worktrees.

## Build reuse and rebuild policy

启动器只复用当前工作树内的 CMake 构建，检查源码路径、平台、架构、目标产物及 Desktop 配置。多配置构建会编译并启动同一配置。其他已登记工作树仅可提供经验证的前端产物和编译缓存，不提供本工作树实际运行的程序。

Every launch incrementally builds the verified target, so source changes are incorporated even when the configured build is reused. Web and Desktop also refresh frontend assets when their inputs are newer than `web/dist`.

If no compatible configured build exists, the launcher reports the platform CMake preset and asks for confirmation before configuration. Preserve that safety boundary:

- Windows target-specific batch launchers automatically approve this first configuration so they work when double-clicked.
- For the shared Python launcher and POSIX target-specific launchers, state that configuration is needed, name the preset, and ask the user for explicit confirmation before adding `--yes`.
- If the user declines, do not configure, compile, or start a surface.

The shared launcher calls the existing Python surface launchers: `scripts/dev_web.py` for Web and `scripts/dev_desktop.py` for Desktop. Web uses a worktree-isolated runtime directory and opens its resulting local URL; Desktop opens its application window; TUI opens a new terminal window.

Windows 的 MSVC 构建会按 x64 或 ARM64 初始化 VS 环境；有效 MinGW 构建不要求 VS。Web 重建前发现既存 PID 记录时会明确失败并给出检查或停止命令；不要通过删 PID 文件、宽泛终止进程等方式绕过此检查。显式 `--run-dir` 只检查所指定的目录。

## Report outcome

After a successful command, report the selected target and whether the build was reused or compiled. For Web, include the URL printed by the launcher. If startup fails, provide the launcher error and do not claim the environment is running.
