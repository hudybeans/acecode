## Purpose

Help users continue long-running work in a fresh conversation while preserving relevant decisions, current progress, execution location, and access to source evidence.

## ADDED Requirements

### Requirement: Deterministic compaction reminder
The system SHALL count successful manual and automatic summary compactions and propose continuation at a configurable threshold defaulting to three. Failed compactions, repair checkpoints, and mechanical trimming SHALL NOT count as successful summaries. Dismissal SHALL suppress further automatic reminders in that source session. Fresh continuations SHALL start with a fresh counter.

#### Scenario: Third successful summary
- **WHEN** the configured threshold is reached
- **THEN** a continuation suggestion becomes available without interrupting the current turn

#### Scenario: Repair and resume
- **WHEN** the session is repaired or resumed after restart
- **THEN** repairs do not increment the successful-summary count and persisted dismissal remains effective

### Requirement: Bounded current handoff
Accepted continuation SHALL create a fresh conversation with a bounded handoff containing current goals, constraints, progress, next steps, evidence references, and the latest post-summary updates. The first message SHALL include a structured source-session reference and allow history to be read on demand. Full history cloning SHALL NOT be used as continuation.

#### Scenario: Progress after a reminder
- **WHEN** additional work completes between reminder creation and acceptance
- **THEN** the handoff includes that progress rather than only the earlier compaction summary

### Requirement: Preserve work and transfer ownership safely
Continuation SHALL keep the source's actual working directory, existing worktree, model, and applicable execution settings. It SHALL wait for source execution and known background writing tasks to settle before handing over, retain source history, and prevent the old source from automatically continuing the same work after successful transfer. Failure SHALL remain recoverable without losing either conversation.

#### Scenario: Uncommitted source changes
- **WHEN** a user continues work with uncommitted files in an existing worktree
- **THEN** the new conversation works in that same directory and can inspect those files

#### Scenario: Old work still running
- **WHEN** continuation is accepted while a tool or source task is active
- **THEN** the suggestion queues and the new main task cannot execute concurrently with the old one

#### Scenario: Successful transfer
- **WHEN** the new conversation successfully receives the handoff
- **THEN** the source remains readable, indicates its successor, and does not automatically advance the transferred task
