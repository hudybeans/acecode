## Why

ACECode mixes several icon coordinate grids, stroke weights and sharp-cornered silhouettes. Many source SVGs also contain fixed colors, so the icon system cannot consistently inherit the surrounding control's appearance.

## What Changes

- Redraw all first-party operation, navigation and status icons as an ACECode-owned family informed by the inspected Claude samples: thin strokes, round caps, softened bends and consistent optical padding.
- Adopt a 20-unit drawing grid with size-aware stroke targets: 12/16/20/24/28/32 px map to 0.8/1/1.2/1.4/1.6/1.8 px. Icons use currentColor or none only.
- Consolidate inline functional glyphs and direct image exceptions into the same registry and renderer, including window controls, toolbar icons, status glyphs and trajectory controls.
- Keep the existing public SVG paths and semantic aliases compatible; generate all functional SVGs from the same local canonical definitions.
- Preserve brand logos, the native application/tray identity, file-type icons (Seti and PPTX), chart geometry, interaction behavior and button hit targets.
- Supersede the unarchived standardize-web-icon-assets change's IconPark paint, legacy sidebar/send and Windows functional-glyph exceptions. This request explicitly replaces those functional icon styles.

## Capabilities

### New Capabilities

- `web-icon-system`: Canonical monochrome functional icon geometry, size-aware rendering, complete asset generation and source-color enforcement. This capability was proposed by an older change but has not been archived into main specs.

### Modified Capabilities

- `webui-custom-sidebar`: Panel-layout icons retain side and expanded-state meaning while adopting the shared rounded icon family.

## Impact

- `web/public/vs-icons`, the web icon generator, shared icon definitions, Icon.jsx, functional icon call sites, related CSS/tests, and an icon inventory/style guide.
- No daemon/API changes, new runtime dependencies, third-party vendor changes or brand/file-type asset edits.
