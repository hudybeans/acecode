# 验证记录

2026-09-19，Windows，基线 b973acec。详细矩阵和复跑命令见 `docs/composer-tag-selection-testing.md`。

- RichComposer 浏览器键鼠回归：78/78 通过；浏览器异常与 console errors 均为零。
- InputBar 候选菜单浏览器回归：16/16 通过；旧版同组 12 项失败。
- 纯 Slate 命令同步 11 项、选区与指针 14 项，以及已有键盘/IME、草稿、生命周期测试通过。
- `pnpm test` 通过。SVG 测试对 Git 的 CRLF checkout 归一化后可直接在 Windows 重跑，无 SVG 资源变更。
- `pnpm build` 通过，3077 模块，4450 个正则字面量兼容性扫描通过。
- `openspec validate fix-composer-tag-selection --strict` 与 `git diff --check` 通过。
- impeccable detector 完成，12 条提醒均在 globals.css 未变更的既有代码；本次修改行无提醒。
- 明暗主题、中英文、390px 与 reduced-motion 四种截图已检查，选择填充完整，无横向溢出。

原始浏览器结果和截图保存在 `C:/Users/shao/.codex/visualizations/2026/09/19/01a0b9c0-da2f-7001-bc01-1fb359fafdaf/composer-selection/final/`。

测试使用生产组件和真实 Windows Chromium 鼠标/键盘事件。未重新构建已安装 Desktop/WebView2，未操作微软拼音实际候选窗或用户正在运行的 Codex 草稿；IME 为合成事件及模型回归。
