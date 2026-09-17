# Validation evidence

## Scope

Implemented optional version 1 ordered composer content across the existing Slate editor, Web/Desktop web UI, message/draft API, storage, transcript, history, queue and fork paths. Existing text-only clients and records retain their fallback behavior. No provider/editor-specific schema is required by the other layer.

## Automated checks

- `pnpm test` in `web`: passed, including new content, lifecycle, renderer, transcript and actual production callback tests. Log: `build/inline-composer-web-tests.log`.
- `pnpm build` in `web`: passed; embedded-WebView regex compatibility check passed. Log: `build/inline-composer-web-build.log`.
- Release `acecode_unit_tests` target: built successfully with the installed VS 18 / MSVC 14.44 environment, serial MSBuild. The existing cache otherwise selected an older compiler incompatible with installed libraries. Log: `build/inline-composer-backend-build.log`.
- Focused C++ run: 87 tests from 9 suites passed under an isolated temporary user profile. Includes `ComposerContent`, session storage/resume/metadata, skill activation/expansion/catalog, `SessionFork`, structured HTTP send/draft/steer and fork tests. Logs: `build/inline-composer-backend-tests.log` and `.xml`.
- `openspec validate preserve-inline-composer-content --strict`: passed.
- `git -c core.safecrlf=false diff --check`: passed.

## Requirement evidence

| Requirement | Direct evidence |
| --- | --- |
| Ordered editor-independent serialization | `composerContent.test.js`, `richComposerModel.test.js`, `ComposerContent.*`: mixed parts, canonical text, stable resource identity, legacy fallback, metadata stripping, malformed and oversized structures |
| Caret insertion and in-place upload completion | Browser `browser-qa.mjs`: actual InputBar/RichComposer dropdown selection in existing prose, path insertion, upload completion after typing and unchanged DOM caret; keyboard/model regressions cover composition guards |
| Atomic editing and clipboard | Browser tests: mixed selection deletion/undo, repeated attachment occurrence deletion/undo, cut/paste, internal structured clipboard and readable external text; model/keyboard tests cover adjacent tags and zero-width attachment positions |
| Draft persistence and stale callbacks | `composerLifecycle.test.js`, `composerDraftCallbacks.test.js`, `homeComposerDrafts.test.js`, `sessionFork.test.js`; actual ChatView browser draft GET/PUT/navigation; backend draft resume test |
| Queue, history and fork | Actual ChatView browser history recall, fork refill, queue edit/newline, failed drain and retry; queue lifecycle tests include legacy attachments; HTTP tests copy restored and retained attachments into the fork and prove availability after source attachment removal |
| Sent content and previews | `composerTranscript.test.js`, `composerMessageRendering.test.js`; browser sent file/image preview actions and actual ChatView live/reloaded transcript; HTTP send and metadata persistence tests |
| Skills, builtins and compatibility | `slashCommands.test.js`, skill activation/expansion/catalog C++ tests, existing full frontend regression suite; canonical skill mention supplied by catalog and parentheses-safe linked paths |
| Server validation | `ComposerContent.*` and HTTP missing-attachment rejection: resource IDs are verified against materialized submitted attachments, trusted display metadata replaces client metadata |

## Browser evidence

The harness imports actual production components and intercepts API/WS traffic in an isolated browser fixture. No user conversations or live model requests were used.

- `build/preserve-inline-composer-content/browser-results.json`: 10 editor/rendering scenarios passed, no page errors.
- `build/preserve-inline-composer-content/chat-browser-results.json`: 12 actual ChatView scenarios passed, no page errors, covering session draft, queue, history, fork, Home draft and transcript lifecycle. The Home scenario stages a real browser File, navigates away and back, creates/promotes a session, uploads it at its saved position, sends the structured payload and verifies both drafts clear. A deliberately delayed upload proves the optimistic first message displays every reference before upload/canonical completion; the final ID/preview URL updates and the canonical echo replaces it without a duplicate bubble.
- Screenshots: `01-inline-composer.png`, `02-sent-preview.png`, `03-chat-lifecycle.png`, `04-queue-retry.png`, `05-home-upload-sent.png` in the same directory. Root visually inspected composer, sent transcript and Home upload output.

Native desktop shell and physical OS IME input were not exercised. Existing IME state/keyboard guards are covered by regression tests; browser interaction and C++ HTTP fixtures cover the shared UI and daemon behavior. A not-yet-uploaded local File remains an in-memory Home draft resource, matching the existing Home draft lifetime; an unavailable resource after a full application reload is surfaced as unsendable rather than silently discarded.

