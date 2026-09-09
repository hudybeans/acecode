# Repository Guidelines

## Project Structure & Module Organization

ACECode is a C++17 terminal AI coding agent with daemon, web UI, and optional desktop surfaces. The root [main.cpp](main.cpp) owns the terminal TUI entry point. Reusable logic lives under [src/](src) by subsystem, including `commands`, `config`, `daemon`, `desktop`, `history`, `markdown`, `memory`, `network`, `project_instructions`, `provider`, `session`, `skills`, `tool`, `tui`, `utils`, and `web`.

Unit tests live in [tests/](tests) and mirror source paths; for example, session storage code should be covered under `tests/session/`. Static model catalog assets are in [assets/models_dev/](assets/models_dev). User and subsystem docs live in [docs/](docs). Vendored or submodule code is under [external/](external). vcpkg overlay ports are under [ports/](ports).

Canonical root docs are [README.md](README.md), [README_CN.md](README_CN.md), [ARCHITECTURE.md](ARCHITECTURE.md), this file, and [CLAUDE.md](CLAUDE.md). Keep the root small: do not reintroduce one-off status reports, root task lists, captured build logs, or duplicate project-instruction docs.

## Build, Test, And Development Commands

- `git submodule update --init --recursive`: fetch required submodules.
- `cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=<vcpkg-root>/scripts/buildsystems/vcpkg.cmake -DVCPKG_TARGET_TRIPLET=<triplet> -DVCPKG_OVERLAY_PORTS=$PWD/ports -DBUILD_TESTING=ON`: configure a testable build.
- `cmake --build build --config Release`: build the `acecode` executable.
- `cmake --build build --target acecode_unit_tests`: build the GoogleTest binary.
- `ctest --test-dir build --output-on-failure`: run the unit suite.
- `scripts/code_quality_check.sh` or `scripts/code_quality_check.bat`: run local quality checks for common DRY and error-handling issues.
- In [web/](web), run `pnpm install` once, `pnpm test` for JS tests, and `pnpm build` before configuring/building CMake when embedded frontend assets must be refreshed. See [web/README.md](web/README.md).
- Desktop shell is opt-in: configure with `-DACECODE_BUILD_DESKTOP=ON` and build `acecode-desktop`. The desktop target expects the daemon executable beside it at runtime.

## Architecture Boundaries

- Keep TUI-specific code in [main.cpp](main.cpp), [src/tui/](src/tui), and [src/markdown/](src/markdown). Put reusable, testable logic in the relevant `src/<subsystem>/` area or a focused top-level `src/*.cpp` helper when that is the existing local pattern.
- `acecode_testable` intentionally excludes the full TUI entry point and desktop WebView shell. Pure helpers can be added there and covered by unit tests.
- Daemon/API work usually touches [src/daemon/](src/daemon), [src/web/](src/web), and [src/session/](src/session). Update [docs/daemon-api.md](docs/daemon-api.md) when protocol behavior changes.
- React/Vite/Tailwind frontend work stays under [web/src/](web/src). Do not edit generated build output directly; regenerate it with the web build.
- Avoid modifying vendored or submodule trees such as [external/](external), `hermes-agent/`, or `claudecodehaha/` unless the task explicitly targets them.

## OpenSpec Workflow

For non-trivial behavior changes, create or continue an OpenSpec change under `openspec/changes/` before implementation. Use the repository's OpenSpec workflow commands or the local `openspec` CLI to propose, apply, and archive changes. During implementation, read the change context, complete tasks one by one, and update task checkboxes in the change's `tasks.md` immediately after each task is complete.

## Project-Level Agent Overrides

The Superpowers plugin is disabled for this repository. Do not invoke or follow `superpowers:*` skills, including `superpowers:using-superpowers`, unless the user explicitly re-enables Superpowers for a specific turn.

## Coding Style & Naming Conventions

Follow [.editorconfig](.editorconfig): UTF-8, LF line endings, final newline, 4-space indentation for C++ and CMake, and 2-space indentation for JSON/YAML. Use C++17. Keep headers in `src/**/*.hpp` and implementations in matching `.cpp` files where practical. Name test files with the singular suffix `_test.cpp`; `tests/CMakeLists.txt` discovers that pattern automatically.

