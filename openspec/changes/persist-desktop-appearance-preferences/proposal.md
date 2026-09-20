## Why

Desktop appearance choices are currently written only to browser `localStorage`, but the Desktop shell connects to a newly selected loopback port when its managed daemon changes. Because browser storage is origin-scoped and the port is part of the origin, light/dark mode, color theme, and font size silently reset across Desktop restarts instead of behaving like real preferences.

## What Changes

- Persist the complete appearance preference set (light/dark mode, blue/orange color theme, and small/medium/large font size) in ACECode's stable user configuration through the authenticated UI-preferences API.
- Restore the persisted appearance after authentication in ordinary WebUI mode and inject it before the first Desktop WebView render so Desktop startup does not depend on a previous loopback origin.
- Keep the existing browser storage values as a same-origin paint/cache fallback and for compatibility, while treating the daemon-backed configuration as canonical once available.
- Apply Settings changes immediately, save them asynchronously, and roll the visible choice back if persistence fails.
- Extend configuration, API, frontend, and regression coverage without changing TUI themes or project-specific configuration.

## Capabilities

### New Capabilities

- `desktop-appearance-persistence`: Stable storage, startup restoration, live updates, and failure handling for Desktop/WebUI appearance preferences.

### Modified Capabilities

(none)

## Impact

- **Configuration:** `WebUiPreferencesConfig` and `config.json` `web_ui` serialization gain validated appearance fields.
- **Daemon API:** existing authenticated `GET/PUT /api/config/ui-preferences` reads and writes the appearance preference set while retaining the legacy avatar field.
- **Desktop startup:** native WebView bootstrap injects the configured appearance independently of loopback origin.
- **Frontend:** `theme.jsx`, `App.jsx`, appearance helpers, and Settings wiring load/save canonical preferences while preserving immediate CSS updates.
- **Tests/docs:** config, HTTP smoke, frontend API/state tests, architecture checks, and daemon API documentation cover the durable contract.
