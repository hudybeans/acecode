## Why

The UOS Desktop can exit unexpectedly, directory selection depends on tools absent from the system, and the old WebKit engine does not reserve the sidebar scrollbar gutter. Linux also lacks the startup logo and centered first window already expected from the desktop application.

## What Changes

- Diagnose the reported crash from available process/debugger evidence and fix its cause; verify both idle operation and opening existing directories.
- Provide directory selection on Linux without requiring zenity or kdialog.
- Reserve the session-list scrollbar space on older WebKit without shifting content when overflow changes.
- Show the existing ACECode logo during Linux startup and center the first main window within the selected monitor's usable area.
- Verify and finish the existing Deepin release workflow, with dynamically linked system DTK/Qt and no toolkit libraries copied into archives.
- Validate the combined changes and commit/push them to the GitHub repository as requested.

## Capabilities

### New Capabilities

- `linux-desktop-reliability`: Crash resilience, native directory selection, stable sidebar layout and Linux startup presentation.

### Modified Capabilities

None. Dedicated packaging continues the existing `specialize-deepin-desktop-packaging` change.

## Impact

Linux Desktop native integration and startup, folder selection, sidebar CSS, regression tests, packaging validation and the two existing Deepin changes. Windows/macOS behavior and generic Linux's independence from DTK remain intact.
