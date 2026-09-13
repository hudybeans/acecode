# Tasks: add-auto-mode-sandbox

## 1. 权限模式改名与别名

- [x] 1.1 `src/permissions.hpp`:`AcceptEdits` → `Auto`(name `"auto"`),新增静态 `parse_mode_name`(接受 `auto` / `accept-edits` / `acceptEdits` / `default` / `plan` / `yolo`),`mode_description` 更新 auto 与 yolo 文案;新增前缀级会话放行 API(`add_session_command_allow` / `session_command_allow` / `clear_session_allows` 一并清)
- [x] 1.2 统一各解析点调用 `parse_mode_name`:`config.cpp::normalize_permission_mode_name`、`settings_mutations.cpp`、`session_storage.cpp`、`session_manager.cpp`、`session_registry.cpp`、`headless_options.cpp` / `headless_runner.cpp`、`daemon/worker.cpp`、`tui/tui_init.cpp`、`commands/builtin_commands.cpp`(`/mode` 用法文案)、`web/handlers/permission_mode_handler.cpp`、`tui/settings/settings_center.cpp` 列表
- [x] 1.3 `tests/permissions_test.cpp` 更新:Auto 放行表、前缀记忆、别名解析
- [x] 1.4 三个启动路径的内置 Deny 规则加 `.acecode/rules/**`(`main.cpp` / `tui_init.cpp` / `worker.cpp` / `headless_runner.cpp` 共用处)

## 2. 命令分类器与规则文件(纯函数)

- [x] 2.1 `src/sandbox/command_classifier.{hpp,cpp}`:tokenizer(POSIX/cmd/PowerShell 引号)、拆段判定、包装解包、安全名单、危险名单、敏感路径检查
- [x] 2.2 `src/sandbox/exec_rules.{hpp,cpp}`:`.rules` 子集解析器、加载目录、匹配与合并、项目作用域降级
- [x] 2.3 `src/sandbox/exec_decision.{hpp,cpp}`:决策表 + `always_allow_prefix` 计算
- [x] 2.4 `tests/sandbox/command_classifier_test.cpp`、`exec_rules_test.cpp`、`exec_decision_test.cpp`(中文注释,场景 / 期望明确)

## 3. 沙盒策略与后端

- [x] 3.1 `src/sandbox/sandbox_policy.{hpp,cpp}`:`SandboxPolicy` / `WritableRoot` / `compute_writable_roots`(含 gitdir 解析与只读子路径)
- [x] 3.2 `src/sandbox/sandbox_denial.{hpp,cpp}`:`is_likely_sandbox_denied` + 升级提示文案
- [x] 3.3 `src/sandbox/sandbox_runtime.{hpp,cpp}`:进程级探测缓存、`SandboxConfig` 接入、状态文本、测试用可用性覆盖
- [x] 3.4 `src/sandbox/sandbox_backend_win.cpp`:合成 SID、登录 SID、受限令牌、ACE 幂等写入、`CreateProcessAsUserW` 启动辅助
- [x] 3.5 `src/sandbox/sandbox_backend_posix.cpp`:seatbelt policy 组装 + argv、bwrap argv + 探测
- [x] 3.6 `tests/sandbox/sandbox_policy_test.cpp`、`sandbox_denial_test.cpp`、`sandbox_backend_posix_test.cpp`(argv / policy 字符串纯逻辑)、`sandbox_backend_win_test.cpp`(真机:令牌创建、ACE、工作区内外写、受保护子路径;策略拒绝时 GTEST_SKIP)

## 4. bash 工具与 ToolContext

- [x] 4.1 `src/tool/tool_executor.hpp`:`ToolContext::exec_sandbox`(`ExecSandboxRequest`)
- [x] 4.2 `src/tool/bash_tool.cpp`:新参数解析与校验(升级需 justification)、Windows 走令牌启动、POSIX 走 argv 前缀、拒绝检测 + 提示 + metadata、`summary.metrics` 加 `sandbox`
- [x] 4.3 bash 工具描述更新(参数说明、沙盒语义一句话)

## 5. AgentLoop 决策接入

- [x] 5.1 写工具分支对 `bash`:解析升级参数 → 分类 → 规则 → 决策;Forbidden 直接返回错误;Prompt 走既有 prompter,args 附 `permission` 对象;Allow / 批准后按 `ExecDecision::sandbox` 构造 `exec_sandbox` 注入
- [x] 5.2 AlwaysAllow 对 bash 记前缀(bypass 标记随升级申请)
- [x] 5.3 `/sandbox off|on` 的会话级开关字段与 `set_exec_rules` / 规则加载时机(会话创建 + cwd 切换时重载)
- [x] 5.4 `tests/agent_loop/agent_loop_auto_mode_test.cpp`:安全命令免确认、危险命令确认、沙盒不可用时未知命令确认、沙盒可用时未知命令免确认、升级申请确认并透传 justification、forbidden 不确认不执行、前缀记忆生效

## 6. system prompt / 配置 / 命令 / 前端

- [x] 6.1 `src/prompt/system_prompt.{hpp,cpp}`:`SystemPromptSandboxState` 参数 + `# Environment` 沙盒行与升级指引;`tests/prompt/system_prompt_test.cpp` 加用例(含 byte-stable)
- [x] 6.2 `src/config/config.{hpp,cpp}`:`SandboxConfig` 解析 / 保存 / 校验;`tests/config/` 加 round-trip 用例
- [x] 6.3 `/sandbox` 命令:`builtin_commands.cpp`(TUI)+ `session_registry.cpp::execute_builtin_command` 白名单 + `commands_handler` 斜杠清单;共用 `sandbox::status_text`
- [x] 6.4 前端:`permissionMode.js`(`auto` 标签 / 别名归一)、`permissionRequestPresentation.js`(reason → 标题 / 正文 / justification / 前缀按钮文案)、`PermissionCard.jsx`、i18n overrides + catalog 重生成、`permissionMode.test.js` 更新
- [x] 6.5 TUI 确认框:参数区上方显示 `permission.reason` 文案与 justification

## 7. 文档与收尾

- [x] 7.1 `docs/sandbox.md`(新):模式对照表、决策表、规则文件语法与位置、三平台后端与限制(Windows 不断网 / Everyone 可写目录、macOS/Linux 需求)、升级协议、`/sandbox`、配置
- [x] 7.2 `docs/user-manual.md` §10、`docs/daemon-api.md`(模式取值、`permission_request.args.permission`)、`CLAUDE.md` 新增「Auto 模式与 exec 沙盒」一节
- [x] 7.3 `acecode_testable` + `acecode_unit_tests` Release 构建通过;`tests/sandbox/*`、`permissions_test`、`agent_loop_auto_mode_test`、`system_prompt_test`、config 用例通过;Web `pnpm test` 通过
- [x] 7.4 Windows 真机冒烟:auto 模式下 `git status` 免确认、`echo > %USERPROFILE%\x` 在沙盒内失败并附升级提示、升级后确认弹出、`rm -rf` 弹确认
