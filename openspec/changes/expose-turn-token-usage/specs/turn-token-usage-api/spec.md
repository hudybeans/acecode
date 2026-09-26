## ADDED Requirements

### Requirement: Terminal turn events expose aggregate usage
For every regular agent turn, the daemon session event stream SHALL include a `usage` object on both the terminal `busy_changed` event and the following `done` event. Both events SHALL include the same `turn_id`, `outcome`, and aggregate usage values.

#### Scenario: Multi-step ACEModel turn completes
- **WHEN** one user turn performs multiple successful model steps because tools are called
- **THEN** terminal `busy_changed` and `done` each contain the stable turn id
- **AND** each event's `usage` equals the sum of all accounted model-step token fields in that turn
- **AND** existing per-step `usage` and `model_step_finish` events remain available

#### Scenario: Turn uses only provider-reported usage
- **WHEN** every accounted model step includes provider-reported usage
- **THEN** terminal `usage.has_data` is `true`

#### Scenario: Turn includes estimated usage
- **WHEN** at least one accounted model step lacks provider-reported usage and ACECode estimates it
- **THEN** terminal token counts include the estimate
- **AND** terminal `usage.has_data` is `false`

#### Scenario: Turn ends before a model request is accounted
- **WHEN** a regular turn is blocked or fails before any model step is accounted
- **THEN** terminal usage contains zero counts
- **AND** terminal `usage.has_data` is `false`

### Requirement: Aggregate usage is a summary, not an incremental delta
Terminal turn usage SHALL summarize the whole turn and SHALL NOT replace or alter the semantics of incremental per-step usage events.

#### Scenario: Client already consumes step usage
- **WHEN** a client receives per-step `usage` events followed by terminal turn usage
- **THEN** the terminal value can be used as the authoritative turn summary
- **AND** it is not an additional usage delta to add to the preceding step events
