# Spec: web-ask-user-question

Web 端 AskUserQuestion 提问框的全套交互契约。验收依据合并引用 `docs/specs/2026-09-13-web-ask-user-question-requirements.md` 与 `docs/design/web-ask-user-question-design.md`（本 spec 为上两者的可测契约子集）。

## 模型与导航

- 一次调用可携带多道题，界面每次展示一道，右上角 `‹ n / N ›` 前后切换。
- 当前题可折叠/展开；折叠态仅保留头部一行（待答题数提示 + 展开按钮），折叠不改变答案与当前题号。

## 答案语义

- 单选题：`selected` 互斥；选中预设时若自定义有草稿则保留草稿但取消选中态（灰显、不进 payload）；输入非空则清空预设并激活自定义。
- 多选题：可多个 `selected`，自定义激活时与预设并存。
- 一题已作答当且仅当存在任一 `selected` 或自定义处于激活且内容非空。
- payload 的 `custom_text` 仅写激活态（`customSelected`）的非空去前后空格草稿。
- 「跳过 / 未作答」的题以空 `selected`、空 `custom_text` 上报；daemon 在序列化工具结果时按 TUI 同规则派生 `not_answered`（`selected` 与 `custom_text` 均为空时置真），使未答题在 LLM 结果中呈现为 `Not answered` 而非空串。

## 导航与按钮

- 非末题 + 未作答：主按钮「跳过」，点击记为 `Not answered` 并进下一题。
- 非末题 + 已作答：主按钮「提交」，提交当前题并进下一题。
- 末题：主按钮恒为「提交」（未答/跳过的题一并记为 Not answered）。
- 底部始终提供「取消」，点击发送 `{cancelled:true}` 并触发 resolve。
- 主按钮文案随当前题已作答状态实时切换。

## 收卷时机

- daemon 对同一 `question_id`/`request_id` 的 `question_answer` 是 **first-wins 原子**：第一份被 accepted 即关闭整个提问并结束 agent_loop 的等待，后续一律忽略（`Closed`）。
- 因此非末题的「提交／跳过」只更新**本地答案状态并推进**，绝不向后端发送 `question_answer`；最终整批答案只在**末题「提交」**时统一 `sendQuestionAnswer` 一次。
- 末题 `canSubmit` 恒为真（即使整批未答/跳过，一并记 Not answered）；防误触由「末题单按 Enter 不提交、需 Ctrl+Enter」保证。
- 一条请求全过程至多产生一次 `question_answer`（末题提交）与一次 `cancelled`（取消）。

## 键盘

- `1–9` 选择对应选项（`N+1` 聚焦自定义行）。
- `↑ / ↓` 移动焦点；`Space` 选中当前焦点项 / 聚焦自定义。
- `Enter`：单选 + 非末题且已作答 → 提交并进下一题；单选 + 末题 → 仅选中不提交（预防止误提交）；多选 → 切换当前焦点项选中态。
- `Ctrl+Enter`：末题提交全部。
- `Tab / Shift+Tab`：切换上一题/下一题。
- `Esc`：取消整个问答（编辑态先退出编辑）。
- 文本输入（自定义框）内：Enter 不触发提交类快捷键（正常输入），避免误跳。

## Enter 选中目标优先级

1. 当前 hover 的选项；2. 带推荐标记的第一个选项；3. 第一个预设选项。

## 输入框替换

- 提问框打开期间，composer dock（输入区）隐藏，提问框占据其位置；提交或取消后 composer 恢复。
- 折叠态不取消替换。

## 状态反馈

- 选中：序号徽章原地变黑底白勾；行浅底色。
- 复制：按钮变绿色对勾，1.5s 恢复。
- 取消/提交：展示「已取消全部回答」/逐题答案汇总。
- 反馈卡持久化：卡片从 AskUserQuestion 工具消息的落盘元数据就地派生，随消息留在会话里。回合结束（transcript self-heal 用新 item id 覆写最近一轮）、继续对话、重载会话后卡片都必须仍然存在；不得依赖组件内存里的临时锚点或临时反馈。
- 取消路径必须落 `cancelled` 标记、提交路径必须落 `multi_select`，否则重载后无法还原卡片与题型。