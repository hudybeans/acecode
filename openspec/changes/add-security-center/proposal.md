# Proposal: add-security-center

## Why

`align-codex-sandboxing` 把沙盒的数据模型对齐到了 Codex:读 / 写 / 禁止三类路径清单、命令前缀规则文件、`allow_remember` 写回、拒绝分类。但这些能力目前只有两条入口:手改 `config.json` 与手改 `<data_dir>/rules/*.rules`。用户在 Desktop 里看不到自己有哪些规则、被拦过什么路径、AI 哪条命令是自动放行的,更没法在界面上改。对照 WorkBuddy 的「安全中心」(沙箱安全总开关 / 文件安全 / 命令安全 / 审计中心),缺的是一层设置界面、几个 REST 端点和一个可查询的审计存储。

本期只做用户点名的四块:**沙箱开关、文件安全、命令安全、审计中心**。不做自动备份、网络域名规则、敏感内容扫描、删除保护、内置运行时开关。

## What Changes

- **审计存储**:新增 `src/security/audit_log`,进程级单例,SQLite 落在 `<data_dir>/security/audit.sqlite3`。AgentLoop 审批门是唯一记录入口:bash 的每次决策(自动放行 / 规则禁止 / 用户批准或拒绝 / hook / 无人值守 / headless)、写文件工具与其它需确认工具的决策、沙盒拒绝(含被拒路径)、规则写回与会话授权。行数上限 20000,超出丢最旧;提供清空。
- **REST**:
  - `GET/PUT /api/config/sandbox`:沙盒总开关、网络、默认禁止名单开关、读 / 写 / 禁止三张清单;PUT 写 `config.json` 并实时下发到 daemon 内所有活跃会话。响应附平台探测结果(后端、可用性、网络是否真隔离、读隔离是否生效)与内置默认 deny 名单。
  - `GET/PUT /api/security/exec-rules`:列出全局规则目录下所有 `*.rules` 文件;`default.rules` / `default.sandboxed.rules` 两个「ACECode 维护」文件可整体重写(增删改前缀 / 决策 / 说明),其它文件只读展示。PUT 后活跃会话重载规则。
  - `GET /api/security/audit`(筛选 + 分页)、`GET /api/security/audit/summary`(计数 + 最近被拦路径)、`GET /api/security/audit/export`(JSONL / CSV)、`DELETE /api/security/audit`(清空)。
- **Web 设置页**:设置 > 编码 新增「安全中心」,内含四个分页:概览(沙箱开关、网络、平台状态、审计摘要卡)、文件安全(三张清单 + 最近被拦路径一键加入)、命令安全(前缀规则表:放行·沙盒外 / 放行·沙盒内 / 询问 / 禁止)、审计中心(类型 / 结果 / 时间 / 关键字筛选,导出,清空)。
- **命令规则序列化**:`exec_rules` 新增带 decision / justification / 候选并集的完整格式化与「整文件重写」函数。

## Capabilities

### New Capabilities

- `security-center`:审计存储与记录点、安全中心 REST、设置页。

### Modified Capabilities

- `exec-command-policy`:两个「ACECode 维护」规则文件可被整体重写;规则重载可由 daemon 触发。
- `exec-sandbox`:`config.sandbox` 可经 REST 修改并实时下发到活跃会话。

## Non-goals

- 自动备份 / 备份上限(已有 per-turn 检查点与 /rewind)。
- 网络域名规则(需要本地代理,另立项)。
- 敏感信息内容扫描、删除保护、批量删除审批、内置运行时开关。
- TUI 侧的审计查看命令(TUI 进程照样记审计,但只在 Web 里看)。
- 项目级 `.acecode/rules` 的界面编辑(设置页是全局的,项目规则不在这里管)。
