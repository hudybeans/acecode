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
- `prompt`:每个工具定义 MUST 注入必填(required)的 `preamble` 字符串参数,系统提示 MUST 要求模型每次调用都填写;每个调用的前言 = 其参数里 `preamble` 的规整值,该键 MUST 在权限门 / 预览 / hooks / 执行 / 落盘之前剥掉;参数流式前缀里值已闭合时 `agent_progress{tool_planning}` 的 label MUST 已是前言。此模式没有批次标题、不发 `tool_preamble` 事件。
- `reasoning`:推理内容里第一对闭合 `**…**` 的内文;没有时取首行首句(去掉 Okay, / 好的， 等口头填充),截到 60 个 code point;不足 2 个 code point 视为无标题。
- `sidecar`:第一个完整工具调用露头时用用户请求、assistant 正文与调用预览另发一次请求,清洗后的第一行;落盘前最多等待 `sidecar_wait_ms`。

#### Scenario: 加粗标题
- **WHEN** reasoning 模式下推理流含 `**Reading registry sections**`
- **THEN** 标题为 `Reading registry sections`,且在流式期间 `agent_progress{phase:reasoning}` 的 label 已是该标题

#### Scenario: 参数剥离
- **WHEN** prompt 模式下模型调用 `{"preamble":"Reading the loader","file_path":"a"}`
- **THEN** 工具收到 `{"file_path":"a"}`,落盘的 tool_calls 参数同样不含 preamble,`tool_start.preamble` 与 `metadata.tool_preamble.calls[id]` 为 "Reading the loader"

#### Scenario: 没填参数
- **WHEN** prompt 模式下模型没填 `preamble`
- **THEN** 该调用没有前言,一切与关闭时一致

### Requirement: 落盘与事件
有前言的模型步,assistant(tool_calls) 消息 MUST 在落盘前带 `metadata.tool_preamble = {source, title?, calls?}`;每个有前言的调用的 `tool_start` MUST 带 `preamble` 与 `preamble_source`;`agent_progress` 的 `tool_planning` / `tool_running` 在有前言时 label MUST 为前言(工具名退到 detail)。批次标题模式下 daemon MUST 在该批次的 `tool_start` 之前发 `tool_preamble{batch_id, tool_call_ids, title, source, late:false}` 事件;sidecar 迟到的标题 MUST 以 `late:true` 事件送达且不写入 JSONL。

#### Scenario: sidecar 迟到
- **WHEN** 旁路摘要在 `sidecar_wait_ms` 内没有返回
- **THEN** 消息按无标题落盘,工具执行完或回合末补发 `late:true` 事件

### Requirement: Web 渲染
Web 投影 MUST NOT 按前言拆分活动段:一段活动仍是一条 `activity_summary`、落定后一条「已处理」。实时行的标题 SHALL 是正在运行的最新工具的前言(优先于阶段文案与并行计数),工具都跑完时不沿用旧前言;运行中的工具行 SHALL 以前言为 label,落定后的工具行保持原样;历史加载 MUST 从 assistant metadata(`title` 整批 / `calls` 逐调用)把前言传播到结果项;没有任何前言时投影 MUST 与改动前一致。

#### Scenario: 连续两步
- **WHEN** 实时回合里前一个工具(前言 A)已完成、当前工具(前言 B)在跑
- **THEN** 仍只有一行 `activity_summary`,标题为 B

### Requirement: TUI 渲染
TUI SHALL 在 reasoning 标题就绪时用它替换等待动画短语;批次标题模式在批次的 tool_call 行前插入 `● 标题` 伪行;参数模式 MUST NOT 插伪行,每个调用的前言 SHALL 渲染在它自己的 tool_call 行上(`● FileRead · 前言`),写工具的进度头同样显示前言;resume MUST 从 `metadata.tool_preamble` 还原(`title` 还原伪行,`calls` 还原到各行)。

#### Scenario: resume 还原
- **WHEN** 历史 assistant(tool_calls) 消息带 `metadata.tool_preamble`
- **THEN** 回放行序为 assistant(若非 prompt 来源)→ preamble → tool_call → tool_result

#### Scenario: 参数模式 resume
- **WHEN** 历史 assistant(tool_calls) 消息带 `metadata.tool_preamble.calls`
- **THEN** 不出伪行,每条 tool_call 行的前言 = `calls[该调用 id]`(无 id 按 `#下标`)

### Requirement: REST
`GET /api/config/tool-preamble` SHALL 返回 `{enabled, mode, sidecar_model, sidecar_wait_ms, modes, saved_models}`;`PUT` 为 patch 语义,非法值返回 400 `BAD_REQUEST`,成功写 `config.json` 并下发到全部活跃会话。

#### Scenario: 非法旁路模型
- **WHEN** PUT `sidecar_model` 不在 saved_models 里
- **THEN** 400,配置不变
