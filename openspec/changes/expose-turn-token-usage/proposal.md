## Why

ACEModel（Codex2API）已经在每次模型请求的流式响应中返回 token usage，但一个 ACECode turn 可能包含多次模型请求和工具往返。现有 daemon API 只逐 step 推送 `usage`，turn 结束的 `busy_changed` / `done` 事件没有本 turn 汇总，API 客户端无法在明确的 turn 边界直接读取本轮总消耗。

## What Changes

- 在一个 regular agent turn 内累加所有已入账 model step 的 token usage。
- turn 结束时，在 terminal `busy_changed` 和 `done` API 事件中返回同一份 `usage` 汇总及 `turn_id`。
- 保留现有逐 step `usage` 和 `model_step_finish` 事件，避免破坏现有消费者。
- provider 未返回 usage 时沿用 ACECode 估算值；只要本 turn 有任一步为估算，汇总的 `has_data` 为 `false`。

## Capabilities

### New Capabilities
- `turn-token-usage-api`: daemon session event 在 turn 边界暴露本 turn token 消耗。

### Modified Capabilities

## Impact

影响 `AgentLoop` 的 turn 级计量聚合、daemon WebSocket session event 契约、对应单元测试与 `docs/daemon-api.md`；不改变 ACEModel/Codex2API 请求格式，不新增 HTTP 请求，也不改变持久化 session 累计用量。
