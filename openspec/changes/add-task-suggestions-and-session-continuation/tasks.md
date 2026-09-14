## 1. Durable suggestions and reminder policy

- [x] 1.1 Add scoped durable suggestion storage, validation, deduplication and atomic acceptance; verify persistence, dismissal, limits and concurrent-claim unit tests.
- [x] 1.2 Count successful summary checkpoints with repair/fork handling and generate once-per-session reminders; verify manual/auto/failure/restart/fork policy tests.
- [x] 1.3 Configure the continuation threshold (default three, zero disabled) and preserve settings serialization; verify configuration tests.

## 2. Session startup and continuation

- [x] 2.1 Implement idempotent suggestion startup and retry/recovery with persisted target/input identity; verify duplicate and partial-failure tests.
- [x] 2.2 Preserve actual cwd, worktree and effective configuration, queue shared-directory work, and create isolated worktrees from pinned commits; verify busy/worktree/dirty/base tests.
- [x] 2.3 Build bounded current handoffs with structured source references and pause source automatic execution after transfer; verify recent progress, goal/background boundaries and retained history.

## 3. Tools and HTTP contract

- [x] 3.1 Register bounded suggest/dismiss tools and capability guidance without automatic task launch; verify tool schema and service-dispatch tests.
- [x] 3.2 Add authenticated session-scoped list/accept/dismiss routes and document payloads, statuses and recovery; verify API tests or daemon smoke checks.

## 4. Web and desktop cards

- [x] 4.1 Add themed accessible suggestion cards with location selection, queued/error/retry states and target links; verify interaction and narrow-screen behavior.
- [x] 4.2 Scope asynchronous state to the source session, handle old backends and prevent duplicate acceptance; verify controller race and lifecycle tests.
- [x] 4.3 Add Chinese/English copy and regenerate the localization catalog; verify catalog generation, pnpm test and pnpm build.

## 5. Integrated validation

- [x] 5.1 Build native changes and execute focused native tests plus appropriate broader checks; review failures and document any platform limitations.
- [x] 5.2 Review end-to-end behavior and final diff, run strict OpenSpec validation and git diff --check, and reconcile the completed tasks with actual evidence.

## Validation evidence

- Windows Release builds passed for `acecode`, `acecode-desktop`, and `acecode_unit_tests` in `build/task-suggestions`; the latest Web bundle is embedded.
- 496 native tests passed across suggestion, handoff, compaction, worktree, configuration, model binding, session persistence, and HTTP integration suites. The production dispatch path runs a fake provider through the real AgentLoop; no live provider account was used.
- The test-only WorkerGate lifetime race was identified from CDB thread stacks and fixed with callback-owned shared state. The affected worktree case then passed five repetitions before the complete selected suite passed.
- `pnpm test`, `pnpm build`, and localization catalog generation passed. Twelve browser interaction checks passed with the actual card component, production styles, and mocked HTTP responses, including themes, 360px layout, keyboard navigation, cancel/retry, and stale-response handling.
- Strict OpenSpec validation and `git diff --check` passed. macOS/Linux native builds, live model quality, and installer publication were not performed.
