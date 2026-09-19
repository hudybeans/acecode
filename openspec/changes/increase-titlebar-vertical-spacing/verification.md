# Verification — 2026-09-18

The user's final measurements supersede the initial 8/7 px trial: add 5 px above and 6 px below the original row, total 41 CSS px. Control boxes remain 24 px; panel/navigation icons remain 16 px. Measured control clearance is 8 px above and 9 px below because the original row already had 3 px on each side.

- Focused drag, sidebar chrome and desktop-platform tests passed.
- Full `pnpm test` and `pnpm build` passed after the final measurement change. Production regex compatibility passed (4448 regex literals).
- `openspec validate increase-titlebar-vertical-spacing --strict` and `git diff --check` passed.
- Browser checks using the production TopBar and CSS passed all ten combinations of Windows normal/maximized, simulated macOS windowed/fullscreen and narrow browser mode, at device pixel ratios 1 and 1.5. Measured row height is 41 px; icon/button sizes and horizontal control geometry are unchanged. Content starts at 41 px, the final visible blank pixel drags, no horizontal overflow or page errors occurred.
- Simulated macOS fullscreen callbacks correctly transition the left inset 80 → 8 → 80 px and render no custom window controls. Native source was not modified: AppKit still owns the traffic lights and their positions.

Artifacts are under `C:/Users/shao/.codex/visualizations/2026/09/17/01a0afdc-a96a-78f0-82dd-98da630d06ef/titlebar-spacing/`: fixture.html, results.json and ten screenshots. Browser flags/state simulate the native bridge; these checks are not a real macOS build or native traffic-light interaction test.
