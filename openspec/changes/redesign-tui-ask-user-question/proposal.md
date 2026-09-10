# Proposal: redesign-tui-ask-user-question

## Why

当前 TUI `AskUserQuestion` 将题目状态、事件分派、滚动、`Other...` 输入与提交逻辑分散在 `TuiState`、`main.cpp`、overlay 布局和 channel 中。简单单选也呈现为较重的问卷，多个问题不能形成清晰的回看与汇总流程；自定义输入与普通 composer 耦合，键盘、鼠标、滚动与超时的行为亦难以一致验证。

本变更重新设计**仅 TUI** 的问答体验：单题保持快速完成，多题提供可修改的汇总流程，同时将复杂交互收敛为可测试的深模块，避免继续扩张 `main.cpp`。

## What Changes

- 新增不依赖 FTXUI 的问答控制器、UTF-8 多行行内编辑器和布局/命中计算层；控制器以规范化输入事件和语义效果与 TUI 外层通信。
- 以独立的 TUI 问答会话对象承载一个请求的状态、来源、固定超时截止时间和选中反馈截止时间；保留既有 FIFO 队列与异步 `question channel` 作为唯一工具边界。
- 重新实现单题快问与多题问卷：多题完成后进入只读汇总页，可回看、修改、提交或取消。
- 采用双列预设选项、行内自定义回答、统一焦点/hover/已选视觉状态，以及完整的键盘、鼠标、复制、取消和动态帮助语义。
- 动态计算题目与汇总页视口、滚动条、滚动偏移和鼠标命中；在极窄终端安全降级并在 resize 后保留逻辑状态。`question_min_visible_rows` 是默认 4 行、范围 [2,12] 的最小可见内容行数目标；当前终端空间不足时按实际视口降级。
- 新增 `tui.question_min_visible_rows`（默认 4，范围 2–12）与 `tui.question_selection_feedback_ms`（默认 200，范围 0–1000）。加载期统一校验/钳制，通过既有配置警告日志诊断非法值。
- 在既有 timeout 策略启用时显示实时倒计时，并在固定截止时间按用户现有有效回答、有效草稿、未作答和推荐项规则收卷；没有推荐项的未答题保持 `Not answered`。
- 将结构化完成结果由 TUI 适配器映射回既有工具 response，且在本地转录显示紧凑 Q/A 卡片及自动选择标记；用户取消继续走既有失败语义。
- 完整替换旧 TUI 问答路径，不修改公开 `AskUserQuestion` schema、daemon/Web/Desktop 问答界面或共享协议。

## Capabilities

### New Capabilities

- `tui-ask-user-question`: TUI AskUserQuestion 的自适应问答、行内回答、导航、滚动、超时、反馈、请求生命周期与本地转录契约。

### Modified Capabilities

- `ask-question-policy`: TUI timeout 策略从“整体无回答即自动选首项”扩展为按题保留进行中的用户答案、有效自定义草稿、未作答和显式推荐项的收卷语义；其余端保持原有行为。

## Impact

- **TUI 模块**：新增聚焦的 controller/editor/layout 类型，替换 `TuiState` 与 `main.cpp` 内原有 ask 字段和事件分支；保留 `src/tui/tui_ask_channel.*` 作为工具边界适配器。
- **配置**：`src/config/config.*` 中的 TUI 配置读写、默认值、范围校验和警告日志；相关示例/用户文档。
- **工具与转录**：仅调整 TUI response/显示适配，维持 `AskUserQuestion` 参数 schema、`ToolContext::ask_user_questions` 和 daemon/Web 兼容。
- **构建与测试**：新的纯 C++ 模块加入 `acecode_testable`；补充 controller、编辑器、布局、配置与少量 TUI 接线回归测试。
