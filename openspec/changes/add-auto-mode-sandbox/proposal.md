# Proposal: add-auto-mode-sandbox

## Why

现有三档权限里的「自动接收编辑」(`accept-edits`)只放行 `file_write` / `file_edit`,bash 仍然每条都弹确认,连 `git status`、`dir` 也不例外 —— bash 工具的 `is_read_only` 是静态 false,权限门没有任何命令级判断。用户体感是「选了自动模式还是一直在点确认」,于是要么退回 default 忍受,要么直接开 yolo 放弃全部保护。

Codex CLI 的「Auto」模式解决的正是这个矛盾,而且整套策略已开源(`openai/codex` 的 `codex-rs/core/src/exec_policy.rs`、`shell-command/src/command_safety/`、`execpolicy/`、`sandboxing/`):

1. **审批策略 `on-request`** 配 **沙盒策略 `workspace-write`**:模型在边界内自由干活(任意读、工作区内写、无网络),越界才停下来问。
2. **命令分类器 + 规则文件**:已知安全的只读命令直接跑;危险命令(`rm -rf`、`del /f`、`Remove-Item -Force` 等)即便在 Auto 下也一律弹确认;用户规则文件(`prefix_rule`)可把命令前缀声明为 `allow` / `prompt` / `forbidden`。
3. **越界升级协议**:命令在沙盒里因权限失败后,模型带 `with_escalated_permissions` 与 `justification` 重发,这时才弹给用户,用户同意后在沙盒外重跑。

本变更把 `accept-edits` 改造成对齐 Codex 的 `auto` 模式,并为 bash 引入操作系统级沙盒(Windows 受限令牌 / macOS Seatbelt / Linux bubblewrap)。在沙盒不可用的平台上,`auto` 退化为 Codex 在 Windows 沙盒关闭时的行为:安全命令自动跑,其余弹确认。

## What Changes

- **权限模式**:`PermissionMode::AcceptEdits` 改名为 `Auto`,线上名 `"auto"`;旧名 `accept-edits` / `acceptEdits` 保留为解析别名(config、会话 meta、CLI `--permission-mode`、`/mode`、REST)。Yolo 的过时描述文案("confirm first external file write")同步纠正。
- **命令分类器**(`src/sandbox/command_classifier.*`,纯函数):按 Codex 规则拆分 `&&` / `||` / `;` / `|`(只有整条脚本是"普通单词"时才拆,含重定向 / 变量 / 通配符 / 命令替换 / 控制流则整条保守处理),解包 `bash -lc` / `sh -c` / `cmd /c` / `powershell -Command` / `sudo` / `env`,输出 `KnownSafe` / `Dangerous` / `Unknown`。安全名单与危险名单同时覆盖 POSIX、cmd 与 PowerShell 三套拼写;引用敏感路径(`.ssh`、`.env`、`id_rsa`、`.aws` 等)的命令不算安全。
- **规则文件**(`src/sandbox/exec_rules.*`):加载 `<data_dir>/rules/*.rules`(全局)与 `<cwd>/.acecode/rules/*.rules`(项目),语法为 Codex `.rules` 的 `prefix_rule(pattern=[...], decision=..., justification=..., match=[...], not_match=[...])` 子集,文件可与 Codex 互通。多条命中取最严格(`forbidden` > `prompt` > `allow`)。全局 `allow` 在沙盒外直接跑;项目 `allow` 只免确认、仍在沙盒内跑(项目文件不可信,不能凭它绕过沙盒)。
- **决策表**(`src/sandbox/exec_decision.*`,纯函数,对齐 Codex `render_decision_for_unmatched_command_for_platform`):输入 模式 / 分类 / 规则结果 / 沙盒是否可用 / 是否请求升级 / 会话级放行,输出 `Allow` / `Prompt` / `Forbidden` 与本次执行用的沙盒策略(`full-access` / `workspace-write` / `read-only`)与提示原因。
- **bash 工具**:新增 `with_escalated_permissions`(bool)与 `justification`(string)两个参数;按 `ToolContext::exec_sandbox` 在沙盒内启动子进程;失败且疑似沙盒拒绝时在输出末尾附升级提示并置 `metadata.sandbox_denied`。
- **沙盒后端**(`src/sandbox/`):
  - Windows:`CreateRestrictedToken(WRITE_RESTRICTED | DISABLE_MAX_PRIVILEGE)`,限制 SID 列表 = {Everyone, 登录会话 SID, ACECode 合成 SID};在可写根(会话 cwd / 配置的 `writable_roots` / `%TEMP%`)上给合成 SID 打可继承的写 ACE,在受保护子路径(`.git/hooks`、`.git/config*`、`.git/modules`、`.acecode/rules`)上打拒绝写 ACE;`CreateProcessAsUserW` 启动 `cmd.exe`。子进程继承令牌,孙进程同样受限。**不断网**(断网需要管理员建防火墙规则,对齐 Codex unelevated 档)。
  - macOS:`/usr/bin/sandbox-exec -p <profile>`,profile 移植 Codex `seatbelt_base_policy.sbpl` + `seatbelt_network_policy.sbpl`,可写根用 `-D` 参数注入,`network_access=false` 时不放行网络。
  - Linux:`bwrap --ro-bind / / --bind <root> <root> ... --unshare-net --die-with-parent`,仅在 PATH 上找得到 `bwrap` 且用户命名空间探测通过时启用;绝不自动下载。
  - 任一平台不可用 → 沙盒策略退化为 `full-access`,决策表按"沙盒不可用"分支走(Auto 下未知命令改为弹确认)。
