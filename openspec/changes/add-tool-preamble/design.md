# Design: add-tool-preamble

## 业界怎么做(调研结论)

| 产品 | 标题来源 | 机制 |
|---|---|---|
| Codex(TUI / 桌面) | OpenAI Responses `reasoning.summary` 的首行 `**加粗**` | `chatwidget.rs::extract_first_bold` 抠出后当状态行 + 折叠组标题;正文只进 transcript |
| Codex 系统提示 | 模型自己写的 preamble | `## Preamble messages`:工具调用前一句 8~12 词,相关动作归一组 |
| Gemini CLI | Gemini thought summary 的 `**Subject**` | `thoughtUtils.ts::parseThought`,`LoadingIndicator` 优先级 shell 等待 > subject > 阶段短语 > "Thinking..." |
| Claude Code | harness 要求先说一句 / Agent 工具 3~5 词 description / 随机 spinner 动词 | 提示驱动 + 结构化槽位 |
| Cursor / Copilot | 模板 | "Explored (x) tools" 从工具名 / 参数拼 |

三条可落地的 agent 侧路线正好对应用户点名的三选一:提示驱动、推理服务内置摘要、旁路模型摘要。

## 数据流

```
model step ──(reasoning delta)──▶ extract_first_bold ──▶ agent_progress{phase:reasoning,label:title}
           ──(first ToolCall)───▶ sidecar thread(可选)
           ──(step end)─────────▶ resolve_tool_preamble_for_step ──▶ current_step_preamble_
execute_tool_calls:
   tc_msg.metadata.tool_preamble = {title, source}   ← 落盘(JSONL)
   emit tool_preamble{batch_id, tool_call_ids, title, source, late:false}
   callbacks.on_tool_preamble(title, source)         ← TUI 伪行
   tool_start… (agent_progress tool_running label = title)
   flush_late_tool_preamble(false)                   ← sidecar 迟到 → late:true
turn end: flush_late_tool_preamble(true)             ← 仍没到就丢弃
```

- **标题只在一处解析**(`AgentLoop::resolve_tool_preamble_for_step`),`execute_tool_calls` 只消费。
- **落盘键**:`metadata.tool_preamble` 挂在 assistant(tool_calls) 消息上,provider 序列化不读 metadata,不打穿 prompt cache;`session_serializer` 原本就透传 metadata,REST `GET messages` 与 resume 自然带回。
- **事件先于 tool_start**:Web reducer 先把标题按 tool_call_id 暂存在 `pendingToolPreambles`,`tool_start` 建项时取走;迟到事件原地打标。空正文的工具回合没有 assistant Message 帧可搭,所以事件是必须的,不是可选的。
- **投影不按批次拆组**:一段活动仍是一条 `activity_summary`,前言只影响实时行(正在运行工具的前言)与运行中的工具行;落定后的记录与功能关闭时形态一致。按批次拆成多行就是用户否掉的那版。
- **每个调用一条前言是三种模式对下游的统一形态**:参数模式各取各的,批次标题模式每个调用都等于批次标题(`preamble_for_call`),`tool_start.preamble` 是唯一的实时通道;批次标题模式另发的 `tool_preamble` 事件只为迟到补标与历史 batch_id。

## sidecar 的等待策略

在第一个**完整**工具调用露头时启动(参数预览进材料,比只有工具名的标签准),与后续参数流式 / 工具执行并行;`resolve_tool_preamble_for_step` 有界等待 `sidecar_wait_ms`(默认 2000,clamp [0,15000]),每 50ms 看一次中止标记。等不到就按无标题落盘,工具执行完与回合末各看一次,到了就发 `late:true` 事件(不写 JSONL —— 已落盘消息没有改写入口)。摘要线程 detached、只写 `ToolPreambleSidecarTask`,AgentLoop 永不被它回调,线程晚于 AgentLoop 结束也不会踩到已析构的 this。

## prompt 模式为什么是「参数」而不是「先说一句话」

第一版做成「含工具调用的消息先写一句前言」,实测(用户截图)三个问题:文本先流出来变成气泡、工具参数再流、批次开始才把那句话搬进 loading;每个模型步一组,连续单工具步堆成一摞标题行;展开后那句话在组里又重复一遍。改成参数后这些时序问题都不存在:`inject_preamble_parameter` 给每个工具定义加 `preamble`,模型在调用参数里填;`ToolCallDelta` 带参数前缀(`kToolCallDeltaArgumentsPrefixBytes`),`extract_preamble_from_partial_arguments` 在值闭合的那一刻就换掉 tool_planning 的 label;`strip_preamble_parameter` 在 `resolve_tool_preamble_for_step` 里剥掉,后面的权限 / 预览 / hooks / doom guard / 执行 / 落盘全是干净参数。系统提示只**追加**「# Tool call preamble」段,「Do not narrate every tool call / prefer silent batches」原样保留 —— 前言替代的是叙述文本,不是批处理;关闭态逐字节不变(`system_prompt_tool_preamble_test.cpp::DisabledIsByteIdenticalToLegacyPrompt`)。每次调用约十几个 token,比旁路摘要便宜一个量级。

## 三端 loading 提示同源

- Web `ActivitySummaryBlock`:`item.preamble.title` > 阶段文案 / 并行计数(后者退到 detail)。
- daemon `agent_progress`:reasoning(流式期间)/ tool_planning / tool_running 在有标题时 label = 标题,工具名 / 命令预览退到 detail,所以侧栏、迷你视图等只读 `activity.label` 的消费方也显示标题。
- TUI:`on_thinking_title` 替换等待动画短语;批次标题模式 `on_tool_preamble` 插 `● 标题` 伪行;参数模式同一回调逐调用送前言(source=prompt),TUI 暂存后挂到紧接着的 tool_call 行(`● FileRead · 前言`),写工具的进度头也显示它。读工具走并行路径没有进度头,这条回调是 TUI 看到前言的唯一通道。

## 已知限制

- Anthropic / DeepSeek 类只给散文或原始思维链的推理,reasoning 模式只能取首句,质量一般;不返回推理内容的模型不出标题。
- 迟到的旁路标题不落盘,resume 后该批次退回模板汇总。
- headless `-p` 模式配置照常生效(prompt 模式会改提示词),但 stdout 只出最终文本,标题不可见。
