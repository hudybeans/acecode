## 1. Ordered content contract

- [x] 1.1 Add editor-independent versioned content helpers and canonical serialization; verify round trips, legacy input, mixed references, and attachment identity with focused JS tests.
- [x] 1.2 Validate and persist optional message/draft content and expose canonical skill identity; verify focused C++ tests and document the API.

## 2. Editing and rendering

- [x] 2.1 Insert files and skills at the caret and update uploads in place while preserving IME/selection; verify editor tests and browser interactions.
- [x] 2.2 Preserve mixed references through atomic deletion, undo, cut and copy/paste; verify focused tests and browser interactions.
- [x] 2.3 Render sent inline files and skills in order with existing preview actions and legacy fallback; verify renderer tests and browser output.

## 3. Lifecycle integration

- [x] 3.1 Persist and restore home/session drafts with attachments and ordered content; verify scoped draft restoration and stale callback tests.
- [x] 3.2 Preserve content through queue editing/retries, live transcript/reload, input history and fork restoration; verify lifecycle regression tests.

## 4. Integrated verification

- [x] 4.1 Run focused backend checks, full pnpm test, pnpm build, strict OpenSpec validation and git diff --check; record actual results.
- [x] 4.2 Exercise mixed-content editing, upload completion, draft navigation and message restoration in a browser; review the final diff against every requirement and record evidence.

## 5. Mention completion regression

- [x] 5.1 Replace the entire selected @ query when inserting a file or session reference; verify atomic tags, surrounding references and undo with a regression test and browser interaction.
- [x] 5.2 Run frontend checks and rebuild the assets served by the preview daemon; verify the running page uses the corrected bundle.

## 6. Selected reference appearance

- [x] 6.1 Give selected inline tags a full, uniform selection background; verify selection and deselection across tag types and rebuild the running preview.
