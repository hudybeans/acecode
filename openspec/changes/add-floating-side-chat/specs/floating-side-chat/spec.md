## Purpose

Provide a movable, resizable side conversation above the ACECode application so users can discuss the current session across multiple turns, watch and stop live answers, and keep that discussion separate from the main task.

## ADDED Requirements

### Requirement: Application-wide floating conversation
The Web and Desktop UI SHALL open side chat from `/side`, `/btw`, or the existing side-chat menu in a floating window above the application surfaces. The header SHALL contain the conversation title and only one top-right action, close. The window SHALL support dragging, resizing on all edges and corners, independent transcript scrolling, and a fixed bottom composer. It SHALL remain usable within the current viewport and use the application's theme.

#### Scenario: Open and resize above the workbench
- **WHEN** the user opens side chat with the sidebar and preview visible
- **THEN** the window overlays those areas without changing the main layout and can be moved and resized within the viewport
- **AND** the close control remains reachable after viewport resizing or zoom changes

#### Scenario: Open without a question
- **WHEN** the user submits `/side` without arguments in an existing session
- **THEN** the empty floating conversation opens and focuses its input

### Requirement: Isolated multi-turn conversation
The system SHALL answer each side question using a safe main-session context snapshot plus the preceding successful or nonempty stopped side turns. It SHALL keep the side transcript temporary and independent from main-session history, tools, hooks, goals, event stream, and busy state. Failed or empty stopped turns SHALL remain visible without being added to future model context.

#### Scenario: Follow-up question
- **WHEN** the user sends a follow-up after a side answer
- **THEN** the model receives the preceding side question and answer along with current main-session context
- **AND** the main conversation and task state are unchanged

#### Scenario: Provider cannot guarantee a tool-free conversation
- **WHEN** the selected provider runs its own tools and cannot disable them for a side request
- **THEN** the system refuses the side request before invocation with a clear unsupported-provider error
- **AND** the main task remains available without changing its provider behavior

### Requirement: Streaming progress and cancellation
The UI SHALL show loading from submission, render actual streamed answer text, and provide a stop control for the active side request. The input SHALL be disabled from submission until completion, failure, or cancellation. Stopping SHALL cancel only the side model request and retain text already produced. Retried provider attempts SHALL replace provisional text rather than concatenate failed attempts.

#### Scenario: Waiting and streaming
- **WHEN** a side request is waiting for its first token or producing answer text
- **THEN** loading is visible, typing and duplicate submission are disabled, and stop remains available

#### Scenario: Stop then continue
- **WHEN** the user stops an answer and subsequently asks another question
- **THEN** generation stops, partial text remains readable, the input becomes available, and the new request works independently

#### Scenario: Failure or disconnection
- **WHEN** the provider fails or the stream disconnects unexpectedly
- **THEN** the UI reports the failure, preserves readable partial output, and releases the input for another attempt

### Requirement: Conversation lifecycle and compatibility
Closing SHALL cancel any active side request and preserve the temporary transcript and draft while the same main session remains selected. Switching sessions or leaving the view SHALL cancel the old side request and discard its temporary state. Late callbacks SHALL NOT affect another request or session. Existing synchronous side-question HTTP and TUI callers SHALL retain their single-turn behavior.

#### Scenario: Close and reopen
- **WHEN** the user closes and reopens side chat in the same session
- **THEN** its previous temporary transcript and unsent draft remain available

#### Scenario: Switch sessions during streaming
- **WHEN** the user switches the main session during a side answer
- **THEN** the old side request is cancelled and its subsequent events cannot change the new session's side chat

### Requirement: Private authenticated streaming transport
The streaming side interface SHALL require the existing daemon authentication, validate session identity, request identity, text-only roles and bounded payloads, and deliver side output only to the requesting connection. Cancellation and disconnect SHALL release request resources without affecting a main task.

#### Scenario: Invalid or concurrent input
- **WHEN** a client sends invalid history or starts a second side request on the same active connection
- **THEN** the daemon returns a structured error without starting another provider call
