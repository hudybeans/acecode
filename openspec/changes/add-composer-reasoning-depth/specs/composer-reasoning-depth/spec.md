## Purpose

Allow users to adjust reasoning effort for explicitly supported models from the existing chat composer while preserving session isolation and sending only valid provider parameters.

## ADDED Requirements

### Requirement: ACEModel reasoning is explicitly declared
The system SHALL read an optional per-model reasoning declaration containing supported effort values and an optional matching default. Missing, empty, or invalid declarations MUST leave reasoning unchecked and MUST NOT expose a reasoning-depth control. Model names MUST NOT imply support.

#### Scenario: Declared effort choices
- **WHEN** ACEModel discovery returns a model with valid low and high effort values
- **THEN** the model's reasoning capability is enabled and exactly those levels are available
- **THEN** the declaration survives probe-cache restoration and model-profile saving

#### Scenario: Absent or removed declaration
- **WHEN** discovery returns a model without usable reasoning fields
- **THEN** the discovered model has no enabled reasoning capability or depth control, including when an older discovery advertised reasoning

### Requirement: Custom models require manual reasoning opt-in
Custom models SHALL initially have reasoning disabled. Enabling the reasoning capability SHALL make its supported effort list editable, with low, medium, and high as an initial template when no list exists. Disabling the capability MUST remove active reasoning controls and overrides from outgoing requests.

#### Scenario: Manual opt-in
- **WHEN** a user checks reasoning for a custom model and saves a configured effort list
- **THEN** the composer shows that list for the model and no levels outside it

#### Scenario: Manual opt-out
- **WHEN** a user unchecks reasoning
- **THEN** the composer hides reasoning depth and subsequent requests omit reasoning controls

### Requirement: Effort selection is scoped and durable
The system SHALL store reasoning effort as a session override independent from model defaults. Creation, resume and fork MUST preserve an applicable choice. Selecting default MUST clear the override. Invalid values and changes while the session is busy MUST fail without changing session state. Switching models MUST clear the old model's override.

#### Scenario: Isolated selection
- **WHEN** idle session A selects high while session B uses the same model
- **THEN** only A's effective effort and persisted override change
- **THEN** global model settings and B remain unchanged

#### Scenario: Restore and inherit
- **WHEN** a session with an effort override is resumed or forked
- **THEN** its valid effort choice is retained
- **WHEN** the user selects default
- **THEN** the saved model settings become effective again

#### Scenario: Busy or invalid request
- **WHEN** a caller selects an unsupported effort or mutates effort during an active turn
- **THEN** the request fails and the prior model and effort remain effective

### Requirement: Chosen effort reaches the provider
Explicit choices for enabled OpenAI-compatible models SHALL be sent using `reasoning_effort`. Supported Anthropic and OpenRouter routes SHALL use their own request fields. A session effort override MUST take precedence over an inherited reasoning token budget. Disabled or undeclared models MUST NOT receive reasoning controls.

#### Scenario: OpenAI-compatible explicit effort
- **WHEN** a supported ACEModel or manually enabled custom OpenAI model runs with session effort high
- **THEN** its Chat Completions request includes `reasoning_effort: "high"`

#### Scenario: Default or disabled model
- **WHEN** no session override exists
- **THEN** the request follows the saved profile settings
- **WHEN** that profile has no enabled reasoning configuration
- **THEN** the request contains no reasoning control fields

### Requirement: Composer adds a minimal accessible control
The web composer SHALL show a compact effort selector adjacent to its model button only for enabled models with usable effort choices. It MUST preserve the current input geometry and surrounding controls, offer default plus supported levels, remain usable in narrow layouts, and disable mutations during active work.

#### Scenario: Supported model selected
- **WHEN** the selected model permits reasoning effort
- **THEN** the composer displays its effective level or default and opens an anchored single-select menu
- **THEN** keyboard selection, Escape dismissal and composer focus continue to work

#### Scenario: Unsupported model selected
- **WHEN** the user selects a model without enabled reasoning or supported levels
- **THEN** the effort selector disappears without moving the input editor or changing other control behavior
