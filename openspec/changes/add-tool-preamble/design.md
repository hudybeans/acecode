# Design: add-tool-preamble

## 业界怎么做(调研结论)

| 产品 | 标题来源 | 机制 |
|---|---|---|
| Codex(TUI / 桌面) | OpenAI Responses `reasoning.summary` 的首行 `**加粗**` | `chatwidget.rs::extract_first_bold` 抠出后当状态行 + 折叠组标题;正文只进 transcript |
| Codex 系统提示 | 模型自己写的 preamble | `## Preamble messages`:工具调用前一句 8~12 词,相关动作归一组 |
| Gemini CLI | Gemini thought summary 的 `**Subject**` | `thoughtUtils.ts::parseThought`,`LoadingIndicator` 优先级 shell 等待 > subject > 阶段短语 > "Thinking..." |
| Claude Code | harness 要求先说一句 / Agent 工具 3~5 词 description / 随机 spinner 动词 | 提示驱动 + 结构化槽位 |
| Cursor / Copilot | 模板 | "Explored (x) tools" 从工具名 / 参数拼 |

两条落地的 agent 侧路线:提示驱动(模型自己写)与推理服务内置摘要(provider 给)。曾经的第三条「旁路模型摘要」(第一个完整工具调用露头时另发一次小请求)已实现又砍掉:多一次请求、结果常常迟到、落盘前有界等待还拖慢工具执行,用户判断不值。

## 三版形态的取舍

| 版本 | 形态 | 为什么被否 |
|---|---|---|
| v1 | 「含工具调用的消息先写一句前言」,正文首句抠出当批次标题 | 文本先流成气泡、参数再流、批次开始才把那句话搬进 loading;每个模型步一组,连续单工具步堆成一摞标题行(用户截图) |
| v2 | 每个工具定义注入必填 `preamble` 参数,模型在调用参数里填 | 时序问题没了,但等于强迫模型**每次调用**都写一句;grok 对可选参数几乎不填,进 required 才填 —— 用户实测后否掉整套 |
| v3(现行) | 正文里的 `<text_preamble type="read|write">…</text_preamble>` 标签,只在阶段变化时写 | 模型按阶段而不是按调用写,一次多步任务通常两三句;标签闭合的那一刻就换 loading 文案;不显示在落定的记录里 |

v3 的提示词是用户给的原话:For multi-step tool tasks, emit exactly one short sentence in `<text_preamble type="read">...</text_preamble>` (use `type="write"` for state-changing actions) before the first call and at major phase/plan changes: next step initially, verified result + next step thereafter; never tag final answers。系统提示只**追加**「# Progress preamble」段,「Do not narrate every tool call / prefer silent batches」原样保留 —— 前言替代的是叙述文本,不是批处理;关闭态逐字节不变(`system_prompt_tool_preamble_test.cpp::DisabledIsByteIdenticalToLegacyPrompt`)。

## 数据流

```
model step ──(text delta)──▶ TextPreambleScanner.feed ──┬─ visible → on_delta / Token 帧
           │                                            └─ preamble(标签闭合) → publish_phase_preamble
           ──(reasoning delta)──▶ extract_first_bold / title_from_reasoning ──▶ publish_phase_preamble(reasoning)
publish_phase_preamble:
   phase_preamble_ = {title, source, kind}            ← tool_preamble_mu_ 下
   callbacks.on_thinking_title(title)                  ← TUI 等待短语
   emit agent_progress{phase:"preamble", label:title, preamble:{…}}   ← force,绕开节流
prompt 模式下非空白可见正文出现 → clear_phase_preamble()
execute_tool_calls(每个批次):
   tc_msg.metadata.tool_preamble = {source, title, kind}   ← 落盘,仅记录
   tool_start{preamble, preamble_source, preamble_kind}   ← 界面实时通道
   agent_progress{tool_running, label = 前言, detail = 工具名}
turn end: clear_phase_preamble()
```

