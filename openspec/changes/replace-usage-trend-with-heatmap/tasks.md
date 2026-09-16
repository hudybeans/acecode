## 1. Calendar model

- [x] 1.1 Implement date-only calendar, weekly and window-cumulative aggregation; verify focused tests for year/leap boundaries, partial weeks, missing dates, and zero/invalid values.

## 2. Settings interface

- [x] 2.1 Implement theme-aware heatmap, mode controls, exact hover/focus/tap details and responsive layout; verify browser interaction in light, dark, and custom-accent themes.
- [x] 2.2 Integrate independent annual loading and refresh while preserving 30-day statistics; verify loading, empty, failure, and historical-only data in the settings page.
- [x] 2.3 Update search and English mappings and regenerate the static catalog; verify localized labels and catalog validation.

## 3. Integration verification

- [x] 3.1 Run pnpm test, pnpm build, strict OpenSpec validation, scoped design detector, and git diff --check; inspect final diff for unrelated changes.

## 4. Match the corrected visual reference

- [x] 4.1 Replace the wrapping summary cards with the compact single-row strip; verify all three metrics and their text stay on one row at narrow and wide settings widths.
- [x] 4.2 Render bounded square cells and equally spaced months with uniform SVG scaling, remove horizontal scrolling and the extra footer; verify cell width/height, gaps, radii, full date coverage, maximum dimensions, and localized hover/keyboard details in the browser.
- [x] 4.3 Run frontend tests/build, strict specification validation, scoped design scan, and prepare the reviewed repair for master while preserving unrelated changes.

Verification: all frontend tests passed, production Vite build and regex compatibility scan passed, strict OpenSpec validation passed, scoped Impeccable detector returned no findings, and git diff --check passed. Playwright exercised the real SettingsPage with deterministic mock usage responses at 390, 600, 900, 1280, 1920, and 2560px widths. Assertions verified a single-row summary, 365 square daily cells, twelve equally spaced months, proportional gaps and corner radii, a maximum chart width of 732px, cells below 11px, and no horizontal scrolling. Chinese and English headings and native mode controls fit their scaled SVG frame even at 390px. Daily/weekly/cumulative, hover/focus/click, Enter/Space, Home/End, Escape, built-in light/dark and a custom accent, independent loading/failure, historical-only and empty data, and refresh recovery passed. Final screenshots include the page title and use fixture data; the installed native desktop application was not rebuilt.
