## ADDED Requirements

### Requirement: Answered AskUserQuestion renders as confirmation card

Desktop / Web UI SHALL render completed successful AskUserQuestion results as a compact collapsible confirmation card inside the normal tool display. The card SHALL use the structured `ask_user_question_result` metadata when present.

#### Scenario: Card title shows confirmed count
- **WHEN** a completed AskUserQuestion tool result contains three Q/A items
- **THEN** the visible tool block MUST show a header titled `已确认 3 项`
- **AND** the header MUST include a green confirmation icon and a collapse/expand affordance

#### Scenario: Card body shows compact Q/A rows
- **WHEN** the confirmation card is expanded
- **THEN** each item MUST render a Q row and an A row using a fixed-width marker column
- **AND** question text MUST be visually weaker than answer text
- **AND** answer markers and the confirmation icon MUST use the success/green theme color
- **AND** items MUST be separated by subtle divider lines rather than large vertical gaps

#### Scenario: Card can collapse
- **WHEN** the user clicks the card header
- **THEN** the Q/A body MUST hide or show
- **AND** the header state text and chevron direction MUST update to match the collapsed state

#### Scenario: Long text is clamped with native tooltip
- **WHEN** a question or answer visually overflows two lines
- **THEN** the visible text MUST be clamped to at most two lines with an ellipsis
- **AND** hovering that clamped text MUST expose the full text through the native tooltip
- **AND** unclamped text MUST NOT receive the extra tooltip or help cursor

#### Scenario: Theme and width compatibility
- **WHEN** the card renders in light or dark theme and within a narrow desktop WebView
- **THEN** it MUST use existing theme tokens for background, border, text, and success colors
- **AND** long URLs or English tokens MUST wrap or break without creating horizontal page overflow

### Requirement: AskUserQuestion result card survives resume

Desktop / Web UI SHALL render the same confirmation card after loading persisted session history when the stored tool result message contains `metadata.ask_user_question_result`.

#### Scenario: Persisted tool message restores card
- **WHEN** session history contains a tool message with `metadata.ask_user_question_result.items`
- **THEN** transcript normalization MUST create a completed tool entry that carries those Q/A items
- **AND** `ToolBlock` MUST render the confirmation card instead of the generic completed-tool fallback

### Requirement: AskUserQuestion result card remains visible in processed history

Desktop / Web transcript projection SHALL keep AskUserQuestion confirmation cards visible as standalone tool blocks and SHALL NOT fold them into `已处理` processed activity summaries.

#### Scenario: Card before final answer stays visible
- **WHEN** a turn contains process activity, an AskUserQuestion confirmation card, more process activity, and a final assistant answer
- **THEN** projection MUST split process activity into processed summaries around the confirmation card
- **AND** the confirmation card MUST remain a top-level visible tool item
- **AND** the confirmation card MUST NOT appear inside any processed summary `collapsedItems`

#### Scenario: Card before task completion stays visible
- **WHEN** a turn contains process activity, an AskUserQuestion confirmation card, more process activity, a final assistant answer, and a successful task completion
- **THEN** projection MUST keep the confirmation card as a top-level visible tool item before the final answer
- **AND** processed summaries MUST cover only the process activity before and after the confirmation card
- **AND** the completion summary MUST remain visible after the final answer

### Requirement: Explicit cancellation feedback survives transcript replacement

Desktop / Web UI SHALL display `已取消全部回答` in the shared tool renderer when a completed tool result contains namespaced `ask_user_question_result.cancelled=true` metadata. Cancellation SHALL remain a standalone tool result even when its tool name is missing or rewritten, and SHALL NOT display successful answer rows or a confirmation count.

#### Scenario: Cancellation survives reload and self-heal
- **WHEN** a live cancelled question is replaced by persisted history during reload, self-heal, or transcript replacement
- **THEN** exactly one cancellation card MUST remain at that tool result's transcript position
- **AND** continuing the conversation MUST NOT fold that card into processed activity

#### Scenario: Other tool metadata is not question feedback
- **WHEN** a different tool carries a plain `metadata.cancelled` flag without namespaced question-result metadata
- **THEN** it MUST retain the generic tool rendering and MUST NOT create a question feedback card

### Requirement: Persisted tool names respect invocation order and turn boundaries

Transcript normalization SHALL preserve explicit tool names and otherwise recover a tool result's name only from an unconsumed preceding call in the same user turn. A later assistant call reusing an ID SHALL replace stale pending metadata for that ID.

#### Scenario: Interrupted call ID is reused
- **WHEN** an earlier call has no result and a later call reuses its ID
- **THEN** the later result MUST use the later call's tool name
- **AND** no result MUST borrow a tool name from a future call or an earlier user turn
