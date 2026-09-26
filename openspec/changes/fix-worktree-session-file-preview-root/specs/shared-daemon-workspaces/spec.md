## MODIFIED Requirements

### Requirement: Workspace-aware session lifecycle
守护进程 SHALL 使用明确的工作区标识创建、列出、恢复和销毁会话。会话的 `cwd` SHALL 表示工作区归属目录；`working_cwd` SHALL 表示实际执行目录，进入工作树后为 worktree 路径。工作区范围内的恢复请求仅在会话确实属于该工作区时 SHALL 成功。

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

#### Scenario: 工作树会话打开轮次文件
- **WHEN** 工作树会话在 worktree 中生成文件，用户通过侧栏或会话跳转重新进入并点击轮次文件列表的“打开”
- **THEN** 界面 MUST 从该会话的 worktree 目录解析相对路径
- **AND** “查看变更” MUST 继续展示该轮记录的差异

#### Scenario: 恢复历史工作树会话
- **WHEN** 客户端恢复 worktree 目录仍存在的历史会话
- **THEN** 响应 MUST 保留原工作区归属目录，并返回 worktree 路径作为实际执行目录
- **AND** 若恢复时发现 worktree 已不存在，响应 MUST 清除过期的 worktree 状态
