# Proposal: add-tool-preamble

## Why

Codex / Claude Code 这一代 agent 在等待期都会显示一句有指向性的短状态(截图里红框的 "Reading registry sections"),用户看到的是「正在读注册表段落」而不是笼统的「正在处理」,焦虑感明显更低。ACECode 原来的 loading 只有阶段文案(「正在推理」「正在等待模型响应」「正在调用工具 bash」)外加命令预览、字节数这类技术细节。

前三版都试过让模型自己写这句话(先说一句话再调工具 / 每次调用必填 `preamble` 参数 / 正文里的 `<text_preamble>` 标签),都依赖模型配合:grok-4.7 在标签版里 12 个工具步零标签。调研(agentpatterns.ai 的 tool preamble 模式、OpenAI GPT-5 prompting guide)后结论是:业界的 tool preamble 是**普通的用户可见消息**,留在对话里;loading 状态行是另一层,Codex 用推理摘要的加粗标题,拿不到就显示通用文案。loading 应当尽量短,不该塞那句长的过程说明,也不该依赖模型额外输出。

## What Changes

- **入口**:设置 > 常规 > 工作模式。「适合日常工作」= 开启具体进度提示,「用于编程」= 关闭(默认)。开发者模式里的「工具前言」行卡片与配置弹窗删除。配置仍是 `config.agent_loop.tool_preamble.enabled`,旧的 `mode` / `sidecar_*` 键加载时忽略;工作模式以 daemon 配置为准,不单独存。
- **文案全部由 daemon 生成**,优先级:本模型步推理摘要的第一对 `**加粗**`(只对本步有效,不再有推理首句兜底)> 按本批次原生工具名拼的现在进行时模板(「正在读取 3 个文件并搜索代码」,不带任何参数)> 场景文案(回合开头「正在分析你的请求」;一批工具跑完后按这批工具类型,如「正在分析文件内容」「正在分析命令输出」;正文开始流出「正在撰写回复」)。
- **只换 loading,不动工具行**:`model_waiting` / `reasoning` / `preamble` / `responding` / `tool_planning` / `tool_running` 帧的 label 换成上述文案、detail 清空,权限 / 提问 / 压缩 / 重试保持原样;`tool_start` 带 `preamble` / `preamble_source` / `preamble_kind`,工具自己的参数不变;Web 工具行与 TUI 进度头照常显示参数。TUI 的等待短语经 `on_thinking_title` 显示同样的文案。
- **系统提示与此无关**:删除标签版的「# Progress preamble」段,标签版期间删掉的「# Sharing progress updates」一节逐字恢复;`build_system_prompt` 不再有前言开关。
- **历史标签只剥不用**:标签版落盘的 `<text_preamble>` 仍从 token 流、Message 帧、TUI 行、回放、Web 历史里剥掉,不再当文案。
- **REST** `GET/PUT /api/config/tool-preamble` 只剩 `{enabled}`。

## Capabilities

### New Capabilities

- `tool-preamble`:具体进度提示的文案来源、替换范围、协议字段、工作模式入口与三端渲染。

### Modified Capabilities

- `web-transcript-projection`:实时行可显示 daemon 生成的批次文案;落定后与关闭时投影一致。

## Non-goals

- 不要求模型输出任何额外内容(不改系统提示、不注入工具参数、不识别新标签)。
- 不改 provider 协议层(不主动向 OpenAI Responses 请求 `reasoning.summary`)。
- `kind = read / write` 的界面效果(写入时的书写效果、读取时的放大镜效果)留空,本次只透传。
- 过程说明(模型写在对话里的那句普通文本)不进 loading。
