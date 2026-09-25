# Proposal: add-tool-preamble

## Why

Codex / Claude Code 这一代 agent 在等待期都会显示一句有指向性的短标题(截图里红框的 "Reading registry sections"),用户看到的是「正在读注册表段落」而不是笼统的「正在处理」,焦虑感明显更低。调研结论(见 design.md):Codex 的那一行是 OpenAI 推理摘要的首行加粗标题,由客户端 `extract_first_bold` 抠出;Codex 的系统提示另有 `Preamble messages` 要求模型在工具调用前先写一句;Gemini CLI 用同一套路(`parseThought` 抠 `**subject**`);Cursor 的 "Explored (x) tools" 是模板聚合。ACECode 现在只有模板聚合(`summarizeToolItems`)与阶段文案(`正在推理` / `正在调用工具 X`),而系统提示还明确要求模型「不要叙述工具调用」,业界路线一条都没接。

## What Changes

- **配置**:`config.agent_loop.tool_preamble = {enabled(默认 false), mode(prompt|reasoning,默认 prompt)}`;稀疏序列化;设置 > 开发者模式 > 「工具前言」行卡片(开关 + 配置按钮),配置弹窗二选一,每项带圈圈问号的详细说明。旧配置里的 `sidecar_model` / `sidecar_wait_ms` 忽略,`mode:"sidecar"` 归一化为 `prompt`。
- **两种来源**(`src/tool_preamble/` 纯逻辑 + AgentLoop 接线),都汇成 AgentLoop 的同一条**阶段前言**状态:
  - `prompt`:系统提示追加「# Progress preamble」段 —— 多步工具任务在第一次调用前与每次阶段 / 计划变化时,用 `<text_preamble type="read">…</text_preamble>`(状态改变用 `type="write"`)写恰好一句话:开头写下一步,之后写「已验证的结果 + 下一步」,最终回答绝不打标签。daemon 在正文流里识别标签,闭合的那一刻这句话就成为当前阶段前言;标签正文不进 token / message 帧,落盘正文保留标签原文。
  - `reasoning`:推理流里第一对闭合 `**…**` 就是标题(流式期间即替换 loading 文案);没有加粗时取推理首句(去 "Okay," / "好的，" 等填充)兜底。
- **前言的生命周期**(用户拍板):只在等待期显示 —— Web 活动行 / 运行中的工具行,TUI 等待短语 / 写工具进度头;落定后的记录不显示它。新标签或新标题替换旧的;prompt 模式下未加标签的可见正文一出现就清除;回合结束清空。`type` 只解析透传(`kind = read|write|""`),读 / 写各自的界面效果留空待做。
- **协议**:前言建立时发 `agent_progress{phase:"preamble", label}`,有阶段前言期间每条 `agent_progress` 帧都带 `preamble{title,source,kind}`;每个批次的 `tool_start` 带 `preamble` / `preamble_source` / `preamble_kind`,`tool_planning` / `tool_running` 的 label 换成前言(工具名退到 detail),所有 loading 消费方同源。assistant(tool_calls) 消息落盘 `metadata.tool_preamble = {source, title, kind}` 只作记录。REST `GET/PUT /api/config/tool-preamble`(patch 语义,PUT 后下发到活跃会话)。**没有** `tool_preamble` 事件,**没有**旁路摘要模型。
- **Web**:reducer 只认 `tool_start.preamble*` 与 `agent_progress.preamble`;历史加载与 `message` 帧的 assistant 正文经 `stripTextPreambleTags` 剥掉标签(与 daemon 同款规则);投影**不**按批次拆组,仍是一段活动一条 `activity_summary`,实时行标题 = 正在运行工具的前言;`ToolBlock` 运行中以前言为 label,落定后与关闭态同形。
- **TUI**:`on_thinking_title` 用前言替换等待动画短语,写工具进度头显示前言;`on_message` 与 `session_replay` 剥掉标签,整段都是标签的 assistant 正文不建行;不插伪行、不在 tool_call 行上挂前言。

## Capabilities

### New Capabilities

- `tool-preamble`:阶段前言的两种来源、标签扫描与剥离、落盘、协议、设置与三端渲染。

### Modified Capabilities

- `system-prompt`:`build_system_prompt` 多一个 `prompt_tool_preamble` 开关,关闭时逐字节不变。
- `web-transcript-projection`:实时行与运行中的工具行可显示前言;落定后与无前言时投影一致。

## Non-goals

- 不改 provider 协议层(不主动向 OpenAI Responses 请求 `reasoning.summary`,Codex app-server / Grok Responses 已经带回摘要);不给 Anthropic 摘要思考造标题格式。
- 不做旁路摘要模型(曾实现为 `sidecar` 模式,用户砍掉);不做「每次调用必填 `preamble` 参数」(曾实现,强迫模型每次填一句体验差,用户砍掉);不做「先说一句话再调工具」的正文前言(第一版,已废)。
- `type=read|write` 的界面效果(写入时的书写效果、读取时的放大镜效果)留空,本次只透传 `kind`。
- 模板聚合(`summarizeToolItems`)保持原样作为兜底,不做 Cursor 式「Explored N tools」改版。
