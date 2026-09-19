## Why

Windows 聊天输入框的 tag 与文字共用 Slate 选区，但附件鼠标事件、原生选择和命令自动转换使用了不一致的处理路径，容易出现选不中、混选操作丢失 tag 或撤销失效。需要通过真实键鼠探索性测试明确边界并直接修复。

## What Changes

- 统一命令、技能、路径、会话和附件 tag 的原子选择行为，覆盖单击、鼠标双向拖选、Shift 加方向键及整段选择。
- 保证混合选区的复制、剪切、替换、删除、撤销和重做保持文字与引用顺序。
- 修复自动命令 tag 转换破坏撤销历史的问题。
- 增加 Windows Chromium 浏览器回归脚本与探索性验证记录，保留现有界面样式和输入法保护。

## Capabilities

### New Capabilities
- `composer-tag-selection`: 输入框内 tag 与文字的选择、编辑和剪贴板交互契约。

### Modified Capabilities

无。

## Impact

涉及 `web/src/components/RichComposer.jsx`、输入框样式、Slate 辅助函数及回归测试。保持现有草稿与附件协议，不改变后端，不引入编辑器依赖。
