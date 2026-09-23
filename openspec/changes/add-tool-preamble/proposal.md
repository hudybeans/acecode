# Proposal: add-tool-preamble

## Why

Codex / Claude Code 这一代 agent 在工具调用批次上方都会显示一句有指向性的短标题(截图里红框的 "Reading registry sections"),用户等待时看到的是「正在读注册表段落」而不是笼统的「正在处理」,焦虑感明显更低。调研结论(见 design.md):Codex 的那一行是 OpenAI 推理摘要的首行加粗标题,由客户端 `extract_first_bold` 抠出;Codex 的系统提示另有 `Preamble messages` 要求模型在工具调用前先写一句 8~12 词;Gemini CLI 用同一套路(`parseThought` 抠 `**subject**`);Cursor 的 "Explored (x) tools" 是模板聚合。ACECode 现在只有模板聚合(`summarizeToolItems`)与阶段文案(`正在推理` / `正在调用工具 X`),而系统提示还明确要求模型「不要叙述工具调用」,三条业界路线一条都没接。

## What Changes

- **配置**:`config.agent_loop.tool_preamble = {enabled(默认 false), mode(prompt|reasoning|sidecar,默认 prompt), sidecar_model, sidecar_wait_ms}`;稀疏序列化;设置 > 开发者模式 > 「工具前言」行卡片(开关 + 配置按钮),配置弹窗三选一,每项带圈圈问号的详细说明,旁路模式可选模型与最长等待。
- **三套机制**(`src/tool_preamble/` 纯逻辑 + AgentLoop 接线):
  - `prompt`:给每个工具定义注入必填的 `preamble` 字符串参数,系统提示追加「# Tool call preamble」段要求每次调用都填一句(「不要叙述工具调用」的既有口径保留);参数流式前缀里一抽到值就当 tool_planning 的 label,落盘 / 执行前从参数里剥掉,前言经 `tool_start.preamble` 与 `metadata.tool_preamble.calls` 传给界面。(第一版「先说一句话再调工具」已废:文本先变气泡、批次开始才搬进 loading、连续单工具步堆成一摞标题行。)
  - `reasoning`:推理流里第一对闭合 `**…**` 就是标题(流式期间即替换 loading 文案);没有加粗时取推理首句(去 "Okay," / "好的，" 等填充)兜底。
  - `sidecar`:第一个完整工具调用露头时把用户请求 + assistant 正文 + 调用预览另发一次小请求(`sidecar_model` 或会话模型,流超时封顶 8s),落盘前最多等 `sidecar_wait_ms`;迟到的结果以 `tool_preamble{late:true}` 事件只更新界面。
- **落盘与协议**:标题写进 assistant(tool_calls) 消息的 `metadata.tool_preamble = {title, source}`;新增 `tool_preamble` 会话事件 `{batch_id, tool_call_ids, title, source, late}`;`agent_progress` 的 reasoning / tool_planning / tool_running 在有标题时 label 换成标题(工具名退到 detail),所有 loading 消费方同源。REST `GET/PUT /api/config/tool-preamble`(patch 语义,PUT 后下发到活跃会话)。
- **Web**:每个调用的前言随 `tool_start.preamble` 挂到工具项(批次标题模式先到的事件暂存在 `pendingToolPreambles`),历史加载从 assistant metadata(`title` 整批 / `calls` 逐调用)传播到结果项;投影**不**按批次拆组,仍是一段活动一条 `activity_summary`,实时行标题 = 正在运行工具的前言;`ToolBlock` 运行中以前言为 label,落定后保持原样(前言进悬浮提示)。
- **TUI**:reasoning 标题替换等待动画短语;批次标题在 tool_call 行前插一行 `● 标题` 伪行;参数模式把每个调用的前言渲染在它自己的 tool_call 行上(`● FileRead · 前言`);resume 从 metadata 还原。

## Capabilities

### New Capabilities

- `tool-preamble`:工具批次标题的三种来源、落盘、事件、设置与三端渲染。

### Modified Capabilities

- `system-prompt`:`build_system_prompt` 多一个 `prompt_tool_preamble` 开关,关闭时逐字节不变。
- `web-transcript-projection`:活动段可按批次标题拆分;无标题时投影与改动前一致。

## Non-goals

- 不改 provider 协议层(不主动向 OpenAI Responses 请求 `reasoning.summary`,Codex app-server / Grok Responses 已经带回摘要);不给 Anthropic 摘要思考造标题格式。
- 不把迟到的旁路标题写回 JSONL(已落盘的消息没有改写入口)。
- 模板聚合(`summarizeToolItems`)保持原样作为兜底,不做 Cursor 式「Explored N tools」改版。
