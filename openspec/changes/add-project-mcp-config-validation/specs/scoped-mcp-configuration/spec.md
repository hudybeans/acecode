## Purpose

支持公共与项目 MCP 配置、统一校验、隔离项目工具，并恢复外部无效编辑之前的有效配置。

## ADDED Requirements

### Requirement: 项目配置叠加公共配置
系统 SHALL 独立加载项目 `.acecode/mcp.json`。项目条目 SHALL 仅在本项目替换同名公共条目，包括 disabled 条目；其他公共服务器保持可用。共享 daemon 的项目工具 SHALL 不可由其他项目使用。

#### Scenario: 两个项目覆盖同名服务器
- **WHEN** 项目 A、B 为同名服务器配置不同命令
- **THEN** 各自发现并调用对应服务器，公共配置和另一项目保持不变

#### Scenario: 项目禁用继承的服务器
- **WHEN** 项目定义与公共服务器同名的 disabled 条目
- **THEN** 该项目默认会话不能通过此名称回退调用公共服务器

### Requirement: 受管理编辑在修改前校验
系统 SHALL 对 MCP API 写入、开关、TUI 编辑、通用配置保存和受管理文本编辑使用同一配置 JSON Schema。无效 JSON 或 Schema 错误 SHALL 保持配置、快照与运行时注册不变；错误 SHALL 包含字段路径和完整 Schema，不回显认证信息。

#### Scenario: 任一范围的替换内容无效
- **WHEN** 写入含错误传输方式、字段类型、缺失必填字段、无效 URL 或超时值
- **THEN** 拒绝整次修改，返回错误和 Schema，保留之前的配置

#### Scenario: 编辑隐藏认证字段
- **WHEN** 保存时省略读取 API 隐藏的认证字段
- **THEN** 保留同名服务器的原认证值，显式空字符串仍可清除该值

#### Scenario: 有效快照持久化失败
- **WHEN** 合法配置已写入，但快照无法保存
- **THEN** 活动文件恢复写入前内容，不发布候选状态到内存和运行时

### Requirement: 启动只恢复无效的 MCP 范围
系统 SHALL 在启动服务器前校验并按范围保留上次有效配置。校验失败 SHALL 再次验证快照、归档无效原文并恢复该范围，保留无关设置；不得启动无效配置或只接纳其中的合法条目。

#### Scenario: 外部编辑破坏一个项目
- **WHEN** 已有有效配置的项目文件变为无效
- **THEN** 启动恢复该项目上次有效配置，公共配置和其他项目不变

#### Scenario: 公共 MCP 段无效且其他设置已变更
- **WHEN** 公共 MCP 段无效，同时存在合法的其他设置修改
- **THEN** 仅恢复 MCP 段，保留其他修改

#### Scenario: 不存在有效回退配置
- **WHEN** 当前配置无效且快照缺失或无效
- **THEN** 返回 Schema 诊断，不启动无效范围中的服务器

### Requirement: 区分配置 Schema 与协议 Schema
系统 SHALL 将其校验标为 ACECode 客户端配置 Schema，并引用 MCP 规范，不得将配置规则表述为官方协议消息 Schema。

#### Scenario: 编辑器收到校验错误
- **WHEN** 设置修改未通过校验
- **THEN** 显示字段错误，保留草稿，并允许查看完整配置 Schema