- **阶段前言是一条状态,不是每步解析一次**。它跨模型步沿用(标签只在阶段变化时出现,中间的工具批次都沿用它),被新标签 / 新加粗标题替换,prompt 模式下被未加标签的可见正文清除,回合结束清空。`resolve_tool_preamble_for_step` 只是把当前状态取出来给 `execute_tool_calls`(reasoning 模式下顺带做首句兜底)。
- **扫描器是流式的**(`tool_preamble::TextPreambleScanner`,纯逻辑):标签可能切在任意字节处,尾部若是 `<text_preamble` 的前缀就扣住不发;非标签的相似文本(`<textarea>`、`<text_preambleX>`、`a < b`)原样放行;`type` 属性可带引号 / 不带 / 缺省,只认 read / write;`<text_preamble/>` 跳过;缺闭合标签时到行尾为止;正文超过 `kTextPreambleMaxBodyBytes`(1200)仍未闭合就按到此为止;孤立的 `</text_preamble>` 丢弃;流开头与每个标签闭合后紧跟的空白吞掉(否则界面为 `\n\n` 建空气泡);`flush()` 在流结束时把扣住的前缀当普通文本放出。标题经 `normalize_title_line` 规整(单行、截到 200 code point)。
- **标签总是从可见正文里剥掉,发布成前言只在开启 prompt 模式时**。关闭功能后模型也可能沿习惯打标签(历史里有),所以 Token 帧 / Message 帧 / TUI 行 / Web 历史加载四处都剥,`strip_text_preamble_tags`(C++)与 `stripTextPreambleTags`(JS)是同一套规则;可见正文为空的 assistant(tool_calls) 消息不发 Message 帧、不建行。
- **落盘正文保留标签原文**(用户决定「可以落盘」):模型会模仿自己的历史输出,剥掉了反而让它在多轮对话里忘记格式。`metadata.tool_preamble` 挂在 assistant(tool_calls) 消息上,provider 序列化不读 metadata,不打穿 prompt cache;`session_serializer` 原本就透传 metadata。`web::compute_message_id` 仍按完整正文(含标签)算,与 JSONL 重读一致。
- **投影不按批次拆组**:一段活动仍是一条 `activity_summary`,前言只影响实时行(正在运行工具的前言)与运行中的工具行;落定后的记录与功能关闭时形态一致。按批次拆成多行就是用户否掉的那版。
- **`kind` 是留空的槽位**:`read` / `write` 从标签属性解析,经 `agent_progress.preamble.kind` / `tool_start.preamble_kind` / `metadata.tool_preamble.kind` 一路透传到界面,界面暂不按它做任何区分。用户的想法是写入时有书写效果、读取时有放大镜效果,之后补。

## 三端 loading 提示同源

- daemon `agent_progress`:前言建立时立刻发 `phase:"preamble"` 帧(独立 phase 键 + force,绕开 750ms 节流);之后 model_waiting / reasoning / tool_planning / tool_running 在有前言时 label = 前言,通用文案 / 工具名 / 命令预览退到 detail,所以侧栏、迷你视图等只读 `activity.label` 的消费方也显示前言;每条帧都带 `preamble{title,source,kind}` 供需要区分来源 / 种类的消费方使用。model_waiting 那条在 `emit_agent_progress` 里集中换 —— 实测(会话 20260925-013722-4299)批次之间的等待帧若退回「正在等待模型响应」,Web 实时行会在「前言 → 通用文案 → 前言」之间闪动,与「前言留到下一段正文 / 下一条前言出现」的要求相悖;权限 / 提问 / 压缩 / 重试这些必须被看见的状态不换。
- Web `ActivitySummaryBlock`:`item.preamble.title`(= 正在运行的最新工具的前言,`liveToolPreamble`)> 阶段文案 / 并行计数;工具都跑完时不沿用旧前言;`ToolBlock` 运行中的工具行以前言为 label,落定后行保持原样、悬浮提示也不带前言。
- TUI:`on_thinking_title` 替换等待动画短语;写工具的进度头 `● 前言 · Tool(args)`(`on_tool_progress_start` 第三参)。读工具走并行路径没有进度头,等待短语是它们唯一的显示位。不插伪行、不在 tool_call 行上挂前言。

## 已知限制

- Anthropic / DeepSeek 类只给散文或原始思维链的推理,reasoning 模式只能取首句,质量一般;不返回推理内容的模型不出标题。
- prompt 模式的效果取决于模型是否遵循提示:不写标签就没有前言,一切退回模板文案;写在最终回答里的标签会被剥掉但不会显示成前言(回合已结束)。
- headless `-p` 模式配置照常生效(prompt 模式会改提示词),stdout 只出最终文本,标签同样剥掉。
