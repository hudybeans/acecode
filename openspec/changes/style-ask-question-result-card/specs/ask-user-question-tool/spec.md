## ADDED Requirements

### Requirement: AskUserQuestion result includes structured UI metadata

Successful `AskUserQuestion` results SHALL include UI-only metadata under `ask_user_question_result` containing the answered question/answer pairs in the same order as the input `questions`. The metadata MUST NOT replace or truncate `ToolResult.output`, and provider-visible tool output SHALL continue to follow the existing output contract.

#### Scenario: Successful answers carry ordered result rows
- **WHEN** AskUserQuestion completes successfully with two answered questions
- **THEN** the returned tool result metadata MUST contain `ask_user_question_result.items` with two entries
- **AND** each entry MUST contain the original `question` text and final `answer` text
- **AND** the item order MUST match the input question order

#### Scenario: Model-visible output remains unchanged
- **WHEN** AskUserQuestion completes successfully
- **THEN** `ToolResult.output` MUST remain the existing full answer string consumed by the model
- **AND** the metadata MUST NOT require the provider adapter to parse UI fields

### Requirement: AskUserQuestion tool call preview is readable

The shared tool-call preview builder SHALL return a compact readable preview for `AskUserQuestion` calls instead of falling back to raw JSON.

#### Scenario: Preview shows question count
- **WHEN** `ToolExecutor::build_tool_call_preview("AskUserQuestion", args)` receives valid arguments containing three questions
- **THEN** the preview MUST include `AskUserQuestion`
- **AND** the preview MUST indicate that three confirmation questions/items are being asked

#### Scenario: Preview includes first question when available
- **WHEN** the first question text is present in the arguments
- **THEN** the preview SHOULD include a truncated form of that first question

## MODIFIED Requirements

### Requirement: 输出契约

成功应答时,工具 MUST 返回 `ToolResult{ success=true }`,`output` 为单行字符串:

```
User has answered your questions: "Q1"="A1", "Q2"="A2", ...
```

- 顺序与输入 `questions` 顺序一致;
- multi-select 答案把多个选中的 label 以 `", "` 拼接成单值;
- "Other..." 答案使用用户键入的原始文本,不附加任何前缀;
- 答案和问题文本中若自身含有 `"`,实现 MUST NOT 做额外转义(与上游一致,作为已记录的已知行为);
- 工具 MUST NOT 填充 `ToolSummary`(让 TUI 走默认 fold 路径);
- 成功结果 MUST 同时携带 `ask_user_question_result` UI metadata,用于桌面/Web 工具卡片渲染,但该 metadata MUST NOT 改变 `output` 文本。

#### Scenario: 单题单选输出

- **WHEN** 成功单选应答单题,answer 为 "axios"
- **THEN** `ToolResult.output` MUST 等于 `User has answered your questions: "Which library?"="axios"`
- **AND** `ToolResult.metadata.ask_user_question_result.items[0]` MUST contain `question:"Which library?"` and `answer:"axios"`

#### Scenario: 多题混合输出

- **WHEN** 题 1 单选 "axios",题 2 多选 "TypeScript" + "Prettier"
- **THEN** `ToolResult.output` MUST 等于 `User has answered your questions: "Q1"="axios", "Q2"="TypeScript, Prettier"`(其中 Q1 / Q2 为用户原始问题文本)
- **AND** `ToolResult.metadata.ask_user_question_result.items` MUST contain two ordered Q/A entries

#### Scenario: 拒绝路径输出

- **WHEN** 用户按 Esc 或 agent abort
- **THEN** `ToolResult` MUST 满足 `success=false` 且 `output == "[Error] User declined to answer questions."`
- **AND** the result MUST contain UI-only `ask_user_question_result` metadata with `cancelled:true` and an empty `items` array
- **AND** persistence and live tool events MUST retain this metadata without changing the rejection output text
