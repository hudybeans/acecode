# security-center Spec

## ADDED Requirements

### Requirement: 审计存储
系统 SHALL 提供进程级审计存储 `security::AuditLog`,落在 `<data_dir>/security/audit.sqlite3`。未 `configure` 时 `record` MUST 是 no-op。每条记录 MUST 含 `id`、`ts_ms`、`category`(command / file / tool / sandbox / rule)、`decision`(allow / allow_session / allow_scoped / allow_remember / deny / forbidden / blocked)、`source`(auto / rule / session / user / hook / headless / goal / sandbox / none)、`reason`、`tool`、`target`、`session_id`、`cwd`、`sandbox`、`detail`(JSON)。行数超过 20000 时 MUST 丢弃最旧记录。

#### Scenario: 记录与分页查询
- **WHEN** 写入 3 条记录后按 `limit=2` 查询,再以 `before_id` 续页
- **THEN** 第一页按 id 倒序返回最新 2 条且 `has_more=true`,第二页返回剩下 1 条

#### Scenario: 筛选
- **WHEN** 按 `category=sandbox`、`decision=blocked`、`since_ms`、关键字 `q` 组合查询
- **THEN** 只返回同时满足全部条件的记录

#### Scenario: 上限与清空
- **WHEN** 记录数超过上限
- **THEN** 最旧的被删除,总数不超过上限;`clear()` 后总数为 0

### Requirement: 审批门记录点
AgentLoop SHALL 在审批门对每个「决定已作出」的分支记录一条审计:bash 的 forbidden / 自动放行 / 用户或 hook / headless / goal 决策、写文件工具与其它需确认工具的决策、文件工具硬拒绝、沙盒拒绝(category=sandbox,target=被拒路径)、`allow_remember` 写回与会话授权(category=rule)。只读工具的自动放行 MUST NOT 记录。接收器 MUST 可注入(`set_audit_sink`)。

#### Scenario: auto 模式自动放行
- **WHEN** auto 模式下模型执行 `git status`
- **THEN** 记录 category=command、decision=allow、source=auto、sandbox=模式沙盒

#### Scenario: 用户拒绝
- **WHEN** 模型执行需确认的命令,用户选 deny
- **THEN** 记录 decision=deny、source=user

#### Scenario: 沙盒拒绝
- **WHEN** bash 在沙盒里失败且 `metadata.sandbox_violation.path` 非空
- **THEN** 额外记录 category=sandbox、decision=blocked、target=该路径

#### Scenario: 只读工具不记
- **WHEN** 模型调用 file_read 并被自动放行
- **THEN** 不产生审计记录

### Requirement: 沙盒配置端点
daemon SHALL 提供 `GET /api/config/sandbox` 返回 `{enabled, network_access, deny_defaults, filesystem:{read[],write[],deny[]}, windows_backend, writable_roots, exclude_tmpdir, defaults:{deny[]}, platform:{os, backend, available, reason, network_enforced, network_best_effort, read_isolation}}`;`PUT /api/config/sandbox` 接受前四项(filesystem 三张清单整体替换),校验后写 `config.json`,并 MUST 把新配置下发到 daemon 内所有活跃会话。

#### Scenario: 保存清单并下发
- **WHEN** PUT `{filesystem:{deny:["~/.ssh", "**/.env"]}}`
- **THEN** 200 返回与 GET 同形的快照;`config.json` 的 `sandbox.filesystem.deny` 为该列表;活跃会话的沙盒策略随即包含这两条

#### Scenario: 非法条目
- **WHEN** PUT 的 write 清单含相对路径 `src`
- **THEN** 400 `{error:"BAD_REQUEST", field, message}`,配置不变

### Requirement: 命令规则端点
daemon SHALL 提供 `GET /api/security/exec-rules` 返回 `{dir, files:[{name, path, managed, scope, error, rules:[{pattern:[[...]], decision, justification}]}]}`;`PUT /api/security/exec-rules` 接受 `{files:{"default.rules":[...], "default.sandboxed.rules":[...]}}`,只允许这两个托管文件,整体重写,写前 MUST 往返解析校验;`allow` 规则的前缀命中禁用名单 MUST 400。PUT 后活跃会话 MUST 重载规则。

#### Scenario: 增删规则
- **WHEN** PUT 让 `default.rules` 只剩 `git push`(prompt)与 `pnpm test`(allow)
- **THEN** 文件内容为两行 `prefix_rule(...)`,GET 回读一致,随后会话里 `pnpm test` 免确认

#### Scenario: 禁用前缀
- **WHEN** PUT 在 `default.rules` 写入 `rm` 的 allow 规则
- **THEN** 400 指出该前缀不能放行,文件不变

#### Scenario: 非托管文件
- **WHEN** PUT 的 files 含 `custom.rules`
- **THEN** 400,任何文件不变

### Requirement: 审计端点
daemon SHALL 提供 `GET /api/security/audit`(`category` / `decision` / `since_ms` / `before_id` / `q` / `limit`,返回 `{entries, has_more, total}`)、`GET /api/security/audit/summary`(`{total, by_decision, by_category, last_ts_ms, blocked_paths:[{path, count, last_ts_ms}]}`)、`GET /api/security/audit/export?format=jsonl|csv`(附件)与 `DELETE /api/security/audit`。

#### Scenario: 导出
- **WHEN** GET export?format=csv
- **THEN** 响应 `text/csv` 带表头与 `Content-Disposition: attachment`

### Requirement: 设置页
Web 设置 SHALL 在「编码」组新增「安全中心」,含概览(沙盒开关、网络、默认禁止名单、平台状态、审计摘要)、文件安全(三张清单编辑 + 最近被拦路径一键加入)、命令安全(托管规则表增删改 + 非托管文件只读)、审计中心(筛选、导出、清空)。Windows 上 MUST 标注读清单与禁止名单只拦写。

#### Scenario: 一键加入
- **WHEN** 文件安全页显示最近被拦路径 `D:\data\out`,用户点「加入可写」
- **THEN** 草稿 write 清单追加该路径所在目录并保存
