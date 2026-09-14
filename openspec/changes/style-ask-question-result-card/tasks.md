## 1. Tool Result Data

- [x] 1.1 Add generic `ToolResult::metadata` and propagate it through `ToolExecutor::format_tool_result`.
- [x] 1.2 Include result metadata in `tool_end` WebSocket payloads for live desktop/web rendering.
- [x] 1.3 Populate `ask_user_question_result.items` in both TUI and async AskUserQuestion success paths.
- [x] 1.4 Add a readable `AskUserQuestion` branch to `ToolExecutor::build_tool_call_preview`.

## 2. Desktop/Web Rendering

- [x] 2.1 Normalize live `tool_end.metadata.ask_user_question_result` into tool entries.
- [x] 2.2 Normalize persisted tool-message metadata into resumed tool entries.
- [x] 2.3 Implement the collapsible AskUserQuestion confirmation card in `ToolBlock`.
- [x] 2.4 Add two-line clamp styling and overflow-only native tooltip behavior for Q/A text.
- [x] 2.5 Preserve existing generic tool block behavior for non-AskUserQuestion tools.
- [x] 2.6 Keep AskUserQuestion confirmation cards visible outside processed activity summaries.

## 3. Tests

- [x] 3.1 Update AskUserQuestion C++ unit tests for structured metadata.
- [x] 3.2 Add C++ tool event payload coverage for result metadata.
- [x] 3.3 Add web transcript normalization tests for live and persisted AskUserQuestion cards.
- [x] 3.4 Add web component/logic coverage for clamped tooltip behavior where practical.
- [x] 3.5 Add web projection regression coverage for AskUserQuestion cards around `已处理` summaries.

## 4. Verification

- [x] 4.1 Run focused C++ tests for AskUserQuestion and tool event payloads.
- [x] 4.2 Run `pnpm test` from `web/`.
- [x] 4.3 Run `openspec validate style-ask-question-result-card --strict`.
- [x] 4.4 Re-run web tests after excluding AskUserQuestion cards from processed summaries.

## 5. PR #49 Persistence Review

- [x] 5.1 Persist explicit cancellation metadata through the real AskUserQuestion result path and cover the provider-visible output contract.
- [x] 5.2 Restore tool names only from the current turn's nearest preceding unconsumed call; cover interrupted and reused call IDs.
- [x] 5.3 Supply the missing feedback module, keep submit/cancel rendering in ToolBlock, and preserve cancellation cards without a canonical tool name.
- [x] 5.4 Replace the unimplemented renderer-extension assertion with real component rendering checks; cover reload, self-heal, replacement, continuation, and unrelated metadata.
- [x] 5.5 Run web tests/build, native focused tests, GCC compilation, strict OpenSpec validation, and scoped diff checks before merging and pushing master.
- [x] 5.6 Add frontend tests and production build to GitHub's PR/master checks so missing frontend imports cannot pass unnoticed.
