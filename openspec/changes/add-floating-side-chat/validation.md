# Validation

Validated in the current Windows checkout on 2026-09-15. No release or installed daemon replacement was performed.

## Web

- `pnpm i18n:catalog`: regenerated and reviewed English overrides for the new copy.
- `pnpm test`: full Web suite passed, including conversation lifecycle, private stream transport, geometry, command routing and source-catalog checks.
- `pnpm build`: production single-file build passed; compatibility scan found no unsupported lookbehind expressions.
- Browser test mounted the actual `ChatView`, `SideChatWindow`, theme provider and modal, with deterministic HTTP/WebSocket fixtures. It verified `/side` with no arguments, a body portal and one header action, waiting/streaming input lock, reset on retry, main-draft isolation, follow-up history, stop/continue, close/reopen with draft and history, header dragging, all eight resize handles, placement above a body modal, Escape isolation, and resetting on session changes. No browser page errors occurred.
- Inspected screenshots at 1440×1000 and 390×780 in light and dark themes. The initial visual pass corrected the surface/background token hierarchy; the final pass passed all interactions.
- Browser fixtures did not contact a live model or modify user sessions. Native WebView occlusion uses the existing overlap coordinator; a packaged desktop/native-browser smoke test was not run.

## C++

The focused side-chat provider/protocol test binary was built with MSVC using existing local vcpkg headers/libraries: **36/36 tests passed** (16 side-chat tests and 20 existing authentication tests). Tests use fake providers and cover context isolation, actual deltas, retry/reset, partial cancellation, independent main retry delays, history validation, tool rejection, unsupported native-agent providers, per-connection request ownership, disconnect and late callback suppression. Reproduction: `& C:/Users/shao/AppData/Local/Temp/acecode-side-chat-20260915/build-side-chat.ps1`, or run `side_chat_tests.exe` there. Build/test logs and GTest XML are beside the executable.

This checkout has no configured CMake build and its submodules are not initialized. `agent_loop.cpp`, `session_registry.cpp`, `routes_ws.cpp`, `server.cpp`, `codex_provider.cpp`, and `copilot_provider.cpp` passed MSVC `/Zs` checks. A temporary harness of the two production Copilot token methods, with a mock token exchange, also passed concurrent-refresh, stale-401, snapshot-stability and account-change checks. A complete daemon/desktop build, real socket integration, live-provider request, and the full C++ suite are not claimed.

- `openspec validate add-floating-side-chat --strict`: passed.
- `git diff --check`: passed, including new source/test/spec files.

## Compatibility

- Existing synchronous HTTP and TUI side questions retain their old single-turn behavior.
- The native Codex app-server provider cannot guarantee tool-free calls and is rejected by the new streaming path before execution, with a translated message asking the user to choose another model.
- Side transcripts remain temporary for the selected view; refresh or switching sessions clears them. Closing/reopening within the same session preserves them.

## Artifacts

Local browser results, screenshots, fixture script and Web logs are under `C:/Users/shao/AppData/Local/Temp/acecode-side-chat-qa/`. The fixture HTML/JSX was removed from the project after verification. The C++ test binary is under `C:/Users/shao/AppData/Local/Temp/acecode-side-chat-20260915/`.
