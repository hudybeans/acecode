# tool-preamble Spec (delta)

## ADDED Requirements

### Requirement: 配置与默认关闭
`config.agent_loop.tool_preamble` SHALL 含 `enabled`(默认 false)与 `mode`(`prompt` | `reasoning`,默认 `prompt`)。非法 `mode`(含已废弃的 `sidecar`)MUST 在加载时归一化为 `prompt` 并记一条 WARN;旧配置里的 `sidecar_model` / `sidecar_wait_ms` MUST 被忽略;保存 MUST 稀疏(与默认相同的键不写出)。

#### Scenario: 默认关闭
- **WHEN** 配置里没有 `tool_preamble` 段
- **THEN** 功能关闭,系统提示、事件流与落盘 metadata 与改动前逐字节一致

#### Scenario: 旧的 sidecar 配置
- **WHEN** `mode` 写成 `"sidecar"` 并带 `sidecar_model`
- **THEN** 加载后 `mode == "prompt"`,多余键丢弃,再次保存不写出它们

### Requirement: 阶段前言的来源
开启后 AgentLoop SHALL 维护一条**阶段前言**状态 `{title, source, kind}`,按 `mode` 建立:
- `prompt`:系统提示 MUST 追加「# Progress preamble」段(要求多步工具任务在第一次调用前与阶段 / 计划变化时用 `<text_preamble type="read|write">…</text_preamble>` 写恰好一句,最终回答不打标签;Good 示例按同一规则示范,Bad 示例是裸文本进度句;旧的「Sharing progress updates」裸文本进度句一节在开启时 MUST NOT 出现,「批量调用」与「别把结论塞进中途消息」的既有口径保留)。daemon MUST 流式扫描 assistant 正文:标签闭合的那一刻标签正文(规整为单行、截到 200 个 code point)成为阶段前言,`kind` 取 `type` 属性(只认 read / write,其它为空);标签正文 MUST NOT 出现在 `token` 帧 / `message` 帧 / TUI 行 / Web 渲染里。
- `reasoning`:推理内容里第一对闭合 `**…**` 的内文;没有时取首行首句(去掉 Okay, / 好的， 等口头填充),截到 60 个 code point;不足 2 个 code point 视为无标题。

标签识别 MUST 容错:标签切在任意字节处、没写 `type`、缺闭合标签(到行尾为止)、`<text_preamble/>`(跳过)、大小写不敏感、超过 1200 字节未闭合(到此为止)、孤立闭合标签(丢弃);非标签的相似文本(`<textarea>`、`<text_preambleX>`、`a < b`)MUST 原样放行。**无论功能是否开启**,标签 MUST 从可见正文里剥掉;只有开启 prompt 模式时才发布成前言。

#### Scenario: 标签跨增量
- **WHEN** prompt 模式下正文以 `<text_pre` / `amble type="read">Reading the loader</text_preamble>\n\n` 两个增量流出
- **THEN** 没有任何 token 帧含标签文本,标签闭合后阶段前言为 `Reading the loader`、kind 为 `read`

#### Scenario: 加粗标题
- **WHEN** reasoning 模式下推理流含 `**Reading registry sections**`
- **THEN** 阶段前言为 `Reading registry sections`,且在流式期间 `agent_progress{phase:reasoning}` 的 label 已是该标题

#### Scenario: 功能关闭时的标签
- **WHEN** 功能关闭,模型仍输出 `<text_preamble>x</text_preamble>\n\nHello`
- **THEN** 可见正文为 `Hello`,没有前言帧,落盘正文保留标签原文

### Requirement: 阶段前言的生命周期
阶段前言 SHALL 跨模型步沿用,直到:新标签 / 新加粗标题替换它;prompt 模式下未加标签的非空白可见正文出现(清除);回合结束(清空)。工具批次 MUST 沿用建立时的前言,不按批次重新解析。

#### Scenario: 跨步沿用与清除
- **WHEN** 第一步写 `<text_preamble>Phase A</text_preamble>` 并调工具,第二步只调工具,第三步写可见正文 `Done.` 后再调工具
- **THEN** 第一、二步的 `tool_start.preamble` 都是 `Phase A`,第三步的 `tool_start` 不带前言

