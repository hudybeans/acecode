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
