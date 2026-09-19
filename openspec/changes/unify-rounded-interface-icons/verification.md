# Verification — 2026-09-17

## Completed

- All 108 canonical definitions are deterministically exported: 86 existing public filenames and 22 newly centralized functional symbols. SVG paint is limited to currentColor/none; no proprietary Claude artwork is bundled.
- `node scripts/regenerate_web_icons.mjs --check`: passed.
- `pnpm test` from `web/`: passed, including six new icon contract/rendering groups and updated migration assertions.
- `pnpm build` from `web/`: passed; 3065 modules transformed, bundled JavaScript regex compatibility check passed (4448 regex literals).
- `openspec validate unify-rounded-interface-icons --strict`: passed.
- `git diff --check`: passed.
- All 196 snapshotted brand/file-type/native resources retain their initial SHA-256 hashes. The FileTypeIcon renderer remains unchanged.
- Five unrelated dirty files retain byte-identical hashes. Existing changes to runTests.js and globals.css were preserved; the former only gained this task's test import, and the latter received scoped icon CSS edits alongside the existing loading-dot changes.
- Added a narrow .gitignore exception so the authored `web/src/lib/icons/` directory is not hidden by the macOS `Icon?` pattern on case-insensitive Windows filesystems.

## Visual evidence

The standalone gallery includes all 108 names with enlarged artwork, native 16/20/24 px specimens, dark mode, inherited-color switching, filtering, and individual SVG downloads. Browser inspection found no blank/clipped glyphs or gallery overflow at 390 px. A fresh finishing reviewer found no blocking visual defects.

Real production Sidebar, WindowControls, ActivityLine, VsIcon and globals.css were also rendered in an isolated Chrome fixture with mock API data and native callbacks. All eight combinations of 1280/390 px, light/dark and Chinese/English passed: 65 inline icons per case, 17 visible sidebar icons, no browser page errors or horizontal overflow. Measured strokes are 1/1.2/1.4 px at 16/20/24 px; currentColor inheritance, panel fill states, 36×30 window-button hit areas and 14×14 window glyphs are preserved. Simulating CSS mask support detection failure still renders the known icons as inline SVG.

The Impeccable detector ran once. Its 12 findings all point to pre-existing global CSS declarations outside this change; none concerns the new icon family.

## Reproduction and limits

See `docs/design/interface-icons.md` for regeneration and gallery commands. Local review artifacts are under `C:/Users/shao/.codex/visualizations/2026/09/17/01a0afdc-a96a-78f0-82dd-98da630d06ef/acecode-icon-unification/`, including the gallery, screenshots, test/build logs, preservation hashes and `runtime-review/results.json`.

Visual checks cover the complete glyph family and representative real components in a controlled browser fixture, not a complete live app or the native desktop shell. The standalone 20 px SVGs scale proportionally when used by legacy CSS masks; the React component applies size-aware optical strokes. No package, release or commit was created.

## User refinement: MCP, experts and plugins

The inventory now has 109 symbols. MCP is an outlined plug; the new Expert symbol is an outlined human profile with a small six-tooth gear. Expert navigation, composer selection and catalog empty-state entry points share Expert, while model/reasoning Brain artwork remains intact. Both refined symbols contain no solid fill. Settings and related connector placeholders now say 插件 / Plugins; connector API/config identifiers remain unchanged. Translations were rebuilt using `pnpm i18n:catalog`, which also removed the stale, unreferenced 等待回复 catalog entry from the existing source state.

Full `pnpm test`, `pnpm build`, generator `--check`, `git diff --check` and strict OpenSpec validation passed after refinement. The two symbols were inspected at native 16/20/24 px and enlarged sizes. Production Sidebar was additionally checked in desktop/light/Chinese and 390px/dark/English fixtures: MCP and Expert are present, 16px strokes measure 1px, no horizontal overflow or page errors. Settings terminology is covered by source/catalog/navigation tests; it was not mounted in this narrow fixture.

New evidence is saved as `refinement.html`, `refinement.png`, `refinement-mobile.png`, `refinement-test.log`, `refinement-build.log` and `runtime-review/refinement-*` under the same artifact directory. The main gallery and downloadable SVG archive were updated to 109 icons.

## Menu size refinement — 2026-09-18

After the 20 px sidebar trial, the user requested a smaller size and consistent settings menus. Sidebar actions/disclosures/footer/quick-menu icons now use 18 px, as do all 15 Settings navigation items and its search icon. This supersedes the earlier sidebar 20 px trial; unrelated content controls keep their own sizes. The shared renderer gives these icons a 1.1 px stroke. Existing button dimensions and row classes are unchanged.

Full frontend tests and build passed. Actual Sidebar and SettingsPage components were mounted together in a controlled browser fixture at 1280 px dark Chinese and 390 px light English. All 17 visible sidebar icons and 16 settings navigation/search icons measured 18×18 px with 1.1 px strokes in both cases, with no page errors or horizontal overflow. Hidden hover-only actions were excluded from bounding-box assertions. Screenshots and measurements are in `runtime-review/menu18-1280.png`, `menu18-390.png` and `menu18-results.json`. Native desktop shell behavior was not exercised.


## 2026-09-18 列表开关细化

- 侧边列表面板与预览详情栏使用同一 `ListPanel` 三横线图标，尺寸 16 px，实际描边 1 px，圆端点、currentColor；按钮保留原点击区域。
- 列表打开时 `aria-pressed` 与 `aria-expanded` 均为 true，主题强调色和背景保持激活；收起后预览栏的恢复按钮为普通状态。
- 实际 SidePanel / PreviewDetailsPanel 浏览器验证通过：明暗主题、中文/英文、125% 像素密度、减少动态效果、悬停不丢失激活样式、鼠标收起与键盘重新展开。两处 SVG 的几何、占位和线宽相同。
- `pnpm test`、`pnpm build`、图标生成器 `--check`、OpenSpec 严格校验与 `git diff --check` 通过；图标族现为 111 枚。
- 浏览器脚本、结果、截图及图标总览位于 `C:/Users/shao/.codex/visualizations/2026/09/17/01a0afdc-a96a-78f0-82dd-98da630d06ef/list-panel-toggle/`。未重新打包桌面安装包。
