# Tasks: add-tool-preamble

## 1. 配置与纯逻辑

- [x] 1.1 `ToolPreambleConfig{enabled}`(旧 mode / sidecar_* 键加载时忽略,稀疏保存)
- [x] 1.2 `src/tool_preamble/tool_preamble.{hpp,cpp}`:`batch_activity_label` / `after_batch_activity_label` / `batch_activity_kind` 现在进行时模板;加粗抠取与标题规整;删除推理首句兜底与模式判定;标签扫描器只用来剥历史标签
- [x] 1.3 删除旁路摘要模型、工具参数注入、ToolCallDelta 参数前缀(前几版遗留)

## 2. AgentLoop 与协议

- [x] 2.1 `build_system_prompt` 删除前言开关与「# Progress preamble」段,「# Sharing progress updates」逐字恢复
- [x] 2.2 `emit_agent_progress` 统一替换:`concrete_activity_for_phase` + `announce_activity`(TUI 去重回调);权限 / 提问 / 压缩 / 重试不换
- [x] 2.3 本步状态:推理加粗标题、`note_planned_tool`、`reset_activity_for_step` / `reset_activity_for_turn`;正文开始流出发 `responding`
- [x] 2.4 `resolve_tool_preamble_for_step`:批次文案(标题 > 模板),`metadata.tool_preamble` 与 `tool_start.preamble*`;TUI 进度头不再带前言

## 3. REST 与设置页

- [x] 3.1 `handlers/tool_preamble_handler` + `routes_tool_preamble.cpp`:只剩 `{enabled}`
- [x] 3.2 删除开发者模式里的 `ToolPreambleSettings.jsx`;`lib/workMode.js` + 设置 > 常规 > 工作模式接 daemon 开关;搜索索引
- [x] 3.3 i18n 覆盖与目录重生成

## 4. Web / TUI 渲染

- [x] 4.1 `ToolBlock` 运行中的工具行恢复显示参数
- [x] 4.2 实时活动行:有批次文案时不再追加并行计数与 activity.detail
- [x] 4.3 TUI:`on_thinking_title` 显示具体文案

## 5. 测试与文档

- [x] 5.1 C++:`tool_preamble_test`、`agent_loop_tool_preamble_test`、`config_tool_preamble_test`、`tool_preamble_handler_test`;删除 `system_prompt_tool_preamble_test`
- [x] 5.2 Web:`toolPreamble.test.js`、`workMode.test.js`,投影 / reducer 两个前言测试
- [x] 5.3 `docs/daemon-api.md`、CLAUDE.md

## 6. 留空待做

- [ ] 6.1 `kind = read|write` 的界面效果(写入时的书写效果、读取时的放大镜效果)
