## Why

ACECode 目前不能读取或操作 Windows 桌面应用。用户需要在设置的内置工具中明确开启“电脑操控 / Computer Use”，然后由模型观察窗口并执行操作，关闭时撤销能力。

## What Changes

- 增加默认关闭的持久化开关、设置 API 与中英文设置行，第一阶段仅 Windows 可开启。
- 增加 Windows 原生工具：发现/启动应用、窗口观察、截图、UI Automation 控件树、窗口激活、点击、文字输入、快捷键、滚动、拖拽、控件赋值及辅助动作。
- 使用独立执行器隔离 UI Automation 阻塞，绑定会话、串行操作桌面，取消、关闭开关和回合结束释放执行器。
- 截图通过附件进入支持视觉的模型请求，保留工具调用与结果配对顺序。
- 参考本地 Codex 的工具协议和 Windows 能力边界，自主实现原生后端；不依赖其未开源的插件运行时。

## Capabilities

### New Capabilities
- `windows-computer-use`: 显式启用的 Windows 桌面观察与操作闭环。
- `tool-image-model-feedback`: 工具图片附件进入模型请求并保留调用顺序。

### Modified Capabilities

无。

## Impact

涉及配置、Web API、内置工具注册、AgentLoop 生命周期、Windows 原生执行器、OpenAI/Anthropic 请求序列化、设置 UI、构建安装与测试。macOS/Linux 保持可编译，界面明确当前不支持开启。
