# Tasks: redesign-web-ask-user-question

## 1. 纯逻辑层 `web/src/lib/questionPicker.js`

- [x] 1.1 扩展 `.openspec.yaml`/`proposal`/`spec` 已完成：导航、跳过、Enter 优先级、草稿/输入框替换、快捷键通过可单测纯函数描述。
- [x] 1.2 重写纯逻辑：保留 `normalizeQuestionRequest`/`makeInitialAnswers`/payload 构建；新增/调整已作答判定、导航（`canSkip`/`canSubmitCurrent`/末题防误提交）、`selectOption`/`selectCustom`/`saveCustom`、`recommendedOptionIndex`、`enterTargetIndex`。
- [x] 1.3 保持 payload 与 daemon 协议兼容（`question_id / selected / custom_text`、`cancelled`），`custom_text` 仅写激活态非空草稿。
- [x] 1.4 扩充 `web/src/lib/questionPicker.test.js`：跳过语义、末题仅 Ctrl+Enter、单选/多选草稿与选中态分离、Enter 目标优先级、Tab 切换、已作答/not answered 判定。

## 2. 组件层 `web/src/components/QuestionPicker.jsx`

- [x] 2.1 视觉重做：低饱和中性配色、序号徽章黑底白勾、行 hover 浅底到位、内联自定义输入（幽灵文字/计数/聚焦与灰化草稿）、折叠态、底部 `取消/跳过/提交`。
- [x] 2.2 交互：选项行 hover 浮现「复制 / 回车」按钮；复制写入剪贴板并显示 1.5s 对勾反馈；回车按钮与双击=选中并进下一题/提交。
- [x] 2.3 键盘：`1–9`、`↑↓`、`Space`、`Enter`（单选非末题一步到位/末题仅选中、多选切换）、`Ctrl+Enter` 末题提交、`Tab/Shift+Tab` 切题、`Esc` 取消（编辑态先退编辑）。
- [x] 2.4 提交/取消后通过 `onResolve` 释放，供上层恢复 composer 并展示汇总/取消反馈。
- [x] 2.5 收卷时机：非末题「提交/跳过」仅本地推进，绝不逐题发送；末题统一 `sendQuestionAnswer` 一次、取消一次 `cancelled`；末题 `canSubmit` 恒为真（整批一并记 Not answered）。

## 3. 集成 `web/src/components/ChatView.jsx`

- [x] 3.1 home 入口与 session 入口：提问框打开期间 composer 输入区替换为提问框，提交/取消后恢复。
- [x] 3.2 接入提交逐题答案汇总与「已取消全部回答」反馈展示（在合适位置渲染结果/取消提示）。
- [x] 3.3 daemon 序列化派生 `not_answered`（`src/agent_loop.cpp`）：`selected` 与 `custom_text` 均为空时置真，与 TUI `ask_question_controller.cpp` 同规则，使 Web 端跳过在 LLM 结果中呈现为 `Not answered`。
- [x] 3.4 反馈卡持久化：卡片改为按 AskUserQuestion 工具消息就地派生（`web/src/lib/questionFeedback.js`），数据源是落盘元数据而非组件临时 state —— 回合结束的 transcript self-heal 会用新 id 覆写最近一轮，缓存锚点会让卡片消失。取消路径在 `make_rejected_ask_result` 落 `cancelled` 标记、提交路径落 `multi_select`，两者都能跨重载还原。
- [x] 3.5 历史工具身份规范化：恢复持久化 transcript 时，按 `tool_call_id` 将 `assistant.tool_calls` 中的明确工具名补到缺少名称的对应 `role:tool` 结果，使提交与取消卡在 self-heal、刷新和继续对话后仍紧跟各自的 AskUserQuestion 调用。

## 4. 验证

- [x] 4.1 `pnpm test`（自 `web/`）全绿。
- [x] 4.2 `pnpm build` 通过，嵌入前端资源刷新。
- [x] 4.3 反馈卡持久化回归测试：`web/src/lib/questionFeedback.test.js`（提交/取消/未作答/id 变更/临时预览）+ `tests/tool/ask_user_question_tool_test.cpp` 的 cancelled 与 multi_select 断言。
- [x] 4.4 仅当与既有行为相关时同步更新 `docs`；不引入超时收卷、汇总页、`Ctrl+C` 劫持。
- [x] 4.5 完整链路回归：使用真实 `assistant.tool_calls` + `role:tool` 持久化协议形状，覆盖实时提交/取消、历史重载、回合 self-heal、继续对话、调用后紧邻卡片且每次调用只出现一张。

## 5. 基于最新 master 重新落地

- [x] 5.1 冲突判定：master 的「提问挂起时直接输入 = 插话」与本次「方案 A：提问框替换 composer」互斥，按方案 A 落地 —— 提问期间 `ace-composer-dock` 不渲染 `InputBar`。
- [x] 5.2 清理不可达路径：`ChatView.submit` 的提问插话分支随输入框一起移除（不再调用 `api.interjectQuestion`）。daemon 插话端点、排队卡片的「插话」按钮与转录 `interjected` 标记保留 —— TUI/IM 通道仍在产生该形态的落盘结果。
- [x] 5.3 反馈卡判定与 master 对齐：`questionFeedbackForItem` 不再按工具名过滤（历史页可能只剩工具结果消息，或工具已被改名），并恢复 `interjected` 形态；`QuestionFeedbackCard` 补回「已改为直接输入，取消作答」卡。
- [x] 5.4 `web/src/lib/composerEditabilityArchitecture.test.js` 改为守方案 A 的契约（composer 让位、无插话入口），并把排队卡片插话单独成条。
- [x] 5.5 重新生成 i18n 源目录；Web 侧 `pnpm test`、`pnpm build`（含 lookbehind 兼容检查）全绿。安装须用 CI 同版本 pnpm 10.32.1（`npx pnpm@10.32.1 install --frozen-lockfile`）—— 本机 pnpm 12 解析该 patch 文件会失败，属工具链版本问题，与本次改动无关。
- [x] 5.6 C++ 侧 `*AskUserQuestion*`、`AskUserQuestionPrompter.*`、`AgentLoopQuestionInterjection.*` 共 54 个用例全绿。注意：旧 `build/windows-x64-dev` 里还留着 09-13 的过期目标文件（含 `agent_loop.hpp`、`ask_user_question_prompter.hpp` 等已变动的头文件），直接跑会出现与本改动无关的堆损坏崩溃；清掉过期 obj 重编后全部通过。