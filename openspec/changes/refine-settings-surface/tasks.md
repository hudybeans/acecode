## 1. Settings surface

- [x] 1.1 Remove the shared title bar, retain an accessible dialog name and independent window actions, and verify the existing dialog architecture checks.
- [x] 1.2 Apply scoped surface colors and single group boundaries, then inspect rendered light/dark, accent, scaled, and narrow layouts with input borders intact.

## 2. Integration verification

- [x] 2.1 Run Web tests/build, strict OpenSpec validation, the design detector, and browser checks for navigation, search, expansion, scrolling, and close behavior; remove the temporary preview page.

Verification: The Web test runner passed (2,135 pass assertions), production build and regex compatibility checks passed, and strict OpenSpec validation passed. Chromium checked the real Settings component in ten states: General, Appearance, Config, restored dialog, light/dark with blue/orange accents, 1280x720 scaling, 600px width, and large English text. Column edges aligned, actions remained outside the scrollport, group rules were absent, input borders remained, and content had no horizontal overflow. Search, independent scrolling, exact 13px expansion, restore, close, and mask dismissal passed with no browser exceptions or API writes. The design detector found only pre-existing styles outside the changed Settings region. Temporary preview HTML was removed; screenshots and measurements are stored in the task visualization directory.

## 3. 统一设置标题字重

- [x] 3.1 保留主标题和一级标题字重，统一字段、选项、卡片、导航及设置子弹窗内下级标题为常规字重，并同步前端样式规范。
- [x] 3.2 运行 Web 测试、构建和严格 OpenSpec 校验；在浏览器检查各设置分区的实际字重，以及明暗主题、中英文、窄屏和减少动态效果状态。

2026-09-19 验证：`pnpm test` 通过（2,552 条 pass 记录），`pnpm build` 和产物正则兼容检查通过，严格 OpenSpec 校验及 `git diff --check` 通过。Chromium 在 24 个页面/状态检查实际字重，覆盖全部 15 个设置入口、模型编辑及拖动预览、安全中心各页签、主题导入、明暗主题、390px 中英文大字号与减少动态效果。所有字段、选项和下级标题为 400，保留加粗的文字均为主标题或一级分组标题；模型表单 label/legend/h4、拖动预览另有实际样式断言。验证使用模拟 API，无真实配置写入，无浏览器异常。设计检测器只报告 globals.css 其他区域的 12 项既有样式，不涉及本次修改。

验证边界：390px 英文大字号下，未修改的配置页“标题 + 重新检测”单行布局仍有 68px 横向溢出；本次未扩展为响应式布局修复。其余桌面状态和 390px 中文配置页无内容横向溢出。尚未重新打包或启动原生 Desktop 验证。临时页面已清理，截图、模拟数据和实际字重记录保存在任务可视化目录的 `settings-typography/`。
