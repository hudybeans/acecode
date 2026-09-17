## Why

AskUserQuestion's per-question option count is hardcoded to 2–4 (`kMinOptions`/`kMaxOptions` in the shared tool code). Users cannot widen the choice set without editing source, and the limit is invisible in configuration. The user wants the upper bound to be configurable between 4 and 8.

## What Changes

- Add `ask.max_options` to the config: default 6, legal range 4–8, out-of-range values clamped to the nearest boundary with a warning (same pattern as `ask.max_questions`).
- Make the AskUserQuestion tool take the option budget from configuration: validation, error messages, and the tool schema (`minItems`/`maxItems`) are all derived from the configured value.
- Keep the lower bound fixed at 2.
- Update the config tests, the tool tests, and the official configuration documentation.

## Capabilities

### New Capabilities

- `configurable-ask-option-limit`: Let `ask.max_options` control the maximum number of options a single AskUserQuestion question may carry.

### Modified Capabilities

None.

## Impact

The shared `AskConfig` struct and its JSON parsing/dumping, `validate_ask_user_question_args` and `build_ask_user_question_def`, the three tool-registration call sites (TUI main, headless runner, daemon worker), config and tool unit tests, and `docs/help/configuration.html`. No TUI/Web rendering changes are needed: both render option lists dynamically from `options.size()`.
