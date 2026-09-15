## 1. Backend

- [x] 1.1 Add isolated multi-turn streaming provider calls and validate history; verify focused tests cover context, retry/reset, tools, and independent cancellation.
- [x] 1.2 Add private authenticated WebSocket start/stop messages with safe worker/connection cleanup; verify protocol and cancellation tests and document daemon API.

## 2. Web conversation

- [x] 2.1 Add a side-stream API helper and testable conversation controller; verify follow-up history, duplicate submission, cancellation, errors and stale callback tests.
- [x] 2.2 Build the themed floating window with one close action, drag/eight-way resize, Markdown, loading and disabled composer; verify geometry tests and browser interactions.
- [x] 2.3 Route Web slash commands and menu into the float, retire inline UI and regenerate translations; verify routing/i18n tests and session isolation.

## 3. Integration verification

- [x] 3.1 Run full Web tests and production build, focused C++ tests/build, OpenSpec strict validation and diff whitespace checks; record exact coverage and any environment limitations.
- [x] 3.2 Inspect desktop/narrow and light/dark browser renders; verify multi-turn streaming, stop, close/reopen, session switch, geometry and top-level overlay behavior.
