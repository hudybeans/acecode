## Why

Side findings currently interrupt the main conversation or remain unactionable prose. Long conversations already warn after compaction, but users cannot transfer the remaining work to a fresh conversation with a reliable handoff.

## What Changes

- Add durable, dismissible task suggestions in Web/Desktop, proposed by an AI tool without starting work.
- Let users accept a side task in an isolated worktree or the source session's current working directory; serialize shared-directory startup behind source work.
- Offer a continuation after three successful summary compactions by default, with a configurable threshold and once-per-session dismissal.
- Continue in a fresh conversation using bounded handoff context, a real source-session reference, the actual working directory, and inherited execution configuration.
- Persist acceptance phases and the target session identity so retries do not create duplicate tasks. Keep old conversations available and link both directions.
- 待处理的两类建议卡片显示 30 秒自动关闭倒计时；文案位于底部进度条左上方，使用“xx秒后关闭”，进度条以细线和微光端点表现剩余时间。

## Capabilities

### New Capabilities
- `task-suggestions`: Durable AI suggestions, user-controlled launch location, card lifecycle, and idempotent startup.
- `session-continuation`: Successful-compaction policy and safe transfer of ongoing work to a fresh session.

### Modified Capabilities

None. Existing direct thread tools keep their contracts; suggestions are an additive opt-in launch surface.

## Impact

Session persistence and orchestration, AgentLoop compaction, worktree creation, model tool registration, daemon session routes, Web/Desktop chat UI and localization, daemon API documentation, and native/Web tests. No release, branch migration, provider API change, or full transcript cloning is included.
