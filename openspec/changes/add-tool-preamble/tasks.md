# Tasks: add-tool-preamble

## 1. 配置与纯逻辑

- [x] 1.1 `ToolPreambleConfig` 进 `AgentLoopConfig`(config.hpp/.cpp 解析 + 稀疏序列化 + clamp)
- [x] 1.2 `src/tool_preamble/tool_preamble.{hpp,cpp}`:加粗抠取 / 首句兜底 / 提示前言判定 / 旁路输出清洗 / 旁路请求构造
- [x] 1.3 `src/session/tool_preamble_sidecar.{hpp,cpp}`:旁路 profile 解析、一次性 provider、生成标题

## 2. AgentLoop 与协议

- [x] 2.1 `build_system_prompt` 的 `prompt_tool_preamble` 开关与 Codex 式 preamble 指引
- [x] 2.2 流回调:reasoning 加粗标题(流式期间替换 loading label)、第一个完整 ToolCall 启动 sidecar
- [x] 2.3 `resolve_tool_preamble_for_step` / `execute_tool_calls` 落盘 metadata + `tool_preamble` 事件 + 回调;迟到 late 事件
- [x] 2.4 `agent_progress` 的 tool_planning / tool_running 在有标题时 label = 标题
- [x] 2.5 `SessionEventKind::ToolPreamble` + `SessionRegistry::refresh_tool_preamble_config` / `summarize_tool_preamble`;TUI main.cpp 摘要器接线

## 3. REST 与设置页

- [x] 3.1 `handlers/tool_preamble_handler` 纯函数 + `routes_tool_preamble.cpp`(GET / PUT patch,下发活跃会话)
- [x] 3.2 `lib/toolPreamble.js` + `components/ToolPreambleSettings.jsx`(开关 / 配置弹窗三选一 / 圈圈问号说明 / 旁路模型与等待)挂进开发者模式;搜索索引条目
- [x] 3.3 i18n 覆盖与目录重生成

## 4. Web / TUI 渲染

- [x] 4.1 reducer:`tool_preamble` 事件、`pendingToolPreambles`、历史加载从 assistant metadata 传播
- [x] 4.2 投影:`splitPreambleGroups` / `flushToolBuffer` 按标题拆组,prompt 正文折进分组,legacy 包装归并保留标题
- [x] 4.3 `ActivitySummaryBlock` 标题优先
- [x] 4.4 TUI:`on_thinking_title` / `on_tool_preamble` 回调、`preamble` 伪行渲染、`session_replay` 还原

## 5. 测试与文档

- [x] 5.1 C++:`tool_preamble_test`、`config_tool_preamble_test`、`system_prompt_tool_preamble_test`、`agent_loop_tool_preamble_test`(三模式 + 迟到 + 关闭)、`tool_preamble_handler_test`、`session_replay_tool_preamble_test`
- [x] 5.2 Web:`toolPreamble.test.js`、`transcriptProjectionToolPreamble.test.js`、`sessionTranscriptToolPreamble.test.js`
- [x] 5.3 `docs/daemon-api.md` 端点 / 事件;CLAUDE.md 小节
