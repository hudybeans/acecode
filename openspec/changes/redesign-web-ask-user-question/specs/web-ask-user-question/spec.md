## ADDED Requirements

### Requirement: Question navigation and composer replacement

The Web UI SHALL show one question at a time, with previous/next navigation and a collapsible header. While a request is pending, the picker SHALL replace the composer input area, including when collapsed. Resolving or cancelling SHALL restore the composer.

#### Scenario: Navigate and collapse a pending request
- **WHEN** a user navigates questions or collapses and expands the picker
- **THEN** answers and custom drafts remain intact and the composer stays hidden until resolution

### Requirement: Answer selection and custom drafts

The Web UI SHALL keep preset selection, custom text, and custom activation separate. Single-select presets and active custom answers SHALL be mutually exclusive. Multi-select SHALL allow presets and active custom text together. Inactive custom drafts SHALL remain editable but SHALL NOT enter the payload.

#### Scenario: Preserve an inactive custom draft
- **WHEN** a user types a custom single-select answer and then selects a preset
- **THEN** the draft remains visible but inactive and only the preset enters the payload

#### Scenario: Combine multi-select answers
- **WHEN** a user selects several presets and enters active custom text
- **THEN** the final answer includes all selected presets and the trimmed custom text

### Requirement: Collect answers once per request

Non-final actions SHALL only update local state and advance. Unanswered non-final questions SHALL offer Skip. The final question SHALL always offer Submit, even when all answers are empty. Submission SHALL send the complete batch with existing identifiers. The daemon SHALL derive `not_answered` when both `selected` and `custom_text` are empty, yielding `Not answered` to the model.

#### Scenario: Skip and submit a batch
- **WHEN** a user skips a non-final question and submits the final question
- **THEN** no answer is sent during navigation and one complete payload is sent at submission
- **AND** skipped questions are represented as unanswered

### Requirement: Confirming an option preserves its selection

Plain activation and Space SHALL toggle selection. Enter, numeric shortcuts, inline confirmation, and double-click SHALL select the target and advance on non-final questions, without deselecting an already selected option. On the final question these option confirmation actions SHALL select without submitting.

#### Scenario: Confirm an already selected multi-select option
- **WHEN** a user double-clicks an option or confirms an already selected option
- **THEN** the option and other multi-select answers remain selected, and a non-final question advances

### Requirement: Keyboard target and text input handling

Enter SHALL target the hovered or explicitly focused option, otherwise the first recommended option, otherwise the first preset. Up/Down SHALL move focus including the custom row. Tab/Shift+Tab and Right/Left SHALL navigate outside text inputs. Digits 1–9 SHALL confirm the corresponding preset or focus custom input when beyond the preset count. Ctrl+Enter SHALL submit the final question. Inside custom input, Enter SHALL invoke the primary action without inserting a newline; other navigation keys SHALL retain text editing behavior. IME composition SHALL NOT invoke question shortcuts.

#### Scenario: Use the recommended option by default
- **WHEN** Enter is pressed without an explicit target
- **THEN** the first recommended option is selected, or the first preset if no recommendation exists

#### Scenario: Confirm Chinese input
- **WHEN** IME composition emits Enter or the composing key code
- **THEN** the picker does not advance, submit, or cancel

#### Scenario: Submit while editing custom text
- **WHEN** non-composing Enter is pressed inside custom input
- **THEN** the picker advances on a non-final question or submits the final batch

### Requirement: Two-stage Escape and cancellation

Outside text input, the first Escape SHALL clear selections while preserving custom drafts and start a 1.2 second window. A second Escape within that window SHALL cancel. Escape inside custom input SHALL exit editing without arming cancellation. The Cancel button SHALL cancel directly with the existing `cancelled` payload.

#### Scenario: Clear answers before cancelling
- **WHEN** a user presses Escape twice within 1.2 seconds
- **THEN** the first clears selections and the second cancels the request

### Requirement: Selection and copy feedback

Selected badges SHALL display a check mark. Hover SHALL expose copy and confirm actions. Successful copy SHALL show a check for 1.5 seconds without changing answers.

#### Scenario: Copy a preset description
- **WHEN** a user clicks copy
- **THEN** the option text and description are copied without changing answers or question position

### Requirement: Durable feedback belongs to its tool result

Submission, cancellation, and interjection feedback SHALL derive only from the corresponding completed tool metadata and render once through shared ToolBlock. Feedback SHALL preserve multi-select and unanswered annotations after reload, self-heal, and subsequent turns. Pending questions and other sessions SHALL NOT inherit previous feedback.

#### Scenario: Ask consecutive questions
- **WHEN** one question finishes and another starts before any composer input
- **THEN** only the completed tool has a feedback card

#### Scenario: Restore results with fresh identifiers
- **WHEN** reload or self-heal recreates items, including renamed or nameless tool results
- **THEN** each result retains exactly its own card without cached item identifiers