All fixture servers and browser processes were stopped after validation. No commit, deployment or package installation was performed. A concurrent sidebar font-size edit appeared in `web/src/styles/globals.css` during final review; it was left untouched and is outside this change.

## Review fixes

Browser verification caught and fixed a picker caret-restore callback moving the caret after upload completion. Review also fixed occurrence-specific deletion, metadata-only history edits, stale send/steer/Home receipts clearing a newer draft, legacy queue attachment loss, and fork-before-first-message draft restoration. Draft writes are serialized per session, including upload completion after navigation, and loading waits for pending writes. Screenshot review caught a text-only Home optimistic placeholder; `newSessionFirstUserMessage` now carries ordered parts and resources, with 11 focused regressions plus actual browser checks for pending upload display and canonical deduplication.

## Follow-up: @ candidate completion

The user's running-page screenshot exposed an uncovered path: typing an @ query and selecting a dropdown candidate. Minimal string differencing retained the common @ prefix in the old text node, so only the suffix was parsed and encoded session tokens appeared as ordinary text. The earlier browser insertion tests inserted complete tokens and did not cover query replacement.

File/session/command completion and explicit path insertion now pass their full query/caret ranges. Programmatic replacement uses a separate Slate selection mapping that preserves zero-text attachments on both boundaries, without changing ordinary user selection behavior. Directory traversal stays plain editable text, and quoted-directory completion leaves the caret inside its closing quote. Sent structured text and copy use the existing readable session-reference projection.

- Regression reproduced before the fix in `richComposerKeyboard.test.js`; it now passes session/file/quoted-file completion, neighboring attachment occurrences, insertion before an existing reference and undo.
- `richComposerModel.test.js`: 41 tests pass, including 7 replacement-range boundary cases. `pathReference.test.js`: 12 pass, including continued typing inside a quoted directory.
- Actual InputBar dropdown browser checks: 6 pass, zero page errors. Includes file and session selection in mixed content, ordinary and quoted directory traversal, and readable sent session references. Evidence: `build/preserve-inline-composer-content/dropdown-browser-results.json` and `06-dropdown-session-file.png`.
- `pnpm test`, `pnpm build`, strict OpenSpec validation and diff checks pass. Logs: `build/inline-composer-mention-web-tests.log`, `build/inline-composer-mention-web-build.log`.
- The preview daemon at `http://127.0.0.1:28086/` returns HTTP 200; the served HTML SHA-256 equals the rebuilt `web/dist/index.html`. Its previous process was confirmed absent and the preview was restarted as PID 16264. Other concurrent workspace changes were preserved.

## Follow-up: Whole-tag selection appearance

Focused Slate selections now give path, skill/command, session and attachment tags a complete native selection fill, shared with composer text. The selected fill includes borders and overrides hover colors and upload opacity; labels, file-type glyphs and removal controls inherit the selection foreground. Deselecting restores the existing appearance without changing geometry or content.

- Actual browser checks: 10 pass across light/dark themes, zero page errors. Ctrl+A, mouse dragging, Shift+Arrow selection, collapsed caret and plain-text clicking were exercised; the four tag types share the same solid background, preserve dimensions and leave ordered content unchanged. Evidence: `build/preserve-inline-composer-content/selection-browser-results.json` and `07-selection-{light,dark}-{keyboard,mouse,unselected}.png`. Root inspected both light keyboard and dark mouse selection screenshots.
- Full `pnpm test` and `pnpm build` pass; logs are `build/inline-composer-selection-web-tests.log` and `build/inline-composer-selection-web-build.log`. The design detector reported no findings on the modified lines; unrelated existing CSS findings were left untouched.
- The running preview returns HTTP 200 and its served HTML hash equals the rebuilt `web/dist/index.html`; the updated selection styles are present. No user draft was manipulated during verification.

## Mainline submission verification

The implementation already resides in the canonical `master` checkout. The scoped submission includes this change's source, tests and six OpenSpec artifacts. Unrelated hook/seed changes, side-chat geometry and the sidebar typography hunk are excluded.

Before submission, the current Release test executable reran all 87 focused C++ tests successfully under a fresh temporary user profile. Log and XML: `build/inline-composer-commit-backend-tests.log` and `.xml`. Source inspection confirmed the relevant test inputs had not changed since that executable was built. Frontend tests/build and browser evidence above remain current; scoped diff and strict OpenSpec checks are repeated before commit.
