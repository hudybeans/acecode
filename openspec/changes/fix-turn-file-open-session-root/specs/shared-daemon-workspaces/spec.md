## MODIFIED Requirements

### Requirement: Workspace-aware session lifecycle
守护进程 SHALL 使用明确的工作区标识创建、列出、恢复和销毁会话。工作区范围内的恢复请求仅在会话确实属于该工作区时 SHALL 成功。桌面端收到陈旧的工作区标识、但目标实际为无工作区会话时 SHALL 保留会话真实归属及工作目录。

#### Scenario: Create session in selected workspace
- **WHEN** 客户端在工作区 `A` 创建会话
- **THEN** 守护进程 MUST 使用工作区 `A` 的工作目录作为会话执行目录
- **THEN** 响应 MUST 包含会话 ID 和工作区 hash

#### Scenario: List sessions for selected workspace
- **WHEN** 客户端列出工作区 `A` 的会话
- **THEN** 守护进程 MUST 返回存储在工作区 `A` 的运行中及历史会话
- **THEN** 其他工作区的会话 MUST NOT 出现在该响应中

#### Scenario: Resume persisted session in selected workspace
- **WHEN** 客户端在工作区 `A` 恢复历史会话 `S`
- **THEN** 守护进程 MUST 从工作区 `A` 的项目存储恢复 `S`
- **THEN** 该操作 MUST NOT 启动额外的守护进程

#### Scenario: 工作区接口拒绝运行中的无工作区会话
- **WHEN** 客户端通过工作区 `A` 的接口恢复运行中的无工作区会话 `S`
- **THEN** 工作区范围内的请求 MUST 返回“会话不存在”
- **AND** `S` MUST 保留无工作区归属和原工作目录

#### Scenario: 修正桌面端陈旧的工作区提示
- **WHEN** 桌面端带陈旧的工作区 hash 跳转到无工作区会话
- **THEN** 界面 MUST 使用该会话真实的无工作区归属和工作目录
- **AND** 轮次“已修改文件”列表中的相对文件路径 MUST 从该目录打开
- **AND** “查看变更” MUST 继续展示该轮记录的差异
