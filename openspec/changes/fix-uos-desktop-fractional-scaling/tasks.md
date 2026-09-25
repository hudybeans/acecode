## 1. Scaling policy

- [x] 1.1 Add a pure UOS/GTK WebView scale policy with tests for 100%, 125%, 150%, integer GTK scale, invalid values, and unrelated text DPI; verify the focused tests pass.

## 2. Linux Desktop integration

- [x] 2.1 Apply the policy to the main Linux WebView before navigation, retaining normal behavior when the UOS schema is absent; verify an incremental Desktop build succeeds.
- [x] 2.2 Observe UOS scale and GTK DPI/widget-scale changes, update the correction without recursion, and release signal handlers on teardown; verify with a focused runtime check and build.
- [x] 2.3 Preserve native GTK tray menu label size after the process DPI normalization; verify the 125% font metrics with a GTK probe and rebuild Desktop.

## 3. Validation

- [x] 3.1 Validate OpenSpec, run focused tests, build Desktop, and check the 125% UOS window, its daemon connection, and native tray menu font metrics; verify `git diff --check` and review the final diff.

## 4. Correct the inactive workaround on the user's session

- [x] 4.1 Use the effective native XSettings font DPI instead of requiring the Deepin scale-factor key to agree; cover 120 DPI with a stale 1.0 display setting.
- [x] 4.2 Observe native XSettings changes even while GtkSettings has an application DPI override, and restore normal settings on teardown.
- [x] 4.3 Rebuild and launch the actual Desktop, capture its window, and compare text and control proportions against the failing screenshot.

Follow-up validation: the real UOS window logged native DPI 120 and page zoom 1.25; home and Settings screenshots were inspected. The same Desktop binary on an isolated X server followed native DPI 120 -> 144 -> 96 -> 120 without restarting. Screenshots measured the sidebar at approximately 338, 405, 270, and 338 pixels respectively. The five focused policy tests passed. The earlier full-suite build limitation under GCC 8 remains unrelated to this correction.
