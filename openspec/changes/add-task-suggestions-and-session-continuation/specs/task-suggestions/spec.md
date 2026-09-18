## Purpose

Allow useful findings outside the current task to become durable, actionable suggestions without interrupting or silently expanding the user's current work.

## ADDED Requirements

### Requirement: Suggestions require user acceptance
The system SHALL allow an AI to propose a bounded side task with a title, explanation, and self-contained execution prompt. Proposing SHALL NOT create a worktree or start another conversation. Pending suggestions SHALL be scoped to their source session, survive restart, support dismissal, and suppress duplicate proposals.

#### Scenario: Side finding during work
- **WHEN** the AI proposes a side task while the main conversation runs
- **THEN** the user sees a non-modal suggestion card and the main conversation continues
- **AND** no side task executes until the user accepts it

#### Scenario: Dismissal and reload
- **WHEN** the user dismisses a suggestion and reloads the conversation
- **THEN** the suggestion remains dismissed and an identical proposal does not immediately restore it

### Requirement: Explicit execution location
The user SHALL choose an isolated worktree or the source session's actual current working directory. Worktree creation SHALL use an explicitly captured source commit, report failure without falling back to shared execution, and SHALL NOT silently copy uncommitted changes. Shared-directory startup SHALL wait while the source or another known session using that directory has pending work.

#### Scenario: Source already in a worktree
- **WHEN** the user accepts a side task in the current directory from a worktree-backed session
- **THEN** the new task uses that worktree rather than returning to the primary checkout

#### Scenario: Shared directory busy
- **WHEN** the user accepts a current-directory side task while source work is active
- **THEN** the suggestion shows a queued state and starts only at a safe idle boundary

#### Scenario: Isolated startup fails
- **WHEN** worktree creation fails or the captured baseline is unavailable
- **THEN** the suggestion remains retryable with an error and no side task runs in the shared checkout

### Requirement: Durable idempotent acceptance
Repeated acceptance SHALL identify the same target conversation and worktree. Persisted startup progress SHALL allow retry after partial failure without duplicating accepted input. The card SHALL expose queued, starting, failed, and started states and link to a successfully started task.

#### Scenario: Double click and reconnect
- **WHEN** two acceptance requests or a reconnect retry arrive for the same suggestion
- **THEN** at most one target conversation receives the initial task

### Requirement: Accessible themed cards
Web and desktop SHALL present suggestions using the existing theme, readable Chinese and English text, keyboard-operable actions, and a layout fitting narrow screens. Switching source sessions SHALL NOT display stale cards from the previous session.

#### Scenario: Source changes during a request
- **WHEN** a user changes sessions while a suggestion response is in flight
- **THEN** that response cannot replace suggestions for the newly selected session

### Requirement: 建议卡片自动关闭倒计时
Web 和桌面端 SHALL 为首次展示且尚未接受的支线任务建议和上下文续接建议提供 30 秒倒计时，并在到期后通过既有关闭接口关闭建议。文案 SHALL 位于底部进度条左上方，中文为“xx秒后关闭”。进度条 SHALL 为逐渐缩短的细线及随端点移动、轻微闪动的小火苗，最后 5 秒轻微提亮，并适配主题、中英文、窄屏和减少动态效果偏好。

#### Scenario: 倒计时到期且轮询更新
- **WHEN** 待处理建议首次展示且用户未操作，期间收到同一建议的轮询结果
- **THEN** 30 秒截止时间保持不变，到期仅发起一次关闭请求，不启动任务，成功关闭后刷新不再展示

#### Scenario: 用户已接受或关闭失败
- **WHEN** 用户接受建议、主动关闭，或建议变为排队、启动或失败状态
- **THEN** 停止自动关闭倒计时，不因到期取消排队中的任务
- **AND** 关闭请求失败时保留错误提示和手动重试能力，不自动循环重试

#### Scenario: 多卡片及会话切换
- **WHEN** 多张建议先后出现，或用户离开当前会话
- **THEN** 每张卡片独立计时，旧会话定时器在销毁时清理，不关闭其他会话的建议
