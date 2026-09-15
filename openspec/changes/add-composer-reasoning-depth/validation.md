# Validation

## Source and API

- `cmake --build build --config Release --target acecode acecode-desktop acecode_unit_tests --parallel 6` passed. A final incremental `acecode` build confirmed the last session changes were linked.
- 237 focused C++ tests passed across 13 suites: model discovery/cache, provider request bodies, model binding, session registry/client/storage, reasoning overrides, HTTP routes, default seed reconciliation and AI theme seed updates.
- A fresh production daemon ran with an isolated user profile and a localhost model fixture. Verified explicit/absent discovery, session creation validation, independent session selections, busy rejection, same-model reload, model-switch clearing and restart/resume persistence.
- Captured real Chat Completions request bodies contained `reasoning_effort: high`, then the restored default `low`, then no reasoning field after switching to an unsupported model. No paid/live generation provider was invoked.

## Frontend

- `pnpm test` passed, including the new reasoning capability/state tests and updated composer submission guards.
- Final capability-refresh regressions passed: same-model manual vision/tool tags survive reasoning declaration changes, and capabilities remain scoped to their model IDs during replacement and batch probing.
- `pnpm i18n:catalog` and `pnpm build` passed; generated production regex compatibility validation passed.
- Chromium mounted the production `ChatView` with deterministic HTTP/WebSocket fixtures. Verified exact effort choices, session POST high/medium/null, caret restoration, Escape and arrow/End/Enter navigation, 390px viewport bounds, busy/unsupported controls, model switching and reasoning effort in new-session creation.
- Wide and narrow screenshots were inspected: the control occupies the existing bottom toolbar between model and send; the popup opens above it without a new composer row.
- All 20 browser checks passed with zero page errors. The actual settings dialog verified custom off/on/edit/off and ACEModel absent/declared capability selection. Side-chat minimize/reopen preserved the draft; suggestion cards retained their themed shadow with 12px scroll padding.

## Delivery checks

- Strict OpenSpec validation passed for this change and the two reconciled floating-chat/task-card refinements.
- `git diff --check` passed.
- Release publication, final ZIP seed upgrade scenarios and six-platform updater mirroring are recorded by the separate v0.9.19 release run. Source/UI checks do not claim native WebView or live ACEModel generation coverage.
