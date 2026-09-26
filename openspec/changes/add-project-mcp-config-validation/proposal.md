## Why

MCP 当前只有公共配置，启动、HTTP 与 TUI 分别解析，错误字段可能被静默忽略。需要每个项目独立配置，拒绝无效修改，并防止共享 daemon 中的工具跨项目串用。

## What Changes

- 新增项目 `.acecode/mcp.json`，叠加公共配置，同名条目仅在本项目覆盖公共定义。
- 统一使用 ACECode 客户端配置 JSON Schema。用户已确认校验配置文件；提供的 MCP 2026-07-28 Schema 描述协议消息，本次不升级协议。
- 应用管理的写入先校验，再持久化并更新运行时；失败返回 JSON Pointer 诊断和完整 Schema。
- 启动前校验，各配置文件保存独立有效快照；无效配置恢复该范围的上次有效配置，无快照则报告错误。
- 设置支持项目选择和 Schema 查看，TUI 与通用文本编辑接入相同校验。

## Capabilities

### New Capabilities

- `scoped-mcp-configuration`：公共/项目配置、运行时隔离、统一校验与恢复。

### Modified Capabilities

无。本 checkout 没有已有主规格。

## Impact

配置读写、MCP 运行时、会话能力策略、HTTP 与 TUI、通用文件编辑、网页设置、测试和文档。已有公共 API 保持兼容，无第三方代码变更。
