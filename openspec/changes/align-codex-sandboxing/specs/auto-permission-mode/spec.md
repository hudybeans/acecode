# auto-permission-mode Spec (delta)

## MODIFIED Requirements

### Requirement: 审批决策
`PermissionResult` / `PermissionDecisionChoice` SHALL 新增 `AllowScoped`(`allow_scoped`)与 `AllowRemember`(`allow_remember`)。Web / TUI MUST 只在 payload 提供 `scoped_write_root` / `proposed_prefix_rule` 时展示对应选项;服务端收到不适用的 `allow_scoped` MUST 按 `allow` 处理、`allow_remember` 按 `allow_session` 处理。`allow_scoped` MUST 把建议目录记进会话授权并让命令留在 workspace-write 沙盒内执行,MUST NOT 记 bypass 前缀。额外权限申请的 `allow_session` MUST 记住申请的权限而不是命令前缀。hooks 的 `permission_resolved.decision` MUST 透传 `allow_scoped` / `allow_remember`。

#### Scenario: 只放行被拒目录
- **WHEN** 上一次沙盒运行被拒于 `<outside>/x.txt`,模型带越权申请重试,用户选 `allow_scoped`
- **THEN** 确认 payload 带 `denied_path` 与 `scoped_write_root=<outside>`;命令在 workspace-write 里执行且可写根含 `<outside>`;随后同前缀命令仍进沙盒;成功执行后再次越权申请不再提供该选项

#### Scenario: 旧客户端
- **WHEN** 客户端对没有 `scoped_write_root` 的请求发送 `allow_scoped`
- **THEN** 按 `allow` 执行一次

### Requirement: Deny 规则的硬拒绝范围
AgentLoop 对文件工具的硬拒绝 SHALL 只在命中 priority ≥ 1000 的内置保护规则(`.acecode/rules/**`)或 yolo 模式时生效;其它 Deny 命中 MUST 回到弹确认。bash 的配置 Deny MUST 仍映射为 exec forbidden。

#### Scenario: `.env` 写入弹确认
- **WHEN** 配置 Deny 规则命中 `file_write .env`(priority 10)
- **THEN** 弹确认,批准后执行;priority 1000 的规则命中时不弹确认、直接拒绝

### Requirement: 会话记忆清理
切换权限模式、cwd 或 `/sandbox on|off` MUST 同时清空会话前缀记忆、会话授权与最近一次沙盒拒绝记录。

#### Scenario: /sandbox off
- **WHEN** 会话有 write 授权且用户 `/sandbox off`
- **THEN** `/sandbox` 状态不再显示 Session grants
