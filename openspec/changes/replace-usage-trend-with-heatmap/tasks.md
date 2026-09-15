## 1. Calendar model

- [x] 1.1 Implement date-only calendar, weekly and window-cumulative aggregation; verify focused tests for year/leap boundaries, partial weeks, missing dates, and zero/invalid values.

## 2. Settings interface

- [x] 2.1 Implement theme-aware heatmap, mode controls, exact hover/focus/tap details and responsive scrolling; verify browser interaction in light, dark, and custom-accent themes.
- [x] 2.2 Integrate independent annual loading and refresh while preserving 30-day statistics; verify loading, empty, failure, and historical-only data in the settings page.
- [x] 2.3 Update search and English mappings and regenerate the static catalog; verify localized labels and catalog validation.

## 3. Integration verification

- [x] 3.1 Run pnpm test, pnpm build, strict OpenSpec validation, scoped design detector, and git diff --check; inspect final diff for unrelated changes.

Verification: all frontend tests passed, production Vite build and regex compatibility scan passed, strict OpenSpec validation passed, scoped Impeccable detector returned no findings, and git diff --check passed. Playwright exercised the real SettingsPage with deterministic mock usage responses across desktop and 600px widths, Chinese/English, daily/weekly/cumulative, hover/focus/click, built-in light/dark and a custom accent, independent loading/failure, historical-only and empty data, and refresh recovery. Final regressions also confirmed Home/End retain the focused date's tooltip after automatic horizontal scrolling and Escape dismisses only the tooltip. Screenshots use fixture data; the installed native desktop application was not rebuilt.
