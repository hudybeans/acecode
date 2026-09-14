# Tasks: align-codex-sandboxing

## 0. 无人值守越权漏洞

- [x] 0.1 `ExecDecisionInput::unattended`;`decide_exec` 在 yolo 之后对越权 / 额外权限申请返回 Forbidden(`escalation_unattended`)
- [x] 0.2 AgentLoop 传入 `goal_unattended_active()`,对该 reason 返回引导文案
- [x] 0.3 测试:`exec_decision_test` + `agent_loop_goal_test`(无人值守越权申请不执行、不弹确认、文案引导)

## 1. 权限清单模型

- [x] 1.1 `SandboxPolicy` 新增 `readable_roots / denied_paths / denied_globs`;`SandboxPolicyOptions` 新增 read / write / deny 条目与会话授权;记号解析(`~`、`:workspace_roots`、`:tmpdir`)
- [x] 1.2 `resolve_access / can_write / can_read`;`describe_policy` 与 `/sandbox` 状态展示 deny 与可读根
- [x] 1.3 `config.sandbox.filesystem.{read,write,deny}`、`deny_defaults`、`windows_backend` 解析与 sparse 落盘
- [x] 1.4 测试:`sandbox_policy_test`、`config_sandbox_test`

## 2. 拒绝分类与额外权限

- [x] 2.1 `classify_sandbox_violation` + `metadata.sandbox_violation`;提示文案带路径与最小申请建议
- [x] 2.2 bash 参数:`sandbox_permissions` / `additional_permissions` / `prefix_rule`;校验;决策表 4a;会话授权 `SessionGrants`
- [x] 2.3 AgentLoop:记最近被拒路径;payload 带 `scoped_write_root` / `additional_permissions` / `proposed_prefix_rule`;`AllowScoped` 处理
- [x] 2.4 协议:`PermissionResult` / `PermissionDecisionChoice` / 字符串映射 / routes_ws / subagent_host / hooks
- [x] 2.5 Web:`permissionRequestPresentation.js` + `PermissionCard.jsx` 新按钮;TUI:确认框动态选项
- [x] 2.6 测试:`sandbox_denial_test`、`exec_decision_test`、`agent_loop_auto_mode_test`、web 测试

## 3. 批准并记住

- [x] 3.1 `exec_rules`:禁用前缀名单、前缀推导、`append_prefix_rules`、`RuleScope::Sandboxed` 与 `*.sandboxed.rules`
- [x] 3.2 AgentLoop `AllowRemember`:分流写文件 + reload
- [x] 3.3 测试:`exec_rules_test`、`agent_loop_auto_mode_test`

## 4. 平台

- [x] 4.1 Windows:准断网环境、denybin 桩、`network_best_effort` 状态
- [x] 4.2 Windows:Job Object 超时 / 中止杀树
- [x] 4.3 Windows:`BackendKind::WindowsMxc` + `windows_backend` 配置 + 占位探测
- [x] 4.4 macOS:可读根 / deny / glob / unlink / 平台默认 / preferences
- [x] 4.5 Linux:deny 路径最小支持(tmpfs / null bind),保持既有探测
- [x] 4.6 测试:`sandbox_backend_posix_test`、`sandbox_backend_win_test`

## 5. Deny 规则硬拒绝收窄

- [x] 5.1 `PermissionManager::matched_rule_detail`;AgentLoop 只对 priority ≥ 1000 或 yolo 硬拒绝
- [x] 5.2 测试:`permissions_test` / `agent_loop` 用例

## 6. 提示、文档

- [x] 6.1 bash 工具描述与 system prompt 沙盒指引更新(`system_prompt_test` byte-stable 用例同步)
- [x] 6.2 `docs/sandbox.md`、`docs/daemon-api.md`、CLAUDE.md、openspec spec
- [ ] 6.3 全量单测 + web 测试 + 构建
