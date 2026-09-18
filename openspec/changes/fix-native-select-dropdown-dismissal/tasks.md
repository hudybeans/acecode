## 1. Shared select behavior

- [x] 1.1 Add Windows Desktop feature-gated select styling and Escape handling; verify focused guard tests and physical mouse opening in WebView2.
- [x] 1.2 Verify real language and feedback controls, option selection, Escape, disabled/list controls, and long labels in light/dark themes with a native-host integration check.

## 2. Validation

- [x] 2.1 Run Web tests and build, strict OpenSpec validation, and scoped diff checks; record results and runtime limitations.

## 3. 下拉菜单内容宽度

- [x] 3.1 修复共享下拉菜单被触发器宽度压窄的问题，保留视口限制、正常字重和长文本换行能力。
- [x] 3.2 浏览器验证关闭行为、语言等实际控件及右侧边缘、明暗主题、中英文、大字号、长标签、禁用项和键盘操作；运行 Web 测试、构建与严格 OpenSpec 校验。

2026-09-19 验证：真实 SettingsPage 配合模拟桌面桥在 Chromium 复现旧宽度：89.08px 菜单内三个中文选项均为两行；新样式菜单自然展开到 120.25px，三项均为一行，触发器宽度不变。10 组场景包含修复前后对照、界面语言、暗色、中英文大字号、390px 窄屏、禁用托盘项、右下角翻转，以及超长中文标题和无空格路径。超长菜单限制在 374px 宽度并纵向滚动，选项无横向溢出、全部为 400 字重。鼠标选择与键盘选择各只写入一次模拟值，Escape 仅关闭菜单，禁用项被跳过，无浏览器异常。

`pnpm test` 通过（2,559 条 pass 记录），`pnpm build`、产物正则兼容检查、严格 OpenSpec 校验和 `git diff --check` 通过；select.css 设计扫描无发现。验证预览使用独立 Vite 缓存，避免共享缓存导致重复 React；临时页面、临时配置及预览进程已清理。截图与测量数据保存在本任务可视化目录的 `settings-select/`。本次未重新打包 Desktop 或重复原生 WebView2 物理鼠标验证。
