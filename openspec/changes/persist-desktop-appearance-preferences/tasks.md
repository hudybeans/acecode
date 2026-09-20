## 1. Stable Configuration Model

- [x] 1.1 Extend `WebUiPreferencesConfig` with validated theme, color-theme, and font-size defaults.
- [x] 1.2 Load and sparsely serialize the appearance fields while preserving legacy configuration compatibility.
- [x] 1.3 Expand focused configuration tests for defaults, valid round trips, and invalid fallback behavior.

## 2. Authenticated UI Preferences API

- [x] 2.1 Return the complete normalized appearance contract from `GET /api/config/ui-preferences`.
- [x] 2.2 Make the PUT route validate and persist partial legacy or appearance updates atomically.
- [x] 2.3 Expand HTTP smoke and frontend API tests for valid, legacy, invalid, and persistence-failure cases.
- [x] 2.4 Document the expanded endpoint contract in `docs/daemon-api.md`.

## 3. Startup Restoration And Frontend State

- [x] 3.1 Inject validated appearance configuration in the Desktop pre-navigation bootstrap.
- [x] 3.2 Add pure frontend helpers for bootstrap/API normalization, system fallback, and API serialization.
- [x] 3.3 Initialize ThemeProvider and App font size from the bootstrap/cache path and restore canonical values after authentication.

## 4. Durable Live Mutations

- [x] 4.1 Add serialized optimistic appearance writes with latest-confirmed rollback and user-visible failure reporting.
- [x] 4.2 Route both the TopBar light-dark toggle and every Settings Appearance control through the durable mutation path.
- [x] 4.3 Add focused frontend unit and architecture coverage for restore, persistence routing, ordering, and rollback helpers.
- [x] 4.4 Keep the long-lived appearance controller bound to the latest App state writer so a later `medium` choice applies after `small` or `large`.

## 5. Verification

- [x] 5.1 Run focused C++ configuration and Web server tests.
- [x] 5.2 Run the Web unit suite and production build.
- [x] 5.3 Run `openspec validate persist-desktop-appearance-preferences --strict` and `git diff --check`.
