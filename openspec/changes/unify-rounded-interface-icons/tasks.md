## 1. Inventory and design contract

- [x] 1.1 Inventory public assets, inline functional glyphs, direct-image/mask consumers and exclusions; verify the source audit covers all 86 existing public SVGs and record dirty-file hashes.
- [x] 1.2 Define the rounded monochrome family and preserve brand/file-type scope; verify proposal, design and delta specs reflect the user's confirmed exclusions and supersede old functional style exceptions.

## 2. Canonical artwork and runtime

- [x] 2.1 Redraw the complete public family and additional scattered functional glyphs on the shared 20-unit grid; verify every old asset name resolves and all paint is currentColor/none.
- [x] 2.2 Replace the partial vendor generator with deterministic exports from the full local registry; verify regeneration check mode reports no drift and excluded assets retain their hashes.
- [x] 2.3 Render functional icons through the shared currentColor path with size-aware strokes; verify 16/20/24 px weights, accessibility, arbitrary theme color inheritance and filled panel states.
- [x] 2.4 Migrate scattered inline/typographic controls and direct-image exceptions without changing layout or interactions; verify source coverage and focused component tests.

## 3. Documentation and verification

- [x] 3.1 Deliver the complete icon inventory/style guide and a browsable specimen gallery; verify every canonical symbol is visible at native and enlarged sizes.
- [x] 3.2 Update obsolete vendor/path assertions and add meaningful color/coverage/regeneration checks; run focused tests, pnpm test and pnpm build successfully.
- [x] 3.3 Review all glyphs plus representative light/dark desktop and 390px layouts; verify no clipped/blank icons, preserved state meaning, and theme inheritance.
- [x] 3.4 Validate the OpenSpec change strictly, review scoped diffs and verify unrelated user changes and excluded assets are preserved; record final evidence and limitations.

## 4. User refinement: MCP, experts and plugin wording

- [x] 4.1 Replace the shared MCP symbol with an outlined plug and introduce an outlined head-and-gear expert symbol at expert entry points, preserving model/reasoning icons.
- [x] 4.2 Rename user-facing connector wording to plugins in settings and translations while preserving config/API identifiers.
- [x] 4.3 Regenerate assets/gallery, inspect the two symbols at native sizes, and pass frontend tests/build and strict change validation.

## 5. 列表开关图标细化

- [x] 5.1 两处列表开关使用同一三横线图标、16 px 尺寸及圆端点细线；列表展开时按钮显示激活状态。
- [x] 5.2 验证列表展开/收起切换、明暗主题、SVG 导出及前端测试与构建。

## 6. 新建任务图标简化

- [x] 6.1 使用用户确认的纸张与简笔轮廓，移除纸上文字和多余细节，平滑笔尖过渡，保持 18 px 显示尺寸和主题颜色继承。
- [x] 6.2 重新生成 SVG，确认与批准稿路径一致，并通过前端测试、构建及变更校验。
- [x] 6.3 按用户反馈将纸张方框圆角由 1.5 加大到 3 个视图单位，保持外框边界、平滑笔尖、尺寸及线宽不变。
- [x] 6.4 重新导出图标，检查实际尺寸与放大预览，并通过前端测试和构建。

## 7. 扩展图标简化

- [x] 7.1 使用三个空心圆角正方形和右上角一个圆形，整齐排列为 2×2；将轮廓收紧至 3.5–16.5 坐标范围，沿用共享尺寸、线宽和主题颜色继承。
- [x] 7.2 重新导出 SVG，检查菜单实际尺寸、边界和明暗预览，并通过前端测试、构建和变更校验。
