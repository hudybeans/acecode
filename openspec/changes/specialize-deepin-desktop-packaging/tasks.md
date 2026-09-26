## 1. Dedicated build boundary

- [x] 1.1 Add the default-off Linux-only build option, desktop-only DTK dependencies and source isolation; verify generic and Deepin Desktop builds and linkage.
- [x] 1.2 Attach native DTK frame effects to the existing GTK window and gate fractional scaling; verify window properties, screenshot, resize, focus and close behavior on local UOS.
  - Verified native frame properties/screenshot, continuous DPI changes, isolated-display pointer interactions, real UOS window controls and real compositor move/resize/restore. Physical mouse gestures on the locked real desktop remain an explicitly unverified manual check; synthetic pointer gestures there were inconclusive.

## 2. Release migration

- [x] 2.1 Add a reproducible DTK 5 SDK build for the old ABI baseline and convert the old packaging matrix to Deepin; verify source pins, shell/workflow syntax and dependency/ABI gates.
- [x] 2.2 Update archive completeness validation and build/install documentation; run release verifier regression tests including rejection of old archive names.
- [x] 2.3 Separate Deepin update identity from generic Linux without adding Qt to the daemon; verify target selection regression tests for both variants.

## 3. Integration review

- [x] 3.1 Run focused build/runtime verification, strict OpenSpec validation and diff checks; record exact results and unavailable platform coverage.
