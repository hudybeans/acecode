## Why

Forking a session currently copies the prefix `[0..idx]` including the clicked
message itself (`retained_prefix_before_index` in `src/session/session_rewind.cpp`
called from `src/web/routes/fork_handler.cpp`). When the clicked message is a
user prompt, the new session therefore starts with that prompt already committed
to history, and the TUI/Web composer stays empty.

That is the wrong affordance for the most common reason to fork on a user
message: the user wants to **rephrase that prompt and try again** from the state
before it ran. Today they must manually retype or copy the prompt after forking.

Every competitor that implements this behavior forks *before* the selected user
turn rather than including it:

- Codex backtrack (`codex-rs/tui/src/app_backtrack.rs:6-14`): "forks before the
  selected turn and restores its prompt in the new composer."
- Grok Build `/rewind` (`xai-grok-shell/src/session/acp_session_impl/rewind.rs:393`):
  "Rewind to N restores state from before prompt N ran; prompts 0..N-1 are kept",
  then refills the composer **without** auto-submitting.
- Goose fork (`crates/goose/src/session/session_manager.rs:2545`): deletes rows
  with `created_timestamp >= ?`, i.e. removes the clicked user message.
- Cline `restoreCheckpoint`: `slice(0, targetIndex)` then stores
  `checkpointRestoreInput` which the webview writes into the textarea.

## What Changes

- Resolve the fork anchor by scanning backwards from the clicked user message,
  skipping non-conversational records (file checkpoint, turn timing, turn net
  diff, meta messages), and stopping at the first real message.
- When the clicked message is a user message, fork **before** it and return its
  text so the client can refill the composer.
- The client (desktop context menu and Web message hover action both funnel
  through `forkAndSwitch` in `web/src/components/ChatView.jsx`) sets the composer
  value and preserves it across the session switch instead of only showing a
  toast.
- Forking on an assistant message keeps today's behavior unchanged.
- Sending the refilled prompt unchanged stays allowed: the fork is a separate
  session, so replaying the same prompt cannot affect the source session.

## Capabilities

### New Capabilities

- `session-fork-anchor`: Defines how the retained history prefix is resolved for
  a fork, including the user-message anchor rule and tool-call pairing safety.

### Modified Capabilities

None.

## Impact

- `src/session/session_rewind.cpp` / `session_rewind.hpp`: new anchor resolution
  helper.
- `src/web/routes/fork_handler.cpp`: use the anchor and extend the response with
  `restored_prompt` / `fork_anchor_role`.
- `web/src/components/ChatView.jsx`: refill composer in `forkAndSwitch` and set
  the existing `preserveComposerInputOnSessionChangeRef` before switching.
- Tests in `tests/session/` and `tests/web/`.
