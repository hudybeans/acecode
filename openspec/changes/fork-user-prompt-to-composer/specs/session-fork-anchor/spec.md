## ADDED Requirements

### Requirement: Forking on a user message retains history from before that prompt
When the fork target is a user message, the new session SHALL retain the
conversation prefix that ends **before** that prompt ran, and SHALL NOT include
the clicked prompt as a committed message.

#### Scenario: Fork on a user message that follows an assistant reply
- **WHEN** a client forks at a user message whose preceding real message is an assistant reply
- **THEN** the new session retains every message up to and including that assistant reply
- **AND** the clicked user message is not present in the new session history

#### Scenario: Fork on the first user message of a session
- **WHEN** a client forks at a user message that has no real message before it
- **THEN** the new session is created with an empty conversation prefix
- **AND** the fork still succeeds

#### Scenario: Fork on the later of two consecutive user messages
- **WHEN** a client forks at a user message whose preceding real message is another user message
- **THEN** the new session retains that earlier user message
- **AND** only the clicked user message is excluded

### Requirement: Fork anchor resolution skips non-conversational records
The anchor scan SHALL skip records that are not part of the conversation, using
the same predicates the fork writer already uses, so no boundary or diagnostic
record can become the last message of a forked session.

#### Scenario: Checkpoint, timing, and diff records sit between the prompt and the reply
- **WHEN** file checkpoint, turn timing, or turn net diff records appear between the previous assistant reply and the clicked user message
- **THEN** those records are skipped during anchor resolution
- **AND** the anchor lands on the assistant reply

#### Scenario: Meta records are present
- **WHEN** a message is marked `is_meta`
- **THEN** it is skipped during anchor resolution

### Requirement: A forked session never ends with a dangling tool call
The retained prefix SHALL always include the tool results for any assistant
message it retains that declares tool calls.

#### Scenario: The clicked prompt interrupts a tool round
- **WHEN** the real message immediately before the clicked user message is a tool result
- **THEN** the anchor stops at that tool result
- **AND** the retained prefix still contains the assistant tool-call message together with its result

#### Scenario: Anchor candidate is an assistant message with unsatisfied tool calls
- **WHEN** anchor resolution reaches an assistant message that declares tool calls whose results are not retained
- **THEN** resolution continues backwards past that assistant message

### Requirement: Forking on an assistant message keeps existing behavior
When the fork target is not a user message, the new session SHALL retain the
prefix including that message, exactly as before this change.

#### Scenario: Fork on an assistant reply
- **WHEN** a client forks at an assistant message
- **THEN** the retained prefix ends with that assistant message
- **AND** no prompt is returned for composer refill

### Requirement: Fork response carries the prompt to restore
When the fork target is a user message, the fork response SHALL include the
plain text of that message and the role of the resolved anchor so the client can
refill the composer without re-deriving the rule.

#### Scenario: Fork request targets a user message
- **WHEN** a fork succeeds on a user message
- **THEN** the response contains `restored_prompt` with that message's plain text
- **AND** the response contains `fork_anchor_role`

#### Scenario: Fork request targets an assistant message
- **WHEN** a fork succeeds on an assistant message
- **THEN** the response contains no `restored_prompt`

### Requirement: Client refills the composer with the restored prompt
After a fork that returns a prompt, the client SHALL place that text into the
composer, preserve it across the session switch, and leave it unsent.

#### Scenario: Fork completes on desktop or Web
- **WHEN** a fork response contains `restored_prompt`
- **THEN** the composer value is set to that text when the new session is activated
- **AND** the composer value survives the session switch
- **AND** no message is sent automatically

#### Scenario: User sends the refilled prompt unchanged
- **WHEN** the user submits the composer without editing the refilled text
- **THEN** the prompt is sent to the new session
- **AND** the source session is left untouched

#### Scenario: Fork returns no prompt
- **WHEN** a fork response contains no `restored_prompt`
- **THEN** the composer is left as it was

#### Scenario: Source session has an unsaved draft
- **WHEN** a user forks while the source composer has text awaiting autosave
- **THEN** the source session saves its own draft unchanged
- **AND** only the destination session receives the restored historical prompt

### Requirement: Integrated build automation preserves supported generators and layouts
Build commands SHALL support both Visual Studio and Ninja. Default desktop
discovery SHALL retain existing build layouts on every supported platform.

#### Scenario: Verify a Visual Studio build
- **WHEN** package verification builds with a Visual Studio generator
- **THEN** parallelism is supplied through CMake rather than Ninja flags

#### Scenario: Discover a macOS preset build
- **WHEN** desktop launch or listing runs without an explicit build directory
- **THEN** an app under build/macos-arm64-release remains discoverable

### Requirement: Portable packages match requested code, architecture, and output
Portable packaging SHALL incrementally build current C++ sources on every run,
use architecture-compatible dependencies and binaries, and honor the full output
path supplied by the caller.

#### Scenario: Backend changes with unchanged frontend
- **WHEN** frontend hashes match but C++ sources have changed
- **THEN** packaging still runs the incremental build before copying executables

#### Scenario: Package for arm64
- **WHEN** the caller selects arm64
- **THEN** configuration selects arm64-osx and rejects an incompatible build cache
- **AND** all packaged executables are verified for arm64

#### Scenario: Archive outside the repository
- **WHEN** the caller specifies an output path outside repo/dist
- **THEN** the archive is written and verified at that complete path
