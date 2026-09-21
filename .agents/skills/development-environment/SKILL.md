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

Windows 的 MSVC 构建会按 x64 或 ARM64 初始化 VS 环境；有效 MinGW 构建不要求 VS。

## Quick Web 运行时行为

- **端口**：默认端口由运行目录名（`worktree 名-commit 前 12 位`）经 `zlib.crc32` 派生，落在 28080–28280。同一 worktree 同一 commit 每次拿到同一端口，不同 worktree / commit 天然错开。被占时线性顺延，只用毫秒级 bind 探测 —— 不会再为被占端口白等 15 秒健康检查。
- 切 commit 会让运行目录与派生端口同时变化；直接访问 daemon 端口时一律以启动输出为准，日常请走 Vite 地址。
- `--port <n>` 显式指定 daemon 端口：空闲即用，被占立即报错，绝不顺延。`--run-dir` 只检查指定的目录。
- **陈旧运行目录自愈**：健康校验不通过且记录的 pid 已死时，自动清理该目录的运行时文件并重试一次；pid 仍存活则保留"请手动停止"提示。任何路径都不会终止存活进程，也不会删除判定不了的目录。
- **失败诊断**：worker 的 stdout/stderr 落到 `<run-dir>/daemon-worker.log`（超过 1MB 滚动保留 `.log.1`）。启动失败或 worker 提前退出时，错误信息同时指向它与 daemon 自带的 `daemon-startup.log`；worker 秒崩会在秒级暴露，不等满健康检查超时。

## 回收陈旧运行目录

```powershell
.\scripts\dev_web.bat prune      # Windows
python scripts/dev_environment.py prune
```

输出"已清理 / 跳过（含原因）/ 总计"三段：只清理 pid 已判死的目录，含已删除 worktree 的遗留和旧版本 `.acecode-dev-run/`；结构不认识的目录只报告不删除。存在跳过项时退出码仍为 0。日常每次启动也会顺带清理本 worktree 前缀下 pid 已死的同级目录，健康复用路径不扫描目录。

## Desktop 实例身份与多开

`scripts/dev_desktop.py` 启动前会注入两个**进程级**环境变量，它们只作用于本次启动的进程树，不读写、也不依赖用户的全局配置：

- `ACECODE_DESKTOP_INSTANCE_ID` —— 取 `worktree 名-commit 前 12 位`（经字符净化），与 Web 运行目录用的是同一套身份。同一 worktree 同一 commit 反复启动拿到同一身份，因此 desktop 的附加实例运行目录（`run/desktop-instances/<instance_id>`）可以复用而不是每次新建；切 commit 身份随之变化。
- `ACECODE_DESKTOP_ALLOW_MULTIPLE_INSTANCES=1` —— 只让本次启动允许附加实例，不改动全局的 `desktop.allow_multiple_instances`。

desktop 侧对这两个值的处理是**只校验不净化**：`ACECODE_DESKTOP_INSTANCE_ID` 只接受 `[A-Za-z0-9_.-]` 且长度 1–64，非法（含空、空格、`/`、`\`、`..`、超长）就丢弃并回退到随机 uuid；`ACECODE_DESKTOP_ALLOW_MULTIPLE_INSTANCES` 走白名单（`1`/`true`/`yes`/`on`，大小写不敏感），其余值一律视为关闭。未设置这两个变量时行为与以前完全一致。

因此直接运行 `acecode-desktop`（不经开发脚本）仍是随机身份 + 跟随全局配置；需要多开或复用稳定身份时走 `dev_desktop`。

## Report outcome

After a successful command, report the selected target and whether the build was reused or compiled. For Web, include the URL printed by the launcher. If startup fails, provide the launcher error and do not claim the environment is running.
