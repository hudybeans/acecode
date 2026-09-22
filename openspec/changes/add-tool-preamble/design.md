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
- **投影分组键是标题**(而不是 batch_id):assistant 正文条目的 metadata 没有 batch_id(实时 Message 帧只带 title/source),用标题做键才能让 prompt 模式的正文条目和它的工具项落进同一组;group id 才用 batch_id(有则)保证流式追加时稳定。
- **无标题工具项不被上一组冒领**:prompt 模式下模型偶尔写长段落,daemon 不给标题,这些工具项另起无标题组走模板汇总。

## sidecar 的等待策略

在第一个**完整**工具调用露头时启动(参数预览进材料,比只有工具名的标签准),与后续参数流式 / 工具执行并行;`resolve_tool_preamble_for_step` 有界等待 `sidecar_wait_ms`(默认 2000,clamp [0,15000]),每 50ms 看一次中止标记。等不到就按无标题落盘,工具执行完与回合末各看一次,到了就发 `late:true` 事件(不写 JSONL —— 已落盘消息没有改写入口)。摘要线程 detached、只写 `ToolPreambleSidecarTask`,AgentLoop 永不被它回调,线程晚于 AgentLoop 结束也不会踩到已析构的 this。

## 为什么 prompt 模式要改系统提示的口径

`system_prompt.cpp` 原有「Do not narrate every tool call / prefer silent batches」是为省 token 定的;preamble 一句约 15~25 个输出 token,比旁路摘要便宜一个量级。只在 `enabled && mode == prompt` 时切换文案,其它模式与关闭态逐字节不变(`system_prompt_tool_preamble_test.cpp::DisabledIsByteIdenticalToLegacyPrompt`)。

## 三端 loading 提示同源

- Web `ActivitySummaryBlock`:`item.preamble.title` > 阶段文案 / 并行计数(后者退到 detail)。
- daemon `agent_progress`:reasoning(流式期间)/ tool_planning / tool_running 在有标题时 label = 标题,工具名 / 命令预览退到 detail,所以侧栏、迷你视图等只读 `activity.label` 的消费方也显示标题。
- TUI:`on_thinking_title` 替换等待动画短语;`on_tool_preamble` 插 `● 标题` 伪行。

## 已知限制

- Anthropic / DeepSeek 类只给散文或原始思维链的推理,reasoning 模式只能取首句,质量一般;不返回推理内容的模型不出标题。
- 迟到的旁路标题不落盘,resume 后该批次退回模板汇总。
- headless `-p` 模式配置照常生效(prompt 模式会改提示词),但 stdout 只出最终文本,标题不可见。
