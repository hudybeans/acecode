# Configurable AskUserQuestion option count limit

**Status**: accepted

AskUserQuestion's per-question option count was hardcoded to `kMinOptions=2` / `kMaxOptions=4` in the shared tool code. We decided to make the upper bound configurable via `ask.max_options` (legal range 4–8, default 6, clamped with a warning when out of range), while the lower bound stays fixed at 2. The tool schema (`minItems`/`maxItems`) and the validation error message are built from the configured limit, so they stay in sync automatically. When the model submits more options than the configured budget, the call is rejected with a hard error naming the current limit.

The existing `ask.max_questions` (question budget) established the config pattern — same section, same clamp-and-warn behavior — and this change extends that pattern rather than introducing a new mechanism.

**Considered Options**

- **Make the lower bound configurable too** — rejected: narrower change surface; nothing has needed a floor other than 2.
- **Silently truncate over-limit options** — rejected: masks model errors and makes the conversation transcript diverge from what the user actually saw.
- **Reject the config file on out-of-range values** — rejected: `ask.max_questions` already clamps with a warning; failing startup for a cosmetic knob is worse.

**Consequences**

- Default 6 is a deliberate behavior change from the previous fixed 4: models may now submit up to 6 options without any configuration. Set `ask.max_options: 4` to restore the old cap.
- Config `ask.max_options` is read once at startup, like `max_questions`; changing it requires a restart.
- Error messages and tool description previously hardcoded "2-4" must be derived from the configured value.
- TUI and GUI render option lists dynamically (`options.size()`), so no layout work is needed for up to 8 options.
