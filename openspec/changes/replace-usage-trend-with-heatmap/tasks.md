## 1. Calendar model

- [x] 1.1 Implement date-only calendar, weekly and window-cumulative aggregation; verify focused tests for year/leap boundaries, partial weeks, missing dates, and zero/invalid values.

## 2. Settings interface

- [x] 2.1 Implement theme-aware heatmap, mode controls, exact hover/focus/tap details and responsive layout; verify browser interaction in light, dark, and custom-accent themes.
- [x] 2.2 Integrate independent annual loading and refresh while preserving 30-day statistics; verify loading, empty, failure, and historical-only data in the settings page.
- [x] 2.3 Update search and English mappings and regenerate the static catalog; verify localized labels and catalog validation.

## 3. Integration verification

- [x] 3.1 Run pnpm test, pnpm build, strict OpenSpec validation, scoped design detector, and git diff --check; inspect final diff for unrelated changes.

## 4. Match the corrected visual reference

- [x] 4.1 Replace the wrapping summary cards with the compact single-row strip; verify all three metrics and their text stay on one row at narrow and wide settings widths.
- [x] 4.2 Render bounded square cells and equally spaced months with uniform SVG scaling, remove horizontal scrolling and the extra footer; verify cell width/height, gaps, radii, full date coverage, maximum dimensions, and localized hover/keyboard details in the browser.
- [x] 4.3 Run frontend tests/build, strict specification validation, scoped design scan, and prepare the reviewed repair for master while preserving unrelated changes.

Verification: all frontend tests passed, production Vite build and regex compatibility scan passed, strict OpenSpec validation passed, scoped Impeccable detector returned no findings, and git diff --check passed. Playwright exercised the real SettingsPage with deterministic mock usage responses at 390, 600, 900, 1280, 1920, and 2560px widths. Assertions verified a single-row summary, 365 square daily cells, twelve equally spaced months, proportional gaps and corner radii, a maximum chart width of 732px, cells below 11px, and no horizontal scrolling. Chinese and English headings and native mode controls fit their scaled SVG frame even at 390px. Daily/weekly/cumulative, hover/focus/click, Enter/Space, Home/End, Escape, built-in light/dark and a custom accent, independent loading/failure, historical-only and empty data, and refresh recovery passed. Final screenshots include the page title and use fixture data; the installed native desktop application was not rebuilt.

## 5. 居中用量概览区域（阶段验证，范围由第 6 节扩展为整页）

- [x] 5.1 让摘要、活动图和六项 Token 统计共用最大宽度并水平居中，保留窄窗口布局与下方明细宽度。
- [x] 5.2 验证宽窄窗口居中与无横向溢出，运行前端测试、构建、严格规范校验和差异检查。

居中验证：Playwright 加载真实 SettingsPage 与模拟用量数据，检查 390、900、1280、1920、2560px 的中英文、明暗主题，以及 1920px 展开窗口，共 12 组布局。三部分左右留白差小于 1px，宽度均为可用宽度与 732px 的较小值；保留六项统计和 365 个日格，无横向溢出，下方明细仍占满内容宽度。390px 同时使用减少动态效果偏好。pnpm test、pnpm build、严格 OpenSpec 校验和 git diff --check 通过，布局检测无发现。截图使用模拟数据，未重新打包桌面应用。

## 6. 使用情况整页居中

- [x] 6.1 将标题、刷新按钮、概览、模型与工作区明细以及提示状态放入统一的 732px 居中容器。
- [x] 6.2 验证宽窄窗口、中英文、展开窗口与提示状态的对齐和无横向溢出，运行前端测试、构建、严格规范校验和差异检查。

整页验证：Playwright 加载真实 SettingsPage 与模拟数据，检查 390、900、1280、1920、2560px 的中英文布局、1920px 展开窗口以及加载、空数据、错误状态，共 14 组。整页宽度等于可用宽度与 732px 的较小值，所有直属内容左右边界与整页一致，左右留白差小于 1px，无横向溢出；有数据时保留 365 个日格。验证等待设置窗口入场动画结束后测量，全程启用减少动态效果偏好。pnpm test、pnpm build、严格 OpenSpec 校验与 git diff --check 通过，布局检测无发现。截图使用模拟数据，未重新打包桌面应用。
