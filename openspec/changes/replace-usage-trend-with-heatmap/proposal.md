## Why

The usage page's 30-day bar chart crowds daily labels and makes longer-term activity difficult to scan. A compact calendar heatmap with details on hover matches the requested reference and works with the selected theme.

## What Changes

- Replace the daily bar chart with a 365-day Token activity calendar, month labels, and daily, weekly, and cumulative views.
- Show exact dates and token counts on hover, keyboard focus, and touch; color intensity follows the active theme accent.
- Load the calendar independently while preserving the existing 30-day summary, model, and workspace totals.
- Keep empty, loading, failed, narrow-screen, and translated states usable.

## Capabilities

### New Capabilities
- `web-usage-heatmap`: Calendar-based usage activity and accessible token details in settings.

### Modified Capabilities

None.

## Impact

Web settings usage rendering, a focused calendar helper/component, localization, and frontend tests. Reuses GET /api/usage with days=365; no backend or persisted-data changes.