#### Scenario: 最终回答误打标签
- **WHEN** 最终的纯文本回答带 `<text_preamble>…</text_preamble>`
- **THEN** 标签剥掉,可见正文正常显示,回合结束后阶段前言为空

### Requirement: 协议与落盘
阶段前言建立时 daemon MUST 立刻发 `agent_progress{phase:"preamble", label:<前言>, preamble:{title,source,kind}}`(不受节流);有阶段前言期间每条 `agent_progress` 帧 MUST 带 `preamble{title,source,kind}`,`model_waiting` / `reasoning` / `tool_planning` / `tool_running` 的 label MUST 为前言(通用文案 / 工具名退到 detail),`permission_waiting` / `question_waiting` / `compacting` / `model_retry` 保持自己的文案。

#### Scenario: 批次之间等待模型
- **WHEN** 阶段前言为 `Phase one`,上一批工具已执行完、下一次模型请求刚发出
- **THEN** 这条 `agent_progress{model_waiting}` 的 label 为 `Phase one`,detail 为 `正在等待模型响应`每个在前言下执行的批次,其 `tool_start` MUST 带 `preamble` / `preamble_source`(`prompt` | `reasoning`)/ `preamble_kind`;assistant(tool_calls) 消息 MUST 在落盘前带 `metadata.tool_preamble = {source, title, kind}`(仅记录)。落盘的 assistant `content` MUST 保留标签原文;可见正文为空的 assistant(tool_calls) 消息 MUST NOT 发 `message` 帧。**没有** `tool_preamble` 事件。

#### Scenario: 空正文的工具步
- **WHEN** 模型步的正文只有一个标签,随后是工具调用
- **THEN** 不发 assistant `message` 帧,`tool_start` 带前言,落盘 assistant 消息 content 为标签原文、metadata 带 tool_preamble

### Requirement: Web 渲染
Web 投影 MUST NOT 按前言拆分活动段:一段活动仍是一条 `activity_summary`、落定后一条「已处理」。实时行的标题 SHALL 是正在运行的最新工具的前言(优先于阶段文案与并行计数),工具都跑完时不沿用旧前言;运行中的工具行 SHALL 以前言为 label,落定后的工具行与关闭态同形(悬浮提示也不带前言);历史加载与 `message` 帧的 assistant 正文 MUST 经与 daemon 同款规则剥掉标签;没有任何前言时投影 MUST 与改动前一致。

#### Scenario: 连续两步
- **WHEN** 实时回合里前一个工具(前言 A)已完成、当前工具(前言 B)在跑
- **THEN** 仍只有一行 `activity_summary`,标题为 B

#### Scenario: 历史里的标签
- **WHEN** `GET messages` 返回的 assistant content 为 `<text_preamble type="read">x</text_preamble>\n\nAll done.`
- **THEN** 渲染的正文为 `All done.`

### Requirement: TUI 渲染
TUI SHALL 在阶段前言建立时用它替换等待动画短语;顺序执行的写工具进度头 SHALL 显示前言;`on_message` 与 resume 回放 MUST 剥掉标签,整段都是标签的 assistant 正文不建行;MUST NOT 插入伪行或在 tool_call 行上挂前言。

#### Scenario: resume 回放
- **WHEN** 历史 assistant(tool_calls) 消息 content 只有标签、带 `metadata.tool_preamble`
- **THEN** 回放行序为 tool_call → tool_result,没有 assistant 行、没有前言伪行

### Requirement: REST
`GET /api/config/tool-preamble` SHALL 返回 `{enabled, mode, modes:["prompt","reasoning"]}`;`PUT` 为 patch 语义(`enabled` bool / `mode` ∈ modes 任意子集),非法值返回 400 `BAD_REQUEST`,成功写 `config.json` 并下发到全部活跃会话。

#### Scenario: 非法 mode
- **WHEN** PUT `{"mode":"sidecar"}`
- **THEN** 400,配置不变
