# 验证记录

日期：2026-09-18。

- `pnpm test`、`pnpm build` 通过；构建产物正则兼容检查通过。
- `node scripts/regenerate_web_icons.mjs --check` 通过，110 个功能 SVG 与单一图形源一致。
- `openspec validate unify-session-titlebar --strict`、`git diff --check` 通过。
- 使用真实 TopBar、ChatView、DesktopContextMenu、GlobalFindOverlay 和 SideChatWindow 组件；后端响应及原生窗口桥接使用隔离样例，未向真实会话发送操作。
- 7 组浏览器检查：Windows 普通/最大化、macOS 窗口/全屏、390 px 浏览器英文暗色、390 px Windows 中文亮色、只读会话；覆盖 DPR 1/1.5 和 reduced-motion。
- 实测顶栏 41 px，按钮中心 y=20 px，三点与控制台间隙 4 px，功能组与 Windows 窗口控制组间距 40 px，无第二行标题和横向溢出。
- 三点菜单每项均有图标；侧边聊天、查找、归档回调、控制台点击与空白窗口拖动通过。Escape 返回触发按钮焦点，方向键/Enter 可选择菜单项。
- 会话切换关闭旧菜单；返回首页清理标题及按钮；只读会话仅显示查找。macOS 全屏避让按 80 → 8 → 80 px 变化，无自绘窗口控制组。
- 菜单分隔线为独立 DIV、1 px 高、0 圆角；右键入口和三点入口均使用同一渲染器。其他菜单现有独立直线无需变更。

截图、可复现检查脚本和矩形数据保存在本任务可视化目录 `unified-titlebar/`（fixture.html、review.cjs、results.json）。源码与浏览器组件验证已完成，未重新打包安装 Desktop，也未在原生 macOS 上验收。

## 交互修正复核

- 修改前实测：多个顶部按钮 hover 仍为透明背景；右键菜单打开后按下标题栏，mouseup/click 之前菜单仍存在，进入模拟原生拖动回调时也仍存在；右侧面板折叠时出现重复恢复按钮。
- 修改后亮/暗两组检查通过：顶部所有可操作图标的 hover 背景与最小化按钮相同，圆角统一 7 px；关闭按钮保留自身红色 hover。
- 右键菜单在标题栏 pointerdown 后、mouseup 之前已关闭，模拟原生拖动回调检查菜单 DOM 也已移除。点击菜单内不会提前关闭，侧边聊天正常打开；点击菜单外控制台按钮关闭菜单且执行控制台回调一次。
- 正文、会话标题、侧栏的触摸 pointerdown 和阻止冒泡场景均可关闭菜单。重复面板恢复入口已移除。
- `pnpm test`、`pnpm build` 和 `git diff --check` 再次通过；交互脚本与修改前后数据位于 `unified-titlebar/interaction-check.cjs`、`interaction-before.json`、`interaction-results.json`，截图为 `interaction-light.png` 和 `interaction-dark.png`。
