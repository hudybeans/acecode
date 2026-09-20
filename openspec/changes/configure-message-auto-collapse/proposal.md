## Why

当前会话自动把过程消息、工具段和完成轮次收进摘要，用户无法选择始终展开消息。外观设置需要提供持久化开关，主会话与子代理一致遵守。

## What Changes

- 在外观页新增一级分组“会话”，提供默认开启的“消息自动折叠”。
- 开启沿用现有折叠；关闭后消息及整段活动直接显示，仅保留单个工具调用自身的折叠。
- 图片与子代理分组直接展开，系统通知直接显示；完成总结、工具配对、子代理入口和运行提示继续可用。
- 新增 `web_ui.message_auto_collapse`，经配置文件、偏好 API、Desktop 启动注入和前端共享偏好持久化。

## Capabilities

### New Capabilities
- `message-auto-collapse-preference`: 可持久化、即时生效的会话折叠策略。

### Modified Capabilities

## Impact

涉及配置解析与序列化、UI preferences API、Desktop bootstrap、外观页及主会话/子代理共享 transcript 投影和渲染。默认值保持兼容，不修改会话历史数据。
