# ACECode

ACECode is a local coding agent with a TUI and a desktop/web GUI, sharing one agent loop and one tool set across ends.

## Language

**AskUserQuestion**:
A cross-end tool that asks the user multiple-choice questions mid-task. TUI (overlay) and GUI (browser modal) are only different transports; the tool logic and its limits are shared and single-sourced.
_Avoid_: question tool, 提问工具 (ambiguous with unrelated prompts)

**Question budget**:
The maximum number of questions one AskUserQuestion call may contain. Configured by `ask.max_questions`; shared by all ends.
_Avoid_: 问题上限 (vague, could mean the text length limit)

**Option budget**:
The maximum number of selectable options a single question may carry. Configured by `ask.max_options`; shared by all ends.
_Avoid_: 选项个数限制 (vague), 选项上限 (collides with option text limits)

**Option floor**:
The minimum number of options a question must have. Fixed at 2; not configurable.
_Avoid_: 最少选项 (unclear whether user-facing or validation-facing)

**Over-limit request**:
A model request whose question count or option count exceeds the current configured budget. Always rejected with a hard error naming the dynamic limit; never silently truncated.
_Avoid_: 超量 (unclear), truncation (that is the rejected alternative, not the term)

**Out-of-range config**:
A config value outside the legal range of a budget key. Clamped to the nearest boundary with a warning; the app still starts.
_Avoid_: 非法配置 (implies rejection)
