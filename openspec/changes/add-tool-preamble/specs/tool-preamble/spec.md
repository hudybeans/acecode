# tool-preamble Spec (delta)

## ADDED Requirements

### Requirement: 配置与工作模式入口
`config.agent_loop.tool_preamble` SHALL 只含 `enabled`(默认 false);旧配置里的 `mode` / `sidecar_model` / `sidecar_wait_ms` MUST 在加载时忽略,保存 MUST 稀疏。设置 > 常规 > 工作模式 SHALL 是唯一入口:「适合日常工作」对应 `enabled=true`,「用于编程」对应 `enabled=false`;工作模式 MUST 以 daemon 配置为准,不单独持久化。开发者模式里 MUST NOT 再有该设置。

#### Scenario: 旧配置升级
- **WHEN** 配置为 `{enabled:true, mode:"prompt", sidecar_model:"x"}`
- **THEN** 加载后开启,设置页显示「适合日常工作」,再次保存只写出 `enabled`

#### Scenario: 切换工作模式
- **WHEN** 用户在设置页从「适合日常工作」切到「用于编程」
- **THEN** 发 `PUT {enabled:false}`,活跃会话立即恢复旧文案;请求失败时选择回滚并提示

### Requirement: 文案来源
开启后 loading 文案 SHALL 全部由 daemon 生成,不要求模型额外输出,优先级为:
1. 本模型步推理摘要里第一对闭合 `**…**` 的内文(规整后截到 60 个 code point),只对本步有效,每次 provider 调用(含重试)开头清空;MUST NOT 用推理首句兜底;
2. 本批次原生工具名拼成的现在进行时模板,MUST NOT 含任何工具参数:同类计数,两类用「并」,三类及以上取前两类加「等」,MCP 与未列出的工具为「正在调用工具」;
3. 场景文案:回合开头「正在分析你的请求」,一批工具跑完后按这批第一类工具(如「正在分析文件内容」「正在分析命令输出」「正在检查修改结果」),正文开始流出「正在撰写回复」。

#### Scenario: 模板
- **WHEN** 一批调用为 file_read、grep、file_read
- **THEN** 文案为「正在读取 2 个文件并搜索代码」,kind 为 read

#### Scenario: 没有推理标题的模型
- **WHEN** 推理内容是 "The user wants me to look at the loader."
- **THEN** 等待期文案为「正在分析你的请求」,任何帧都不出现 "The user wants" 与「正在推理」

#### Scenario: 加粗标题只管本步
- **WHEN** 第一步推理带 `**Reading registry sections**`,第二步没有
- **THEN** 第一步的 loading 与 tool_start.preamble 为该标题(source=reasoning),第二步等待时回到场景文案

### Requirement: 替换范围与协议
开启时 `agent_progress` 的 `model_waiting` / `reasoning` / `preamble` / `responding` / `tool_planning` / `tool_running` 帧 MUST 以上述文案为 label、detail 为空,并带 `preamble:{title, source, kind}`(source ∈ reasoning / template / context);`permission_waiting` / `question_waiting` / `compacting` / `model_retry` MUST 保持原文案。每个批次的 `tool_start` MUST 带 `preamble` / `preamble_source` / `preamble_kind`,其参数与 `display_override` 不变;assistant(tool_calls) 消息 MUST 落盘 `metadata.tool_preamble = {source, title, kind}` 作记录。关闭时所有帧 MUST 与改动前一致(不带 preamble 字段,不发 responding 帧)。

#### Scenario: 执行中不带参数
- **WHEN** 开启时执行一条 bash 命令
- **THEN** tool_running 的 label 为「正在运行命令」、detail 为空;tool_start 的 args 与 Web 工具行仍显示完整命令

### Requirement: 历史标签
前一版要求模型输出的 `<text_preamble>` 标签 MUST 无论开关与否都从 token 帧、message 帧、TUI 行、回放与 Web 历史渲染里剥掉,且 MUST NOT 当作 loading 文案;落盘正文保持原样。

#### Scenario: 历史里的标签
- **WHEN** 模型沿用历史习惯输出 `<text_preamble type="read">Reading the loader</text_preamble>` 后调用工具
- **THEN** 界面看不到该标签,也没有 phase=preamble 的帧,tool_start.preamble 为工具模板

### Requirement: 三端渲染
Web 投影 MUST NOT 按批次拆分活动段;实时行标题 SHALL 为正在运行工具的 `preamble`(此时不再追加并行计数与 activity.detail),工具都完成后退回 `activity.label`;运行中与落定后的工具行 MUST 照常显示参数。TUI SHALL 用 `on_thinking_title` 收到的文案替换等待短语,同一句不重复回调;写工具进度头 MUST 保持工具行(前言参数为空)。

#### Scenario: 实时行
- **WHEN** 批次文案为「正在读取 3 个文件」且三个调用在并行运行
- **THEN** 实时行显示「正在读取 3 个文件」,不再显示「正在运行 3 个工具」

### Requirement: REST
`GET /api/config/tool-preamble` SHALL 返回 `{enabled}`;`PUT` 为 patch 语义,`enabled` 非布尔返回 400 `BAD_REQUEST`,旧的 `mode` / `sidecar_*` 键忽略;成功写 `config.json` 并下发到全部活跃会话。
