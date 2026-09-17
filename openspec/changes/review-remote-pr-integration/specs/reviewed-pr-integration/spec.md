## ADDED Requirements

### Requirement: Recovery state gates live session access
The frontend SHALL withhold live monitoring while a session resume is pending or failed, and SHALL preserve already loaded history when recovery succeeds.

#### Scenario: Resume fails
- **WHEN** runtime recovery fails after disk history is displayed
- **THEN** no live connection is opened for that failed runtime and the composer cannot submit to it

#### Scenario: Resume succeeds
- **WHEN** disk history is visible and the runtime becomes available
- **THEN** the transcript remains visible while live catch-up completes

### Requirement: Tall questions retain reachable controls
The question picker SHALL fit the available chat height and scroll its options while keeping its header and footer reachable.

#### Scenario: Eight long options in a short chat pane
- **WHEN** the pending question contains eight long options in a short viewport
- **THEN** the options scroll and the cancellation and submission actions remain inside the viewport

### Requirement: Launcher errors remain failures
The developer launcher SHALL preserve nonzero daemon startup failures except the explicit already-running result and SHALL support the Windows Python launcher fallback.

#### Scenario: Stale port after a failed launch
- **WHEN** daemon startup fails and a stale port file exists
- **THEN** the script returns the startup error without opening a browser

#### Scenario: Only py is available on Windows
- **WHEN** python is absent from PATH and py is available
- **THEN** the batch wrapper launches the script with py
