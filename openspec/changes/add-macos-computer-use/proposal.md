## Why

ACECode already provides Windows Computer Use, but macOS users cannot observe or operate native applications. Add the same observation/action loop on macOS with explicit system authorization and a cancellable native helper.

## What Changes

- Implement a macOS 14+ Objective-C++ helper for application/window discovery, screenshots, accessibility, input, control actions and the themed pointer.
- Preserve the existing computer_* tools, one-use observations, screenshot attachments, session ownership and cancellation semantics; make platform-specific descriptions explicit.
- Add non-prompting permission diagnostics and user-triggered authorization in Settings. Keep enabled intent distinct from runtime readiness.
- Deliver the helper in desktop and standalone packages with signing and installation checks. Older macOS versions retain the existing application features and report Computer Use as unsupported.
- Add deterministic broker/geometry tests and opt-in native fixtures that operate only on disposable test windows; verify the actual helper path and packaged layout.

## Capabilities

### New Capabilities
- `macos-computer-use`: macOS native observation, input, authorization and helper lifecycle.

### Modified Capabilities

None. The Windows Computer Use change remains a compatibility baseline.

## Impact

Changes cover src/computer_use, tool registration/descriptions, settings API and UI, CMake, macOS packaging, daemon API documentation and tests. Apple frameworks are linked only to appropriate macOS targets. No Codex private runtime or new service is required.
