## Why

内置 `list_threads` 的描述与实现都把当前工作区当作会话边界，`read_thread` 和 `wait_threads` 也因此无法访问其他工作区的会话。用户需要查找当前 ACECode 数据目录中的全部会话，工作区只是会话属性。

## What Changes

- 会话列举覆盖全部项目目录和活跃会话，包括隐藏、未注册及无工作区会话，并返回工作区属性。
- 增加列表续页和包含归档参数，保持普通列表的默认归档过滤与置顶规则。
- 读取和等待按全局会话定位；同 ID 分属多个项目时支持用返回的 `workspaceHash` 明确选择。
- 同步模型工具描述、协议文档及跨工作区回归测试。

## Capabilities

### New Capabilities

- `codex-thread-tools`：补充已有未归档变更中的会话工具契约，明确全局列举、读取和等待的范围。

### Modified Capabilities

无。

## Impact

涉及 `ThreadService`、全局会话目录、内置工具 schema、C++ 测试及 `docs/daemon-api.md`。创建和修改类工具保持原有语义；无需修改 WebUI 或迁移会话文件。
