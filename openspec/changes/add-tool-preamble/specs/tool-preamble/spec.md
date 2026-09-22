# tool-preamble Spec (delta)

## ADDED Requirements

### Requirement: 配置与默认关闭
`config.agent_loop.tool_preamble` SHALL 含 `enabled`(默认 false)、`mode`(`prompt` | `reasoning` | `sidecar`,默认 `prompt`)、`sidecar_model`(saved model 名,空 = 沿用会话模型)、`sidecar_wait_ms`(默认 2000,clamp [0, 15000])。非法 `mode` MUST 在加载时归一化为 `prompt`;保存 MUST 稀疏(与默认相同的键不写出)。

#### Scenario: 默认关闭
- **WHEN** 配置里没有 `tool_preamble` 段
- **THEN** 功能关闭,系统提示、事件流与落盘 metadata 与改动前逐字节一致

#### Scenario: 非法 mode
- **WHEN** `mode` 写成 `"auto"`
- **THEN** 加载后 `mode == "prompt"` 并记一条 WARN

### Requirement: 标题来源
开启后每个含工具调用的模型步 SHALL 按 `mode` 解析一条标题:
- `prompt`:assistant 正文是单个非空行、不含代码围栏、不超过 160 个 code point 时,规整后的那一行;否则无标题。
- `reasoning`:推理内容里第一对闭合 `**…**` 的内文;没有时取首行首句(去掉 Okay, / 好的， 等口头填充),截到 60 个 code point;不足 2 个 code point 视为无标题。
- `sidecar`:第一个完整工具调用露头时用用户请求、assistant 正文与调用预览另发一次请求,清洗后的第一行;落盘前最多等待 `sidecar_wait_ms`。

#### Scenario: 加粗标题
- **WHEN** reasoning 模式下推理流含 `**Reading registry sections**`
- **THEN** 标题为 `Reading registry sections`,且在流式期间 `agent_progress{phase:reasoning}` 的 label 已是该标题

#### Scenario: 长正文不算前言
- **WHEN** prompt 模式下 assistant 正文是两段说明
- **THEN** 该批次无标题,正文照常作为普通消息显示

### Requirement: 落盘与事件
有标题时 assistant(tool_calls) 消息 MUST 在落盘前带 `metadata.tool_preamble = {title, source}`;daemon MUST 在该批次的 `tool_start` 之前发 `tool_preamble{batch_id, tool_call_ids, title, source, late:false}` 事件;`agent_progress` 的 `tool_planning` / `tool_running` 在有标题时 label MUST 为标题。sidecar 迟到的标题 MUST 以 `late:true` 事件送达且不写入 JSONL。

#### Scenario: sidecar 迟到
- **WHEN** 旁路摘要在 `sidecar_wait_ms` 内没有返回
- **THEN** 消息按无标题落盘,工具执行完或回合末补发 `late:true` 事件

### Requirement: Web 渲染
Web 投影 SHALL 按标题把活动段拆成多行 `activity_summary`,标题优先于阶段文案与并行计数;prompt 来源的 assistant 正文 MUST 折进分组而不是独立气泡;历史加载 MUST 从 assistant metadata 把标题传播到同批次结果项;没有任何标题时投影 MUST 与改动前一致。

#### Scenario: 两个批次
- **WHEN** 实时回合里先后两个批次各有标题
- **THEN** 出现两行 `activity_summary`,只有最后一行 live

### Requirement: TUI 渲染
TUI SHALL 在 reasoning 标题就绪时用它替换等待动画短语,在批次的 tool_call 行前插入 `● 标题` 伪行(prompt 来源时把刚流完的正文行原地改成标题行);resume MUST 从 `metadata.tool_preamble` 还原伪行。

#### Scenario: resume 还原
- **WHEN** 历史 assistant(tool_calls) 消息带 `metadata.tool_preamble`
- **THEN** 回放行序为 assistant(若非 prompt 来源)→ preamble → tool_call → tool_result

### Requirement: REST
`GET /api/config/tool-preamble` SHALL 返回 `{enabled, mode, sidecar_model, sidecar_wait_ms, modes, saved_models}`;`PUT` 为 patch 语义,非法值返回 400 `BAD_REQUEST`,成功写 `config.json` 并下发到全部活跃会话。

#### Scenario: 非法旁路模型
- **WHEN** PUT `sidecar_model` 不在 saved_models 里
- **THEN** 400,配置不变
