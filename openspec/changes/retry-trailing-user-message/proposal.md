## Why

Desktop 会话停留在用户消息时，空输入目前无法再次请求模型。直接复制并追加用户消息会形成连续 user 记录，影响要求角色交错的模型。

## What Changes

- 完整 transcript 末尾为已持久化用户消息、会话空闲且输入无新内容时，允许点击发送或按 Enter 重试该消息。
- 用户主动中断完成后也允许空输入重发上一条用户消息，保留中断前已有输出。后端持久化明确的用户中断标记，不通过提示文案判断。
- 重试复用原始模型输入、附件及上下文；末尾仍是该用户时保留原身份，主动中断且已有完整 assistant/tool 记录时以新身份追加，避免相邻 user。
- 后端原子校验会话空闲状态和消息身份；除明确的用户中断外，非用户末尾、过期请求及忙碌状态均拒绝。

## Capabilities

### New Capabilities

- `trailing-user-message-retry`: 对 transcript 最后一条用户消息进行受校验保护的空输入重试。

### Modified Capabilities

无。忙碌时空输入仍不能排队。

## Impact

涉及共享 Desktop/Web composer、会话 API、SessionClient 和 AgentLoop。新增重试端点及前后端回归测试，无新依赖，不修改 TUI 交互。
