# model-family-adaptation

## ADDED Requirements

### Requirement: 模型族与 apply_patch 偏好判定
系统 SHALL 提供按模型 id(不看 provider 名)判定的纯函数:`model_prefers_apply_patch(id)` 在小写 id 满足「含 `gpt-` 且不含 `gpt-4` 且不含 `oss`」或「含 `codex`」时为真;`detect_model_family(id)` 区分 GptCodex(含 codex)/ Gpt(其余偏好 apply_patch 的 gpt)/ GptLegacy(gpt-4* / o1 / o3 / o4)/ Anthropic(claude)/ Gemini(gemini-)/ Default。

#### Scenario: GPT-5 家族
- **WHEN** id 为 `gpt-5`、`gpt-5.1-codex`、`openai/gpt-5-mini`、`GPT-5-Codex`
- **THEN** 偏好 apply_patch 为真

#### Scenario: 不切换的 id
- **WHEN** id 为 `gpt-4o`、`gpt-4.1`、`gpt-oss-120b`、`claude-sonnet-4`、`o3`
- **THEN** 偏好 apply_patch 为假

### Requirement: 按模型过滤模型侧工具表
AgentLoop 每次组装请求 SHALL 按当前 Provider 快照的模型 id 过滤模型侧工具定义:偏好 apply_patch 时移除 `file_edit` / `file_write`(按当前生效的模型侧名),否则移除 `apply_patch`;紧急请求档的核心工具名单包含 `apply_patch`。三个工具 MUST 始终保持注册,历史或别名调用仍可执行;过滤结果在同一回合内逐字节稳定。

#### Scenario: GPT 模型
- **WHEN** 当前模型 id 为 `gpt-5`
- **THEN** 请求工具表含 `apply_patch`,不含 `file_edit` 与 `file_write`

#### Scenario: 非 GPT 模型
- **WHEN** 当前模型 id 为 `claude-sonnet-4`
- **THEN** 请求工具表含 `file_edit` 与 `file_write`,不含 `apply_patch`

#### Scenario: 中途切模型
- **WHEN** 会话从 Claude 切到 GPT-5 再发一轮
- **THEN** 新一轮请求的工具表按 GPT 规则过滤,ToolExecutor 未重建

### Requirement: 模型族系统提示分支
`build_system_prompt` SHALL 接受可选的 `SystemPromptModelState`;当 `prefers_apply_patch` 为真时,工具使用指引 MUST 不再提及 `file_edit` / `file_write`(含 shell 指引里的「用 file_write 写多行内容」),改为 apply_patch 指引(相对路径、3 行上下文、`@@` 锚点、禁止 shell / Python 改文件),并追加 GPT 家族行为指引段;`SystemPromptModelState` 为空或非 GPT 家族时输出 MUST 与改动前逐字节一致。提示内容只随模型切换变化。

#### Scenario: GPT 态提示
- **WHEN** 以 `gpt-5` 模型态构建提示
- **THEN** 输出含 `apply_patch` 指引与 `# Model-specific guidance` 段,不含 `file_edit` / `file_write` 字样

#### Scenario: 非 GPT 态提示不变
- **WHEN** 以 `claude-sonnet-4` 模型态与不传模型态各构建一次
- **THEN** 两份输出逐字节相同
