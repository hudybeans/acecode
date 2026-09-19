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

## 2026-09-20：按确认稿增加矩形选区背景

基于 `47d20596`，在独立 worktree `composer-selection-visuals` / 分支 `codex/fix-composer-selection-visuals` 中实现。

- 原始圆角徽标与选区层分离，选中只在后方新增矩形，保留底色、边框、文件类型图标颜色和上传状态。未选中与选中时的徽标几何完全一致。
- 前置图标采用与字体对应的尺寸；Seti 字形只放大实际绘制区域，不扩大布局和点击范围。内边距左右相等，移除单边外间距与附件移除按钮的负间距。
- 原有 78 项 Windows Chromium 选择与编辑检查全部通过；新增长路径窄屏检查通过。新增视觉检查覆盖明暗主题、13/14/16/20px 字号、390px、上传状态、取消选区及失焦；首次发现图标选区颜色继承问题，修正后定向复测通过。合计 80 个用例已通过，无浏览器异常。
- `pnpm test` 与 `pnpm build` 通过；构建 3077 模块，4450 个正则字面量兼容性扫描通过。
- `openspec validate fix-composer-tag-selection --strict` 与 `git diff --check` 通过。
- impeccable detector：11 条提醒、1 条 advisory，均位于未修改的既有样式，本次改动行无提醒。

原始完整回归与视觉复测结果分别保存在前述可视化目录的 `additive-final/results.json` 和 `additive-final/visual-regression/results.json`；真实组件截图位于 `additive-confirmed/`。验证范围为生产组件的 Windows Chromium 渲染与交互，本轮没有重新构建或切换用户正在运行的 Desktop 客户端。
