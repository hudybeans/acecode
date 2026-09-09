## 1. Fork Anchor Resolution

- [x] 1.1 Add `resolve_fork_anchor_index(messages, target_index)` to `src/session/session_rewind.{hpp,cpp}` returning the last index to retain.
- [x] 1.2 Reuse the existing non-conversational predicates (file checkpoint, turn timing, turn net diff, `is_meta`) instead of duplicating the conditions.
- [x] 1.3 Return no anchor when the target is the first real message, so the fork yields an empty prefix.
- [x] 1.4 Keep scanning past an assistant message whose tool calls have no retained results.

## 2. Fork Handler

- [x] 2.1 Replace `retained_prefix_before_index(messages, idx + 1)` in `src/web/routes/routes_sessions.cpp` with the resolved anchor.
- [x] 2.2 Keep the assistant-message path unchanged.
- [x] 2.3 Add `restored_prompt` and `fork_anchor_role` to the fork response.

## 3. Client Composer Refill

- [x] 3.1 Restore `restored_prompt` in the fork destination composer without sending it.
- [x] 3.2 Adjust the toast so it tells the user the prompt was restored and can be edited.
- [x] 3.3 Leave the composer untouched when the response has no `restored_prompt`.

## 4. Tests And Validation

- [x] 4.1 Add unit tests in `tests/session/` covering: anchor after an assistant reply, first-message empty fork, consecutive user messages, skipped checkpoint/timing/diff records, and a tool result anchor.
- [x] 4.2 Add a fork handler test asserting `restored_prompt` for user targets and its absence for assistant targets.
- [x] 4.3 Add a Web test for the composer refill branch (`web/src/lib/sessionFork.{js,test.js}`, registered in `runTests.js`).
- [x] 4.4 Build and run the focused C++ tests, then the full suite and `scripts/code_quality_check.sh`.
- [x] 4.5 Run `pnpm test` and `pnpm build` in `web/`.

## 5. PR 46/47 Integration Repairs

- [x] 5.1 Defer fork composer refill until the destination session activates; preserve the source session draft and add a lifecycle regression test.
- [x] 5.2 Use generator-independent CMake parallelism in build/verification/release commands and restore default cross-platform desktop discovery, with regression tests.
- [x] 5.3 Always incrementally build portable packages, isolate and verify architectures, honor the complete output path, and exercise the script with mocked macOS tools.
- [x] 5.4 Synchronize affected skill copies and API documentation; run integrated frontend/script checks and validate OpenSpec.
- [x] 5.5 Commit and merge the repaired PR histories into remote master, preserving unrelated local work.

## Integration Validation (2026-09-09)

- PR 46 and PR 47 were merged with their original histories; repair commit
  `2b68a672` was pushed to remote master from the isolated integration worktree.
- `pnpm test` and `pnpm build`: passed, including source/destination draft
  lifecycle coverage and the generated bundle regex compatibility check.
- Python script tests: 17 passed (7 package verifier, 6 desktop launcher,
  4 portable packaging). The verifier test built with real Windows MSBuild;
  portable packaging used deterministic mocked macOS tools, not a native Mac.
- Release, verifier, and build launcher dry-runs: passed with CMake `--parallel`.
- Shell syntax, `git diff --check`, code quality script, and strict OpenSpec
  validation: completed. The quality script reports repository-wide advisory
  findings and is not a warning-free lint gate.
- C++ fork tests passed in PR 47 CI run 34322571460. Full C++ compilation was
  not repeated locally; the two pre-existing Linux terminal/toolchain test
  failures were also present in master run 34356121713.
- The original working directory's unrelated uncommitted changes were preserved.
