# Proposal: redesign-web-ask-user-question

## Why

Web 端 `AskUserQuestion`（`QuestionPicker`）与 TUI 版存在明显交互落差：缺少回车提交、复制选项、折叠与题目切换动效；选项行无选中态反馈（序号不随选中变成对勾）；无法在非末题跳过未答题；自定义答案草稿与选中态未分离；底部输入框在提问期间只是禁用占位而非被替换。设计与规格已分别更新至 `docs/design/web-ask-user-question-design.md` 与 `docs/specs/2026-09-13-web-ask-user-question-requirements.md`。

本变更重做**仅 Web 端**的提问框，使其交互对齐 TUI 基线。

## What Changes

- 重写 `web/src/lib/questionPicker.js` 纯逻辑层：导航（前/后/切换）、已作答与可跳过判定、跳过（Not answered）语义、提交/取消 payload、单选/多选自定义草稿与选中态分离、末题防误提交、Enter 选中优先级。
- 重写 `web/src/components/QuestionPicker.jsx` 视觉与交互：低饱和中性配色、选中黑底白勾序号徽章、hover 浮现「复制 / 回车」操作按钮、内联自定义输入（幽灵文字、字符计数、聚焦/灰化草稿）、折叠态、底部 `取消 / 跳过 / 提交` 按钮与 Tab 切题、数字键选择、Enter/Ctrl+Enter 快捷键。
- `ChatView` 集成：提问框打开期间**替换底部输入框**（composer dock 隐藏，提问框占据其位置），提交/取消后恢复；展示提交逐题答案汇总与取消反馈。home 与会话两个入口同步。
- 反馈卡（`QuestionFeedbackCard`）**持久化**：卡片按 `AskUserQuestion` 工具消息的**落盘元数据就地派生**（`web/src/lib/questionFeedback.js`），渲染在该消息之后。取消路径在 `make_rejected_ask_result` 落 `cancelled` 标记，提交路径落每题 `multi_select`；daemon 在回填答案时派生 `not_answered`（与 TUI 同规则）。这样卡片在回合输出结束、继续对话、切换/重载会话后都还在 —— 回合结束的 transcript self-heal 会用新 item id 覆写最近一轮，依赖缓存锚点会让卡片消失。
- 不修改 `AskUserQuestion` 工具参数 schema（题目数、每题 2–4 选项、`multiSelect` 约束不变），也不改 `request_id / session_id / answers / cancelled` 的字段名与语义；只做**增量**元数据字段。不带入超时收卷、汇总页、`Ctrl+C` 劫持。

## Capabilities

### New Capabilities

- `web-ask-user-question`: Web 端自适应的单选/多选提问、折叠与题目切换、内联自定义答案、复制/回车、跳过（Not answered）、Enter/Ctrl+Enter 快捷键与输入框替换契约。

### Modified Capabilities

- `ask-question-policy`: Web 端从"必须全部作答才能下一步"扩展为支持非末题跳过（Not answered）与末题仅 `Ctrl+Enter` 提交；其余端行为不变。

## Impact

- **Web 前端**：`web/src/components/QuestionPicker.jsx`、`web/src/components/QuestionFeedbackCard.jsx`（反馈卡）、`web/src/components/ChatView.jsx`（集成点）、`web/src/components/ToolBlock.jsx`（移除旧的结果卡渲染，避免与反馈卡重叠）、`web/src/lib/questionPicker.js`、`web/src/lib/questionFeedback.js`（反馈卡派生）、`web/src/lib/sessionTranscript.js`（归一化 `cancelled` / `multi_select`）。
- **daemon**：`src/tool/ask_user_question_tool.cpp`（取消路径落 `cancelled`、提交与超时路径落 `multi_select`）、`src/agent_loop.cpp`（答案派生 `not_answered`）。
- **测试**：`web/src/lib/questionPicker.test.js`、`web/src/lib/questionFeedback.test.js`（新增）、`web/src/lib/sessionTranscript.test.js`、`tests/tool/ask_user_question_tool_test.cpp`；`web/src/lib/runTests.js` 注册新测试文件。
- **文档**：`docs/specs/2026-09-13-web-ask-user-question-requirements.md`、`docs/design/web-ask-user-question-design.md` 为验收基线，均已记录本轮决策变更。