## Why

AskUserQuestion answers are currently surfaced as ordinary tool output, which makes multi-question confirmations hard to scan and easy to lose inside generic tool transcript chrome. The user-facing desktop/web result should preserve the tool result location while rendering the answered questions as a compact confirmation card.

## What Changes

- Add structured UI metadata to successful AskUserQuestion tool results, containing the answered question/answer pairs in input order.
- Render AskUserQuestion results in desktop/web tool blocks as a collapsible "confirmed N items" card with compact Q/A rows, answer emphasis, separators, two-line clamping, and native tooltip for clamped text.
- Keep the model-visible tool output contract unchanged so providers still receive the existing full answer text.
- Improve the AskUserQuestion tool invocation preview so TUI/desktop history shows a readable "asking N confirmation items" line instead of raw JSON.
- Preserve explicit cancellation feedback across history reloads and keep both feedback states in the existing shared tool renderer; make the PR #49 frontend tests self-contained.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ask-user-question-tool`: successful tool results carry structured UI metadata and a readable tool-call preview while preserving the model-visible output contract.
- `desktop-ask-user-question-ui`: desktop/web renders answered AskUserQuestion results as a collapsible confirmation card inside the normal tool display.

## Impact

- C++ tool result plumbing: `ToolResult`, `ToolExecutor`, `AgentLoop`, web tool event payloads.
- AskUserQuestion tool formatting and unit tests.
- Desktop/web transcript reduction and `ToolBlock` rendering.
- Web tests for transcript state and Q/A card behavior.
