# exec-sandbox Spec (delta)

## ADDED Requirements

### Requirement: 沙盒配置实时下发
`SessionRegistry::refresh_sandbox_config(const SandboxConfig&)` SHALL 对每个活跃会话经 `enqueue_control` 调 `AgentLoop::set_sandbox_config`;`refresh_exec_rules()` 同样经 `enqueue_control` 调 `reload_exec_rules()`。下发 MUST 与回合串行,不在模型请求中途翻转策略。

#### Scenario: 空闲会话立即生效
- **WHEN** 会话空闲时 PUT 沙盒配置
- **THEN** 该会话下一次 bash 的策略已包含新清单
