# Tasks: add-security-center

## 1. 审计存储

- [x] 1.1 `src/security/audit_log.{hpp,cpp}`:`AuditEntry` / `AuditQuery` / `AuditPage` / `AuditSummary`;SQLite 单表、WAL、上限 20000、`record` / `query` / `summary` / `clear` / `blocked_paths`
- [x] 1.2 三个入口(worker / TUI main / headless)启动 `configure(get_acecode_dir())`
- [x] 1.3 测试:`tests/security/audit_log_test.cpp`

## 2. AgentLoop 记录点

- [x] 2.1 `set_audit_sink`;审批门各分支 `audit_gate` / `record_audit`;post-exec 沙盒拒绝;remember / grant
- [x] 2.2 测试:`agent_loop_auto_mode_test.cpp` 注入 sink,覆盖自动放行 / 用户拒绝 / 规则禁止 / 沙盒拒绝 / remember(同会话内规则被会话前缀记忆抢先,来源记 session)

## 3. 规则文件重写

- [x] 3.1 `format_prefix_rule_full` / `render_rules_file` / `write_rules_file` / `is_managed_rules_file` / `rules_file_scope`
- [x] 3.2 测试:`exec_rules_test.cpp` 往返 / 空表 / 校验失败不落盘

## 4. REST

- [x] 4.1 `src/web/handlers/security_handler.{hpp,cpp}` 纯函数:沙盒快照 / PUT 解析校验、规则文件快照 / PUT 解析校验(禁用名单 + 危险首 token)、审计查询解析、导出文件名
- [x] 4.2 `src/web/routes/routes_security.cpp`:`/api/config/sandbox`、`/api/security/exec-rules`、`/api/security/audit*`;`SessionRegistry::refresh_sandbox_config` / `refresh_exec_rules`
- [x] 4.3 测试:`tests/web/security_handler_test.cpp` + `web_server_smoke_test.cpp` 三条 `SecurityCenterSmoke.*`

## 5. Web

- [x] 5.1 `settingsNavigation.js` 新增 security;`settingsNavigation.test.js` 键表与分组;`settingsSearch.js` 条目;`errors.js` 错误码
- [x] 5.2 `lib/securityCenter.js` 纯逻辑 + `securityCenter.test.js`(登记 runTests.js);`api.js` 端点
- [x] 5.3 `components/SecurityCenterSettings.jsx` 四个分页;SettingsPage 挂载
- [x] 5.4 i18n:`i18n-en-overrides.mjs`(189 条)+ `pnpm i18n:catalog`;`pnpm test` / `pnpm build` 通过

## 6. 文档与收尾

- [x] 6.1 `docs/daemon-api.md` 端点索引 + Security center 章节;`docs/sandbox.md` 安全中心一节;`CLAUDE.md`
- [x] 6.2 构建 + 定向单测(AuditLog / SecurityHandler / ExecRules / AgentLoopAutoMode / SecurityCenterSmoke)+ 提交

## 7. Cross-platform Release Validation

- [x] 7.1 Use host-native absolute paths in sandbox persistence tests and verify Windows-path rejection on Unix.
