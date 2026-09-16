## Purpose

Define safe default activation for bundled hook sources while preserving user-owned hook configurations and allowing explicit reviewed integrations.

## ADDED Requirements

### Requirement: Bundled hooks default to disabled
ACECode SHALL ship bundled agent-reporting hooks disabled and SHALL upgrade unchanged official installed copies to the disabled definition without changing user-global or project hook configuration.

#### Scenario: Fresh installation
- **WHEN** ACECode installs its bundled hook seed into a new data directory
- **THEN** the installed source SHALL be disabled and contribute no executable hook handlers

#### Scenario: Upgrade from the previous official definition
- **WHEN** startup reconciles a recognized unchanged official hook seed from an older release
- **THEN** it SHALL install the current disabled definition and record the current seed revision

#### Scenario: User-modified files
- **WHEN** a user has modified an installed hook seed or maintains separate user/project hook files
- **THEN** startup SHALL preserve those files and SHALL NOT disable separate user/project hooks

### Requirement: Hook sources can explicitly disable their handlers
ACECode SHALL honor a boolean top-level `enabled: false` in Codex-shaped hook sources, retain source diagnostics and contribute no handlers from that source. Missing or true SHALL preserve existing loading and trust behavior.

#### Scenario: Disabled source with valid handler definitions
- **WHEN** a valid source declares `enabled: false`
- **THEN** its commands SHALL NOT be registered and a diagnostic SHALL explain that the source is disabled

#### Scenario: Explicit active user configuration
- **WHEN** a user installs the active example in a supported user source and completes trust review
- **THEN** its matching commands SHALL remain executable under the existing hook policy

### Requirement: Inactive hook dispatch does not serialize event input
ACECode SHALL prepare serialized event input only when a matching supported trusted command hook will run.

#### Scenario: No runnable hook and malformed tool output
- **WHEN** the registry is empty or all handlers are unmatched, disabled, untrusted, unsupported or lack a command
- **AND** event input contains invalid UTF-8
- **THEN** dispatch SHALL return without serializing that input or executing commands
- **AND** matcher diagnostics and matched/skipped counts SHALL retain their normal meanings
