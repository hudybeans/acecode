# Tasks: add-tool-preamble

## 1. 配置与纯逻辑

- [x] 1.1 `ToolPreambleConfig{enabled, mode}` 进 `AgentLoopConfig`(config.hpp/.cpp 解析 + 稀疏序列化;`sidecar` 与非法 mode 归一化为 prompt,旧 sidecar 键忽略)
- [x] 1.2 `src/tool_preamble/tool_preamble.{hpp,cpp}`:`TextPreambleScanner`(流式标签识别,任意字节切分 / 缺 type / 缺闭合 / 自闭合 / 大小写 / 封顶 / 孤立闭合 / 空白吞并)、`strip_text_preamble_tags`、加粗抠取 / 首句兜底
- [x] 1.3 删除 `src/session/tool_preamble_sidecar.{hpp,cpp}` 与 `SessionRegistry` 的旁路摘要器接线;删除 provider 的 `ToolCallDelta` 参数前缀

## 2. AgentLoop 与协议

- [x] 2.1 `build_system_prompt` 的 `prompt_tool_preamble` 开关:追加「# Progress preamble」段(用户原话提示词 + 按其规则写的带标签 Good 示例;开启时替换掉旧的「Sharing progress updates」裸文本进度句一节;关闭逐字节不变)
- [x] 2.2 流回调:正文增量过 `TextPreambleScanner`(总是剥标签,开启 prompt 模式才发布前言);reasoning 加粗标题 / 首句兜底走同一条 `publish_phase_preamble`
- [x] 2.3 阶段前言状态 `phase_preamble_`(`tool_preamble_mu_`):替换 / 正文清除 / 回合末清空;`resolve_tool_preamble_for_step` 取状态;`execute_tool_calls` 落盘 `metadata.tool_preamble{source,title,kind}` + `tool_start.preamble/preamble_source/preamble_kind`
- [x] 2.4 `agent_progress`:前言建立发 `phase:"preamble"`(force);有前言期间每帧带 `preamble{title,source,kind}`;tool_planning / tool_running 的 label = 前言
- [x] 2.5 Message 帧与文本回合收尾剥标签,可见正文为空不发帧;`SessionEventKind::ToolPreamble` 删除;`SessionRegistry::refresh_tool_preamble_config` 保留

## 3. REST 与设置页

- [x] 3.1 `handlers/tool_preamble_handler` 纯函数 + `routes_tool_preamble.cpp`(GET / PUT patch 两字段,下发活跃会话)
- [x] 3.2 `lib/toolPreamble.js` + `components/ToolPreambleSettings.jsx`(开关 / 配置弹窗二选一 / 圈圈问号说明)挂进开发者模式;搜索索引条目
- [x] 3.3 i18n 覆盖与目录重生成

## 4. Web / TUI 渲染

- [x] 4.1 reducer:`tool_start.preamble*` 打标、`agent_progress.preamble` 进 activity、历史加载与 `message` 帧 `stripTextPreambleTags`;删除 `tool_preamble` 事件与 `pendingToolPreambles`
- [x] 4.2 投影:不拆组,实时行标题 = 正在运行工具的前言(`liveToolPreamble`),落定后与无前言一致
- [x] 4.3 `ToolBlock` 运行中以前言为 label,落定后同形
- [x] 4.4 TUI:`on_thinking_title` 替换等待短语、写工具进度头显示前言;`on_message` / `session_replay` 剥标签、空正文不建行;删除伪行 / tool_call 行前言 / `pending_tool_call_preamble`

## 5. 测试与文档

- [x] 5.1 C++:`tool_preamble_test`(扫描器 + strip)、`config_tool_preamble_test`、`system_prompt_tool_preamble_test`、`agent_loop_tool_preamble_test`(标签 → 前言不进正文 / 跨步沿用与清除 / 最终回答误打标签 / 写工具进度头 / reasoning / 关闭)、`tool_preamble_handler_test`、`session_replay_tool_preamble_test`
- [x] 5.2 Web:`toolPreamble.test.js`、`transcriptProjectionToolPreamble.test.js`、`sessionTranscriptToolPreamble.test.js`
- [x] 5.3 `docs/daemon-api.md` 端点 / 协议;CLAUDE.md 小节

## 6. 留空待做

- [ ] 6.1 `kind = read|write` 的界面效果(写入时的书写效果、读取时的放大镜效果)—— 槽位已透传到 `agent_progress.preamble.kind` / `tool_start.preamble_kind`,界面未消费
