## Purpose

Allow personal WhatsApp conversations to use independent ACECode sessions hosted by daemon/Desktop, including attachments and interactive approvals, with separate standalone terminal configuration.

## ADDED Requirements

### Requirement: Personal account connection
The system SHALL provide QR pairing, persisted credentials, connection status, reconnect and explicit disconnect for a personal WhatsApp account. Only one local runtime SHALL own its connection at a time.

#### Scenario: Pair from the terminal
- **WHEN** the user enables WhatsApp and requests pairing
- **THEN** the terminal exposes a scannable QR code and subsequently reports the connected account without exposing credentials

#### Scenario: Concurrent frontends
- **WHEN** multiple daemon/Desktop instances start
- **THEN** only the first instance acquires account ownership and connects, later instances do not start a bridge or handle messages until the owner exits

### Requirement: Independent durable conversations
The system SHALL create a no-workspace session for the first authorized message from a conversation, preserve its binding and resume it for later messages. DMs SHALL be isolated by account and contact; groups SHALL be isolated by account, group and sender.

#### Scenario: Restart and resume
- **WHEN** an authorized contact sends another message after a runtime restart
- **THEN** their existing session and conversation history are resumed

#### Scenario: Duplicate message
- **WHEN** a message receipt is repeated
- **THEN** it does not start a second agent turn

### Requirement: Access and group policy
Only paired or explicitly allowed users SHALL trigger tools. Groups SHALL additionally require an allowed group and an explicit mention. Ordinary conversation content SHALL NOT configure access or change another user's binding.

#### Scenario: Unknown contact
- **WHEN** an unknown contact sends a DM
- **THEN** pairing instructions are returned without creating an agent session or executing tools

#### Scenario: Host dangerous mode
- **WHEN** a channel creates or restores a session in a daemon started with local dangerous mode
- **THEN** that channel session uses default permissions without inheriting the host's permission bypass

### Requirement: Two way content delivery
The system SHALL accept text, images and documents, preserve quoted-message context, and send text and supported files back to the originating chat. Unsupported attachments and delivery failures SHALL be reported without terminating other conversations.

#### Scenario: Image and document
- **WHEN** an authorized user sends an image or document
- **THEN** it is provided to the selected session through the existing structured input mechanism

### Requirement: Interactive controls
The system SHALL support questions, tool permissions and stop controls through WhatsApp and terminal management. Controls SHALL bypass the ordinary busy queue. Only the authorized participant for the conversation or the local operator SHALL resolve its requests; the first valid answer SHALL win.

#### Scenario: Simultaneous answers
- **WHEN** terminal and WhatsApp answer the same pending request
- **THEN** only one decision is accepted and the other surface observes its closure

### Requirement: Daemon and Desktop hosting
The system SHALL provide standalone CLI configuration and diagnostics. Configuration and management commands SHALL NOT start a daemon. User-started daemons and Desktop-managed daemons SHALL automatically connect persisted enabled channels, subject to exclusive account ownership. Shutdown SHALL follow the existing host lifecycle policy. The main TUI SHALL NOT register `/channels` or provide a channel setup surface.

#### Scenario: Desktop only
- **WHEN** the user opens the desktop with WhatsApp enabled and no daemon manually started
- **THEN** the desktop-managed runtime connects and serves the independently bound conversations

#### Scenario: Configuration without a host
- **WHEN** the operator completes `acecode channels` without a running daemon or Desktop
- **THEN** credentials and access settings are saved, any temporary pairing bridge is stopped, no background host or channel agent session remains, and the wizard reports only that configuration is saved

#### Scenario: Reconfiguration while in use
- **WHEN** the operator configures WhatsApp while daemon/Desktop is already running
- **THEN** settings are saved without inspecting, contacting, stopping or warning about those instances
- **AND** running instances keep their startup configuration and cannot overwrite the newly saved settings while persisting runtime history

#### Scenario: Configuration takes effect on startup
- **WHEN** another daemon/Desktop starts after configuration is saved
- **THEN** it reads the saved settings and connects subject to exclusive ownership
- **AND** previously started instances, including standby instances, do not reload configuration
- **AND** instances started with the channel disabled do not claim connection ownership

### Requirement: Compatibility
Existing remote control SHALL remain functional and retain its existing binding behavior.

#### Scenario: Existing RC plugin
- **WHEN** the user activates an existing RC plugin
- **THEN** its activation, question handling and messages continue to work independently of WhatsApp

### Requirement: Guided terminal setup
The system SHALL offer a standalone step-by-step terminal configuration flow with a personal self-chat default, human-readable phone inputs, pinned dependency installation, live QR refresh, cancellation and retry. Saved logins SHALL be reused without connecting. New pairing SHALL use an isolated temporary bridge and credential profile, suppress message ingress and sending, and persist auto-connect settings only after verified pairing. Setup progress and QR data SHALL NOT enter an agent conversation.

#### Scenario: First-time setup
- **WHEN** the operator runs `acecode channels` or `acecode channels setup`
- **THEN** the wizard guides them through access choices, dependency preparation and QR pairing without requiring npm or JID commands

#### Scenario: Cancel or fail before pairing
- **WHEN** setup is cancelled, dependencies fail to install, or pairing times out
- **THEN** a previously disabled channel remains disabled and existing credentials, access and history are preserved

#### Scenario: Successful personal setup
- **WHEN** a personal account finishes QR pairing
- **THEN** its linked account is authorized for self-chat, auto-connect is saved for the next daemon/Desktop, and the temporary bridge is stopped before reporting completion

#### Scenario: Keep configured access
- **WHEN** the operator reruns setup on a configured channel
- **THEN** existing allowed contacts remain authorized and completed setup adds only the explicitly selected contacts
- **AND** a saved linked account is reused without installing dependencies, starting a bridge or checking host ownership

#### Scenario: Standalone command preserves terminal history
- **WHEN** the operator runs `acecode channels` or `acecode channels setup` directly from the shell
- **THEN** the wizard appears after the command in the primary terminal output, uses only the current step's required height, and does not clear previous commands or switch to a full-screen buffer
- **AND** exiting leaves the previous terminal content available and returns below the wizard
- **AND** no channel surface or `/channels` command is available inside the main TUI