- **会话级「总是允许」改为按命令前缀记忆**(bash 专属):`git commit`、`pnpm test` 这类前缀被记住,不再是"本会话所有 bash 全放行"。升级审批通过后记住的前缀带 bypass 标记。
- **文件工具**新增内置拒绝规则:`file_write` / `file_edit` 对 `.acecode/rules/**` 拒绝,堵住"模型自己写 allow 规则"的回路(文件工具在 daemon 进程内执行,沙盒管不到它们)。
- **system prompt `# Environment`** 新增沙盒状态行与升级指引;bash 工具描述同步说明两个新参数。行文只随模式 / 配置变化,不打穿 prompt cache。
- **配置** `config.sandbox`:`enabled`(默认 true)、`network_access`(默认 false)、`writable_roots`(默认空)、`exclude_tmpdir`(默认 false),sparse-on-write。
- **`/sandbox` 命令**(TUI + daemon builtin + Web 斜杠):显示后端 / 可写根 / 受保护路径 / 网络策略;`/sandbox off|on` 会话级关闭 / 恢复(不落盘)。
- **前端**:模式选择器 `auto` = 「自动模式」;权限卡片显示提示原因(危险命令 / 升级申请 / 无沙盒)与模型给出的 justification;「本次会话允许」按钮文案带前缀。

## Capabilities

### New Capabilities

- `auto-permission-mode`:`auto` 模式的定义、别名兼容、四类工具在四种模式下的放行表、会话级前缀记忆、Yolo 文案纠正。
- `exec-command-policy`:命令分类器(拆分 / 解包 / 三态分类 / 敏感路径)、`.rules` 规则文件(语法子集 / 加载位置 / 合并 / 项目作用域降级)、决策表、升级参数与提示原因。
- `exec-sandbox`:三平台沙盒后端契约(可写根、受保护子路径、网络策略、不可用降级)、bash 沙盒启动与拒绝检测、system prompt / 工具描述 / `/sandbox` 命令 / 配置。

### Modified Capabilities

- `ask-question-policy`:场景「YOLO 不弹任何工具权限确认」与「YOLO 命中显式拒绝规则时静默阻止」保持不变;新增 `forbidden` 规则在 YOLO 下同样静默阻止的说明。

## Impact

- **权限层**:`src/permissions.hpp`(枚举改名、前缀级会话放行、文案)、`src/web/handlers/permission_mode_handler.cpp`、`src/config/config.cpp`(`normalize_permission_mode_name`)、`src/config/settings_mutations.cpp`、`src/session/session_storage.cpp` / `session_manager.cpp` / `session_registry.cpp`、`src/headless/headless_options.cpp` / `headless_runner.cpp`、`src/daemon/worker.cpp`、`src/tui/tui_init.cpp` / `mode_picker.cpp` / `settings/settings_center.cpp`、`src/commands/builtin_commands.cpp`(`/mode` 文案、`/sandbox`)、`src/main.cpp`。
- **新目录** `src/sandbox/`:`command_classifier`、`exec_rules`、`exec_decision`、`sandbox_policy`、`sandbox_denial`、`sandbox_runtime`、`sandbox_backend_{win,mac,linux}`。全部进 `acecode_testable`。
- **AgentLoop**:`src/agent_loop.cpp` 写工具分支对 `bash` 走新决策表;权限 prompt 的 args 附 `permission` 对象;AlwaysAllow 对 bash 记前缀;`ToolContext` 增 `exec_sandbox`。
- **工具**:`src/tool/bash_tool.cpp`(参数、沙盒启动、拒绝检测)、`src/tool/tool_executor.hpp`(`ToolContext`)。
- **Prompt**:`src/prompt/system_prompt.{hpp,cpp}`(`SystemPromptSandboxState`)。
- **配置**:`src/config/config.{hpp,cpp}`(`SandboxConfig`)。
- **前端**:`web/src/lib/permissionMode.js`、`lib/permissionRequestPresentation.js`、`components/PermissionCard.jsx`、i18n 目录。
- **文档**:`docs/sandbox.md`(新)、`docs/user-manual.md` §10、`docs/daemon-api.md`(模式取值、`permission_request` 新字段)、`CLAUDE.md`。
- **测试**:`tests/sandbox/*`(分类器 / 规则 / 决策表 / 可写根 / 拒绝检测 / Windows 受限令牌真机用例)、`tests/permissions_test.cpp`、`tests/agent_loop/agent_loop_auto_mode_test.cpp`、`web/src/lib/permissionMode.test.js`。

## Non-Goals

- Codex elevated 档(专用沙盒账户 + 防火墙断网 + 过 UAC 的 helper):本期 Windows 只做 unelevated 受限令牌,不断网。
- Codex 新一代 permissions profile(`:workspace` / `filesystem.deny` / 域名级网络策略)与 `mxc-sandbox` 后端。
- Linux Landlock + seccomp 自带 helper:本期只接系统已装的 `bwrap`。
- 文件工具(`file_write` / `file_edit`)进沙盒:它们在 daemon 进程内执行,继续由 `PathValidator` / write boundary 把关。
- 规则文件的图形化编辑器与 `acecode execpolicy check` 子命令。