Prefer existing helpers such as `ToolArgsParser`, `ToolErrors`, path/session utilities, provider/model helpers, and web handler pure functions instead of duplicating parsing or validation logic.

This is a terminal UI project. Avoid emoji or ambiguous-width glyphs in C++ source, rendered UI, logs, and console output. Prefer ASCII or width-stable symbols already used in the codebase.

## Testing Guidelines

Tests use GoogleTest through the `acecode_unit_tests` target. Add tests for pure logic, serializers, parsers, validators, handler helpers, and headless state machines. Keep TUI-heavy code in [src/tui/](src/tui), [src/markdown/](src/markdown), and [main.cpp](main.cpp) manually validated unless logic can be isolated.

Use `testing::TempDir()` or `std::filesystem::temp_directory_path()` for file I/O; do not write test artifacts into the repository tree. Prefer `EXPECT_*` unless failure would make later assertions unsafe.

If CMake test discovery/build integration is unavailable in the editor, still keep changes compatible with the documented `cmake --build` and `ctest` commands. For web-only changes, at minimum run `pnpm test` and `pnpm build` from [web/](web).

## 研发实施中的通用注意事项

- 重构或迁移功能时，先明确新旧路径的责任边界，再逐步切换调用入口；如果新旧状态、事件处理或兼容分支同时生效，同一个输入可能被重复处理，问题通常只在特定交互顺序下暴露。
- 事件驱动程序需要明确每类事件的唯一所有者。键盘、鼠标、定时器、重绘和后台回调应经过统一适配层进入业务状态机，不能只迁移最常见的事件而遗漏边缘输入路径。
- 业务状态、传输格式和展示文本应分层维护。不要用格式化后的字符串推断状态；空字符串、缺失字段和显式的空值可能代表不同语义，跨线程或跨进程传输时应保留必要的结构化信息。
- 不要把布局、分页或超时等动态行为写成固定常量。可视区域、终端尺寸、配置值和运行时状态变化后，固定步长或固定边界容易产生越界、跳过内容或无法操作的问题。
- 将时间、外部 IO、线程调度和平台资源封装在边界上，核心逻辑尽量使用可注入的时钟、输入和依赖。这样既能避免测试永久等待，也能稳定覆盖超时、取消和竞态场景。
- Windows 增量构建前确认没有残留进程占用输出文件，并加载正确的编译器开发环境；链接错误有时来自文件锁或环境变量缺失，而不是源代码错误。
- 多步骤任务应采用“小范围修改 → 定向编译/测试 → 再扩大范围”的节奏。遇到失败先判断是代码错误、环境问题、并发进程、缓存还是测试基线问题，不要在未定位原因前反复重试。
- 修改前后都要检查工作区范围。不要使用会清理或覆盖无关用户文件的命令；提交时精确选择相关文件，并通过 `git diff --check`、差异审查和测试结果确认改动没有夹带无关内容。
- 非平凡行为变更应同步更新设计文档、任务清单和测试；不要等全部代码完成后才补记录，否则容易遗漏已验证的约束和未完成事项。

## Commit & Pull Request Guidelines

Recent history uses short imperative commits, sometimes with `feat:` prefixes, for example `feat: Implement AskUserQuestion tool` or `Add unit tests for session serialization`. Keep commits focused and mention tests when relevant.

Pull requests should describe the behavior change, list verification commands, link related issues or OpenSpec changes, and include screenshots or terminal captures for visible TUI, web, or desktop changes.

## Security & Configuration Tips

Do not commit API keys, Copilot tokens, generated session data, local config contents, runtime daemon tokens, or memory files with private user data. Treat `--dangerous` mode as a local-only sandbox convenience and avoid recommending it without a clear warning.

On Windows PowerShell 5.1, avoid `Set-Content` and `Out-File` for files containing Chinese or other non-ASCII text because they can write BOMs or mojibake. Use editor-based edits or explicit UTF-8 without BOM APIs instead.
