## Purpose

Preserve the user's intended relationship between prose, files, attachments, and selected skills throughout composing, sending, and reopening Web/Desktop conversations.

## ADDED Requirements

### Requirement: References participate in ordered editable text
The composer SHALL insert selected files and skills at the current caret, preserve surrounding text, and allow references to move naturally when preceding text changes or wraps.

#### Scenario: Mixed references in a sentence
- **WHEN** a user selects a skill and two files between existing words
- **THEN** all references appear at their insertion positions with the surrounding text preserved
- **AND** editing preceding text does not move them to the beginning

#### Scenario: An upload completes after further typing
- **WHEN** an attachment finishes uploading while the user continues typing
- **THEN** its status updates at the original position without moving the caret or overwriting text

### Requirement: Atomic editing and clipboard operations preserve references
References SHALL behave as atomic editable units for deletion, selection, cut, copy, paste and undo, while preserving existing IME-safe input.

#### Scenario: Select inline references
- **WHEN** a focused composer selection includes a reference tag
- **THEN** its entire background and border use the same selection color as selected text
- **AND** its label and controls stay readable and restore their normal appearance when deselected

#### Scenario: Delete and undo a mixed selection
- **WHEN** a user deletes a selection containing text and an attachment and then undoes it
- **THEN** the original text, reference identity and order are restored

#### Scenario: Copy and paste a mixed selection
- **WHEN** content containing files and skills is copied and pasted within the composer
- **THEN** its order and reference identities are preserved
- **AND** external plain-text paste receives a readable fallback

### Requirement: Composer content survives lifecycle boundaries
Home and session drafts, pending messages, history recall and forked prompts SHALL retain ordered content and usable uploaded attachment references, with legacy text-only data still accepted.

#### Scenario: Leave and restore a draft
- **WHEN** a user leaves a task or home workspace and returns to its saved draft
- **THEN** text, skills and uploaded files appear in their saved order

#### Scenario: Queue and recall
- **WHEN** a mixed-content message is queued, edited, retried, recalled from history or forked into an input
- **THEN** its ordered references survive the operation

### Requirement: Sent messages preserve content order
New messages SHALL preserve ordered content through server persistence, live events and transcript reload, and render files and skills in their original positions.

#### Scenario: Send and reopen
- **WHEN** a mixed-content message is sent and the conversation is reopened
- **THEN** its inline references remain between the same text fragments
- **AND** existing file/attachment preview actions remain available

### Requirement: Skill references and compatibility remain valid
Selected skills SHALL activate through the existing explicit skill mechanism wherever they occur in the text. Builtin commands and legacy messages SHALL retain their existing semantics.

#### Scenario: Select a skill in the middle of a message with an attachment
- **WHEN** the user sends text containing a selected skill between words and an uploaded file
- **THEN** the selected skill can be resolved and loaded alongside the attachment
- **AND** label position does not imply a separate ordered execution workflow

### Requirement: Structured content is validated
The server SHALL validate ordered content and attachment references before accepting a new structured message, and SHALL reject malformed or unsupported structures without silently dropping references.

#### Scenario: Invalid attachment reference
- **WHEN** submitted ordered content names an attachment absent from the validated attachment payload
- **THEN** the server rejects the message with a useful error
