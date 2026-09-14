# exec-command-policy Spec (delta)

## MODIFIED Requirements

### Requirement: 决策表
`ExecDecisionInput` SHALL 新增 `additional_requested`、`additional_covered`、`unattended`。在 forbidden 规则与 yolo / dangerous 之后,`unattended && (escalation_requested || (additional_requested && !additional_covered))` MUST 返回 `Forbidden`(reason `escalation_unattended`),沙盒取模式沙盒。`additional_requested && !additional_covered` 在越权申请之后 MUST 返回 `Prompt`(reason `additional_permissions_requested`),批准后的沙盒为 workspace-write(plan 为 read-only,沙盒不可用为 full-access)。会话授权已覆盖的申请按普通命令处理。

#### Scenario: 无人值守越权
- **WHEN** active goal 下模型带 `require_escalated` 调用 bash
- **THEN** 决策 Forbidden;AgentLoop 返回引导文案且不弹确认、不执行;去掉参数重试后在沙盒内执行

#### Scenario: 额外权限申请
- **WHEN** default 模式、沙盒可用,模型申请 `with_additional_permissions`
- **THEN** Prompt 且批准后沙盒为 workspace-write;plan 模式为 read-only

### Requirement: bash 升级参数
bash SHALL 接受 `sandbox_permissions`(`use_default` / `with_additional_permissions` / `require_escalated`)、`justification`、`additional_permissions { file_system { read[], write[] }, network { enabled } }`、`prefix_rule[]`;`with_escalated_permissions=true` MUST 等价 `require_escalated`。校验 MUST 在弹确认前完成:非 `use_default` 必须带非空 justification;`with_additional_permissions` 必须带非空 additional_permissions;路径必须是绝对 / 根路径或 `~` 开头;`use_default` 却带 additional_permissions 报错;`prefix_rule` 必须是非空字符串数组。`args.permission` MUST 带 `request`,并按需带 `additional_permissions`、`proposed_prefix_rule`、`unattended`。

#### Scenario: 参数错误不弹确认
- **WHEN** `sandbox_permissions=with_additional_permissions` 但缺 additional_permissions
- **THEN** 工具直接返回参数错误,确认回调不触发

### Requirement: 规则写回
系统 SHALL 提供 `derive_remember_patterns`(模型 `prefix_rule` 覆盖全部段且不在禁用名单时作为唯一 pattern,否则逐段取 `always_allow_prefix_tokens`;任一段推不出或命中禁用名单 → 空)、`is_banned_prefix`(移植 Codex BANNED_PREFIX_SUGGESTIONS 并补 cmd / PowerShell 拼写)、`append_prefix_rules`(创建目录与文件、去重、追加 `prefix_rule(pattern=[...], decision="allow")`)。全局目录里 `*.sandboxed.rules` MUST 按 `RuleScope::Sandboxed` 加载,allow 降级为 AllowSandboxed。

#### Scenario: 记住沙盒外批准
- **WHEN** 用户对越权申请 `pnpm install` 选 `allow_remember`
- **THEN** `default.rules` 追加 `prefix_rule(pattern=["pnpm", "install"], decision="allow")`,规则重载,随后 `pnpm install lodash` 不确认且沙盒外执行

#### Scenario: 记住沙盒内批准
- **WHEN** 用户对 auto 下 `git push --force` 的确认选 `allow_remember`
- **THEN** 写入 `default.sandboxed.rules`;再次 `git push --force` 仍因危险参数确认

#### Scenario: 禁用前缀
- **WHEN** 命令是 `rm -rf output` 或 `python -c '...'`
- **THEN** 不提供 `proposed_prefix_rule`,`allow_remember` 降级为会话允许
