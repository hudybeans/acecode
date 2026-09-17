## Why

Review of PRs #51, #52, #57, #58 and #59 found missing TUI configuration wiring, incomplete recovery failure handling, and launcher error handling defects. The combined frontend must also keep long questions usable inside the composer dock.

## What Changes

- Complete the existing configurable option limit change at the TUI entry point.
- Keep failed session resumes from opening live connections; preserve visible history when a session becomes live.
- Bound the pending question to the available chat height and keep its actions reachable.
- Preserve launcher failures even when stale runtime files exist, and repair the Windows Python fallback.
- Reconcile domain documentation and record combined validation.

## Capabilities

### New Capabilities
- `reviewed-pr-integration`: Reliable session recovery, question layout and development startup after integration.

### Modified Capabilities
None.

## Impact

TUI registration, Web session navigation/transcript and question layout, developer launcher scripts, and regression coverage. No protocol or storage changes.
