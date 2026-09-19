# Windows 聊天输入框 tag 探索性测试

测试日期：2026-09-19。基线：`b973acec`。工作分支：`codex/fix-composer-tag-selection`。

## 已复现及修复

| 操作 | 原行为 | 修复后行为 |
| --- | --- | --- |
| 单击附件或图片 tag | 附件不能选中，图片直接打开预览 | 单击选择整枚 tag；图片双击预览 |
| 单击 tag 后复制、剪切、打字、粘贴 | 看起来已选中，但部分操作丢失引用或没有效果 | 统一使用 tag 两侧的可编辑选区，操作准确作用于该 tag |
| 从 tag 内部向前或向后拖选 | 选区被困在不可编辑标签内部 | 拖选可跨文字、多个 tag 和换行；起止 tag 整体纳入 |
| 方向键移到 tag 后打字或粘贴 | Chromium 在不可编辑节点内不产生有效输入，字符被吞 | 键盘选中的 tag 与鼠标使用相同的编辑边界 |
| 连续无空格 tag，选中前一个后 Delete | 可能错误删除后一个 tag | 精确删除当前选中项，撤销恢复原顺序 |
| 输入 `/init ` 自动转换后 Ctrl+Z | 撤销记录保留旧节点路径，内容没有撤回 | 命令转换与触发编辑共享历史，支持撤销、重做 |
| `/` 或 `@` 候选打开时使用 Shift/Ctrl 等组合键 | 候选捕获选择、行首行尾导航或换行快捷键 | 组合键回到编辑器处理，形成选区时关闭候选 |
| 附件多选但纯文本长度为零 | 可能继续显示候选菜单 | 使用实际选区是否折叠的信息判断 |

## 回归覆盖

最终浏览器回归共 **94 项通过**：tag 编辑 78 项、候选菜单 16 项；没有浏览器运行错误。`pnpm test`、`pnpm build`、OpenSpec 严格验证及 `git diff --check` 均通过。明暗主题、中文/英文、390px 及减少动态效果共四种截图状态已检查。

`web/scripts/test-composer-selection.mjs` 直接加载生产 RichComposer 和样式，使用真实 Windows Chromium 鼠标、键盘和剪贴板操作。覆盖命令、技能、路径、会话、文件附件、图片附件，单选、双向拖选、tag 到 tag、文字到 tag、Shift 左右/上下/Home/End、全选、复制、剪切、粘贴、替换、Backspace/Delete、撤销/重做、重复附件、多行与 390px 换行。

`web/scripts/test-composer-completion.mjs` 加载生产 InputBar 和候选菜单，以固定文件及命令 API 验证候选弹出状态下的组合键、关闭选区候选、普通 Enter/Tab 和目录导航。当前 16 项全部通过；换回原父层源码后，其中 12 项失败，普通 Enter/Tab 的 4 项通过。

纯 Slate 测试覆盖命令历史、附件零长度边界、连续 tag、鼠标回调和多种插入操作。已有 IME 保护测试继续运行。Windows 全量测试中发现 SVG 文本断言依赖 LF，测试现在只对换行格式归一化，未改变 SVG 资源。

## 执行方式

在 `web` 目录执行：

```powershell
pnpm test
pnpm build
```

浏览器测试使用单独安装的 Playwright，不修改项目依赖：

```powershell
npm install --prefix "$env:TEMP/ace-composer-browser" playwright
$env:ACE_PLAYWRIGHT_MODULE = "$env:TEMP/ace-composer-browser/node_modules/playwright/index.mjs"
node "$env:TEMP/ace-composer-browser/node_modules/playwright/cli.js" install chromium
node scripts/test-composer-selection.mjs
node scripts/test-composer-completion.mjs
```

可用 `ACE_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium。选择测试可用 `ACE_COMPOSER_TEST_OUTPUT` 保存 JSON 结果，附加 `--screenshots` 保存明暗主题及中英文窄屏截图；`ACE_COMPOSER_TEST_FILTER` 按用例名过滤。脚本启动独立本地 Vite 测试服务并在结束时关闭浏览器和服务，不连接运行中的客户端或真实账户。

## 验证边界

- 验证使用 Windows 本机 Chromium，真实生产 React 组件及键鼠操作，后端 API 使用固定 fixture。
- 未重新构建或安装 ACECode Desktop，未验证当前安装包里的 WebView2。
- IME 回归使用合成 composition/keyCode 229 事件和模型测试，未操作微软拼音真实候选窗口。
- impeccable 检测发现的 12 处提醒均来自 globals.css 中未修改的既有样式，本次变更行未命中。
- 测试和修复在独立 worktree 完成；未发布版本或操作用户正在使用的 Codex 草稿。
