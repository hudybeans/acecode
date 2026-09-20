# Tasks: centralize-tui-logs

## 1. TUI logger initialization

- [x] 1.1 Replace the interactive TUI startup use of workspace-local `Logger::init(.../acecode.log)` with `Logger::init_with_rotation(get_logs_dir(), "tui", false)` while preserving debug log level and startup diagnostics.
- [x] 1.2 Reconcile the duplicate initialization helper in `src/tui/tui_init.*` so it cannot retain or reintroduce workspace-local primary logging.
- [x] 1.3 Add focused native coverage proving the TUI logger uses the shared logs directory, `tui-YYYY-MM-DD.log` naming, no stderr mirror, and does not select the workspace as the primary log destination.

## 2. FTXUI input-trace destination

- [x] 2.1 Add a TUI-startup environment bridge that supplies FTXUI the effective ACECode logs directory before input processing starts.
- [x] 2.2 Change the opt-in FTXUI trace writer to create and append `tui-input-trace-YYYY-MM-DD.log` below that directory, with local-date rollover and no relative-path fallback.
- [x] 2.3 Bump the FTXUI overlay port version so vcpkg rebuilds the source-backed dependency.
- [ ] 2.4 Add focused coverage for trace-path selection and local-date filename generation without requiring an interactive terminal; verify an input-trace-enabled build does not create workspace/worktree `acecode.log`.

## 3. Feedback runtime-log collection

- [x] 3.1 Preserve the GUI/Desktop runtime-log selector as Desktop + daemon only; add a TUI feedback selector that returns latest TUI + daemon logs and excludes Desktop logs.
- [x] 3.2 Remove the TUI `/feedback` command's explicit `<cwd>/acecode.log` source and use the TUI centralized selector.
- [x] 3.3 Add feedback-package tests covering latest TUI log selection, TUI exclusion of Desktop logs, GUI/Desktop exclusion of TUI logs, missing TUI logs, and exclusion of a workspace-local legacy `acecode.log`.

## 4. Documentation

- [x] 4.1 Update the user-manual logging FAQ to describe `<数据目录>/logs/tui-YYYY-MM-DD.log`, the opt-in `tui-input-trace-YYYY-MM-DD.log`, and the preservation of legacy workspace files.
- [x] 4.2 Update MCP failure troubleshooting text to direct users to the centralized TUI dated log.
- [x] 4.3 Update daemon API feedback-package documentation if its runtime-log attachment listing needs to name `logs/tui.log.tail.txt`.

## 5. Verification

- [x] 5.1 Run the focused logger, FTXUI trace-path, and feedback native tests.
- [ ] 5.2 Configure and build an input-trace-enabled TUI executable with the bumped FTXUI port, then verify normal-workspace and `--worktree` runs leave no trace-created `acecode.log`.
- [x] 5.3 Review the documentation diff and verify normal-TUI and FTXUI input-trace documentation no longer directs users to workspace-local `acecode.log`.

## 6. PR 审核修复

- [x] 6.1 修复 Windows UTF-8 日志目录首次创建，覆盖中文用户目录及重定向目录。
- [x] 6.2 主日志与 FTXUI 输入追踪使用操作系统追加语义，避免多进程 seek/write 竞争覆盖记录。
- [x] 6.3 增加并运行中文路径、多进程完整记录、追踪路径与不可写目标的独立回归，记录验证边界。
- [x] 6.4 将 PR 新增根目录 CONTEXT.md 的术语移入已有反馈 ADR，保持根目录规范；现存同名引用均指 OpenCode 竞品文档。

审核验证：Windows MSVC 独立 fixture 的 4 项 Python 回归和 10 项 LoggerRotationTest 通过；主日志、低层追加和 FTXUI 输入追踪各 4 进程 × 2000 条，均收到 8000 条完整唯一记录。中文新目录、追踪本地午夜、空/相对/不可打开目录均通过；开启 `ACECODE_TUI_INPUT_TRACE=1` 的真实 FTXUI app.cpp 定向编译通过。完整交互式 TUI 与非 Windows 实机验证仍由 5.2 和后续构建覆盖，不将 fixture 测试记作完整 TUI 运行。

合并验证：canonical 的 MSVC MinSizeRel 主程序、Desktop 与测试程序构建通过；138 项日志、反馈、电脑操控相关测试和真实 `runtime_log_append` ctest 通过。
