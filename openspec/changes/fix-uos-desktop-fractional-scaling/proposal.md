## Why

On UOS/Deepin at fractional display scales, GTK reports a scaled text DPI while WebKitGTK still lays out CSS pixel dimensions at the unscaled window scale. ACECode Desktop then shows text larger than its controls and spacing, and some labels no longer fit. This is reproducible on the current 125% UOS session with WebKitGTK 2.38.5.

## What Changes

- Make the Linux Desktop WebView use one effective scale for text and the rest of the ACECode page when UOS/Deepin supplies fractional display scaling through its text DPI setting.
- Keep the adjustment local to the Desktop process and WebView. Leave other Linux desktops, browser UI, Windows, and macOS behavior as they are.
- Respond to UOS scale changes while the Desktop window remains open, and verify 100%, fractional, and integer scale cases.

## Capabilities

### New Capabilities

- `linux-desktop-display-scaling`: Consistent Desktop WebView scaling on UOS/Deepin and safe behavior on other Linux environments.

### Modified Capabilities

None.

## Impact

Linux Desktop WebView initialization and scale updates in `src/desktop/`, focused tests in `tests/desktop/`, and local development validation on UOS. No daemon protocol or user setting changes.
