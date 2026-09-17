## ADDED Requirements

### Requirement: Decoded text is valid Unicode UTF-8
Complete and incremental text decoders SHALL emit only well-formed UTF-8 encoding Unicode scalar values, preserve valid characters across chunk boundaries, and convert supported Windows legacy output before serialization.

#### Scenario: GBK output resembles an overlong UTF-8 encoding
- **WHEN** CP936 output contains bytes C0 B4 D4 B4, including arbitrary chunk splits
- **THEN** the decoder emits the correct UTF-8 Chinese text and strict JSON serialization succeeds

#### Scenario: Malformed Unicode input
- **WHEN** input contains overlong sequences, surrogate encodings, out-of-range code points, or incomplete characters
- **THEN** validation rejects it and decoding converts or replaces malformed bytes without emitting invalid UTF-8

### Requirement: Hooks cannot terminate the process on malformed text or runner errors
Hook dispatch SHALL produce valid JSON for arbitrary payload strings, contain runner exceptions, retain earlier decisions, and continue subsequent eligible hooks. Legacy asynchronous dispatch SHALL retain a functioning worker after a failed invocation.

#### Scenario: Active hook receives invalid nested text
- **WHEN** an eligible hook receives malformed UTF-8 in a payload string or key
- **THEN** its stdin is parseable JSON with replacement characters and dispatch does not throw

#### Scenario: Hook runner throws
- **WHEN** a hook runner throws a standard or unknown exception
- **THEN** the failure is diagnosed and later eligible hooks can run

### Requirement: Worker task failures are recoverable
AgentLoop SHALL catch unexpected task exceptions, restore idle and active-turn state, report terminal error status, and process subsequent queued work even when an error-reporting callback also throws.

#### Scenario: Unexpected task failure followed by another turn
- **WHEN** a task throws and a subsequent user task is submitted
- **THEN** the failed turn ends with an error, pending state clears, and the subsequent task executes
