## Why

The current 30 px top bar leaves its controls too close to the top of a maximized window. Add the requested 5 px above and 6 px below without enlarging icons or buttons, while preserving macOS native traffic-light placement.

## What Changes

- Increase the shared top-bar height from 30 to 45 CSS px with 5/6 px additional vertical padding.
- Keep the 24 px web control boxes and existing icon sizes independent of row height.
- Cover the complete visible row with blank-area dragging, retaining interactive-control exclusions.
- Preserve AppKit's three native buttons, 80 px windowed left inset, and native-fullscreen inset transition.

## Capabilities

### New Capabilities
- `titlebar-spacing`: Shared top-bar padding and platform-safe layout.

### Modified Capabilities

## Impact

Frontend shell CSS, title-bar hit testing, existing layout/drag tests and design documentation. No native button reparenting or native API changes.
