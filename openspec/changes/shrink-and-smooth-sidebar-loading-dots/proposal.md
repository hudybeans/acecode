## Why

The sidebar's running-session indicator is too visually heavy, and its dots hold the contracted position for about 0.78 seconds in every breathing cycle. The hold and overlapping dots can look like the animation has stopped.

## What Changes

- Set each dot's diameter to 4.3px, following the user's size refinement.
- Keep contracted dots separate by using a 3.5px inner radius.
- Remove the contracted-position hold so breathing remains continuous alongside the existing rotation.
- Preserve the indicator slot, session-row alignment, accent color, and status semantics.
- Use explicit orbit geometry and static dot positions for older CSS engines; when reduced motion is requested, keep a gentle opacity pulse instead of removing all running feedback.

## Capabilities

### New Capabilities
- `sidebar-session-loading-indicator`: Compact, continuous four-dot feedback for running sidebar sessions.

### Modified Capabilities
None.

## Impact

- `web/src/styles/globals.css` only for production behavior; a browser regression script checks the built styles.
- Existing sidebar tests and browser checks against the production markup and built styles.
- No API, dependency, or session-state changes.
