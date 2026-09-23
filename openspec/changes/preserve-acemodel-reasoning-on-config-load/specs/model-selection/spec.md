## ADDED Requirements

### Requirement: ACEModel catalog profiles preserve declared reasoning during startup

When loading a catalog-sourced ACEModel saved profile, ACECode SHALL retain a valid saved reasoning declaration while refreshing built-in capability tags. The effective `reasoning` capability SHALL agree with the declaration. The same rule SHALL apply when validating a last-good snapshot.

#### Scenario: Saved upstream reasoning survives catalog refresh

- **WHEN** a catalog-sourced ACEModel profile has valid saved reasoning options with `supported: true`, and the built-in catalog does not list reasoning
- **THEN** configuration loading succeeds with the saved reasoning options and a `reasoning` capability tag
- **AND** loading does not initiate automatic rollback

#### Scenario: No declared reasoning uses built-in capabilities

- **WHEN** a catalog-sourced ACEModel profile has no saved reasoning options
- **THEN** configuration loading uses the built-in capability tags without inventing a reasoning declaration

#### Scenario: Invalid reasoning remains invalid

- **WHEN** saved reasoning options are malformed, or a non-ACEModel profile has contradictory declared reasoning and capability tags
- **THEN** configuration loading rejects that invalid profile through the existing recovery behavior
