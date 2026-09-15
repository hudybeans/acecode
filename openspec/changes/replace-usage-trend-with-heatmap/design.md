## Context

SectionUsage in SettingsPage.jsx owns a 30-day request and inline bars. The existing usage endpoint supports up to 366 daily buckets, including empty dates; normalizeUsageStats retains those buckets and their metadata. Date strings follow the request's fixed timezone offset. Existing tooltips demonstrate body portals with native-overlay coordination.

## Goals / Non-Goals

**Goals:** Isolate calendar calculation and interaction in focused modules, preserve nearby statistics, and match the reference's compact rounded squares and quiet headings.

**Non-Goals:** No ledger, API, billing, historical backfill, theme-package, or native-shell changes.

## Decisions

- Request 365 days independently from the existing 30 days. Each request owns its loading/error state and honors unmount/reload cancellation. This preserves summary semantics and allows either section to succeed independently.
- Use date-only UTC arithmetic on backend date strings, avoiding a second timezone conversion or DST-induced missing dates. Pad Monday-start weeks with null cells outside the window.
- Daily/cumulative modes use seven rows. Weekly mode uses one merged vertical cell per week within the same chart area. Cumulative labels explicitly say the displayed window is the source of the running total.
- Quantize positive values into theme-accent intensity levels; zero uses a neutral surface. Include a subtle low/high legend. No hard-coded palette or third-party chart dependency.
- Use a body-portal tooltip with measured viewport placement, existing anchoredMenuPosition helper, native-overlay attribute, exact localized numbers, and hover/focus/tap dismissal. Roving keyboard focus avoids hundreds of Tab stops; arrow keys move through dates or weeks.
- Put calendar-only styles alongside the new component to avoid modifying the already-dirty global theme file.

## Risks / Trade-offs

- One additional ledger query per refresh adds work; keep requests bounded and reuse both results while toggling views.
- Fixed-offset calendar grouping inherits the API's existing behavior across historical DST changes; preserve the authoritative date buckets.
- A full year cannot remain readable at phone widths; use a locally scrollable chart with recent dates initially in view.
- Tooltips inside settings may otherwise clip; portal them to document.body, dismiss pointer details on viewport/scroll changes, and reposition keyboard details when focus navigation scrolls the calendar. Consume Escape before the settings window's close listener.
