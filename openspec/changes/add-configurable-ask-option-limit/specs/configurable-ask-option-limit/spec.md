## Purpose

Make the maximum number of options a single AskUserQuestion question may carry configurable, while keeping every model-visible limit derived from the configured value.

## ADDED Requirements

### Requirement: Option budget is configurable

The system SHALL expose `ask.max_options` in the configuration with a default of 6. The legal range SHALL be 4 through 8 inclusive. All run ends (TUI, GUI, headless) SHALL enforce the same configured budget.

#### Scenario: Default budget
- **WHEN** no `ask.max_options` is present in the configuration
- **THEN** a question with 6 options is accepted and a question with 7 options is rejected

#### Scenario: Widen the budget
- **WHEN** `ask.max_options` is set to 8
- **THEN** a question with 8 options is accepted and a question with 9 options is rejected

#### Scenario: Narrow the budget
- **WHEN** `ask.max_options` is set to 4
- **THEN** a question with 4 options is accepted and a question with 5 options is rejected

### Requirement: Out-of-range configuration is clamped

A configured `ask.max_options` outside 4–8 SHALL be clamped to the nearest boundary with a warning, and the application SHALL still start.

#### Scenario: Clamp above the range
- **WHEN** `ask.max_options` is set to 10
- **THEN** the effective budget is 8 and a warning is recorded

#### Scenario: Clamp below the range
- **WHEN** `ask.max_options` is set to 3
- **THEN** the effective budget is 4 and a warning is recorded

### Requirement: Over-limit requests are rejected with the dynamic limit

When a model submits more options than the current budget, the tool SHALL reject the call with a hard error naming the current upper bound. The tool schema (`maxItems`) SHALL reflect the same configured value so the model sees the real limit in advance.

#### Scenario: Rejection message names the limit
- **WHEN** the budget is 6 and a question carries 7 options
- **THEN** the error states the limit as 6 and the call fails

#### Scenario: Schema follows the configuration
- **WHEN** `ask.max_options` is set to 8
- **THEN** the tool definition's options schema advertises a maximum of 8 items

### Requirement: Lower bound stays fixed

The minimum number of options per question SHALL remain 2 regardless of configuration.

#### Scenario: Two options still valid
- **WHEN** a question carries 2 options and the budget is 6
- **THEN** the question is accepted

#### Scenario: One option still invalid
- **WHEN** a question carries 1 option and the budget is 6
- **THEN** the question is rejected
