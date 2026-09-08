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

- [x] 3.1 In `forkAndSwitch` (`web/src/components/ChatView.jsx`), set `preserveComposerInputOnSessionChangeRef` and `setComposerValue` from `restored_prompt` before promoting the session.
- [x] 3.2 Adjust the toast so it tells the user the prompt was restored and can be edited.
- [x] 3.3 Leave the composer untouched when the response has no `restored_prompt`.

## 4. Tests And Validation

- [x] 4.1 Add unit tests in `tests/session/` covering: anchor after an assistant reply, first-message empty fork, consecutive user messages, skipped checkpoint/timing/diff records, and a tool result anchor.
- [x] 4.2 Add a fork handler test asserting `restored_prompt` for user targets and its absence for assistant targets.
- [x] 4.3 Add a Web test for the composer refill branch (`web/src/lib/sessionFork.{js,test.js}`, registered in `runTests.js`).
- [x] 4.4 Build and run the focused C++ tests, then the full suite and `scripts/code_quality_check.sh`.
- [x] 4.5 Run `pnpm test` and `pnpm build` in `web/`.
