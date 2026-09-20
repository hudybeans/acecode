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

`dev_web` defaults to rapid frontend development: it starts or reuses a current-worktree daemon, then keeps Vite running in the foreground. Open the Vite URL (normally `http://127.0.0.1:5173`) rather than the daemon URL to see hot reload changes. It does not rebuild an existing native executable or `web/dist`.

Use `dev_web --embedded` only to rebuild `web/dist`, rebuild the native daemon with embedded assets, and validate the production-like static UI. If quick mode lacks a compatible executable, an interactive terminal asks before compiling; non-interactive callers must explicitly pass `--build-daemon`.

Pass `--build-dir <path>` only when the user explicitly supplies a candidate build directory. Do not copy `acecode`, `acecode-desktop`, DLLs, or other build artifacts between worktrees.

## Build reuse and rebuild policy

启动器只复用当前工作树内的 CMake 构建，检查源码路径、平台、架构、目标产物及 Desktop 配置。多配置构建会编译并启动同一配置。其他已登记工作树仅可提供经验证的前端产物和编译缓存，不提供本工作树实际运行的程序。

Desktop and TUI launches incrementally build their verified targets. Web only refreshes frontend assets and rebuilds its daemon in explicit `--embedded` mode.

If a compatible configured build does not exist, Desktop and TUI report the platform CMake preset and ask for confirmation before configuration. Web quick mode follows its `--build-daemon` authorization rule above; embedded mode follows the normal build confirmation flow. If the user declines, do not configure, compile, or start a surface.

The shared launcher calls `scripts/dev_web.py` only to start the Web daemon; quick Web mode then runs Vite with a worktree-isolated daemon runtime directory. Desktop opens its application window; TUI opens a new terminal window.

Windows 的 MSVC 构建会按 x64 或 ARM64 初始化 VS 环境；有效 MinGW 构建不要求 VS。Quick Web mode reuses only a healthy daemon in its own runtime directory and never deletes PID files or broadly terminates processes. If port 28080 is unavailable, it reserves an available loopback port, starts the daemon on it, and forwards that port only to the launched Vite process. Explicit `--run-dir` only checks the specified directory.

## Report outcome

After a successful command, report the selected target and whether the build was reused or compiled. For Web, include the URL printed by the launcher. If startup fails, provide the launcher error and do not claim the environment is running.
