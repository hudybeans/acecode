## Context

参见 proposal.md。现有 RichComposer 使用 Slate inline void 表示命令、技能、路径、会话及附件；附件在纯文本中的长度为零。删除已使用实际 Slate range，但单个 void 的折叠选区和普通文字的折叠光标仍需区分。附件根节点阻止 mousedown，所有 tag 设为 user-select:none。命令同步通过 withoutSaving 替换整棵树，同时保留旧 history，已经用真实 Slate 重现撤销失效。

## Goals / Non-Goals

**Goals:** 维持一个 Slate 选区作为编辑操作依据；通过真实 Windows 浏览器键鼠操作验证原子 tag 和混合选择。现有外观、草稿格式、附件注册表和 IME 保护继续适用。

**Non-Goals:** 更换编辑器、重做聊天框视觉、调整后端附件协议、发布安装包或修改当前 master 的未提交工作。

## Decisions

- 原生浏览器负责文字起手拖选与 Shift 选区扩展；tag 起手由 RichComposer 的 mousemove/mouseup 适配器负责，根据真实 DOM 命中更新 Slate range。起止 tag 整体纳入，不用纯文本偏移重建混合选区，避免零长度附件丢失。
- 明确区分 tag 原子选中与普通折叠光标，剪贴板、剪切和删除共享语义；纯文本复制保留可读 token，应用内结构化复制保留引用。
- 图片单击选择、双击预览，移除按钮保留独立事件，拖选不触发预览。
- 键盘进入 void 时即展开到前后可编辑边界，避免 Chromium 在 contenteditable=false 内不产生 beforeinput/paste 事件；编辑器插入方法也共享原子 tag 替换保护。
- 下拉菜单只消费无修饰键，组合键与 IME 交还输入框；对父层发布真实选区 collapsed 标志，让零文本长度的附件选择关闭候选。
- 命令自动转换使用局部 Slate transform，并与触发转换的编辑合并历史；避免重建 root 后保留失效路径。
- 浏览器 harness 直接加载生产组件和样式，使用真实鼠标与键盘；记录基线故障及修复后的结果。纯模型测试补充历史与选区边界。
- 2026-09-20 用户确认的视觉增补：矩形属于选区，tag 本体保留原有圆角、底色、边框及图标颜色。选区背景独立绘制在 tag 后方，与周围文字连通，取消选择仅撤掉这一层；不得再用选中态覆盖 tag 本体颜色或圆角。
- 前置图标随文字字号缩放，修正左右不对称的外间距及内边距。这些调整仅作用于输入框，已发送消息使用的共用徽标样式保持不变。

## Risks / Trade-offs

- 浏览器原生选区可能进入不可编辑节点内部 → 用键鼠复现、DOM/Slate 选区和操作后内容一起判断，不能仅看高亮。
- 图片 tag 的点击同时承担预览 → 保持明确的预览操作入口，并覆盖拖选不会误触。
- 自动转换与撤销可能互相触发 → 测试转换后 undo/redo 及含附件的草稿。
- Windows Chromium 测试不等于已安装 WebView2 客户端验证 → 在验证记录与交付说明中写明边界。
