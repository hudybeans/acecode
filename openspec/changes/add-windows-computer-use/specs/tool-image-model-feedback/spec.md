## Purpose

将工具生成的截图作为真实图片反馈给支持视觉的模型，保留附件在会话中的工具来源和调用结果顺序，使电脑操控能够可靠完成观察与动作循环，同时兼容不支持视觉的模型。

## ADDED Requirements

### Requirement: Vision tool feedback
系统 SHALL 将工具图片附件编码为目标 provider 支持的图片内容，不能只显示在 UI 或将 base64 放入普通工具文字。

#### Scenario: Multiple tool results
- **WHEN** OpenAI 兼容模型一次产生多个工具调用，其中结果包含截图
- **THEN** 所有工具结果先完成配对，之后发送可读图片内容，不在同批结果中间插入用户消息。

#### Scenario: Anthropic tool image
- **WHEN** 支持视觉的 Anthropic 模型收到工具截图
- **THEN** 对应 tool_result 包含合法 image block。

#### Scenario: Nonvisual model
- **WHEN** 当前模型不支持视觉或附件无法读取
- **THEN** 保留工具文字，并明确提示图片不可读，不发送无效图片 payload。

#### Scenario: Large accessibility output
- **WHEN** 大型控件树触发通用工具结果持久化与摘要预览
- **THEN** 模型仍能直接读取 observation_id、目标窗口、截图标识和坐标信息，完整观察保存在既有工具结果文件中。

#### Scenario: Multiple related screenshots
- **WHEN** 一次观察带有主窗和弹层的多个图片附件，且其中一张无法读取或被省略
- **THEN** 每张成功反馈的图片紧邻其真实 screenshot_id 和尺寸信息，附件落盘与 provider 转换均保留来源，不因图片位置变化而错配。
