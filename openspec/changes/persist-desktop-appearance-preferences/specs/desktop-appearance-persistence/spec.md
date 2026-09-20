## ADDED Requirements

### Requirement: Appearance preferences use stable user storage
The system SHALL persist the Desktop/WebUI light-dark preference, color theme, and font size in stable user configuration that is independent of the daemon loopback port.

#### Scenario: Desktop restarts on a different port
- **WHEN** a user selects an explicit light or dark mode, color theme, and font size and later starts Desktop on a different loopback port
- **THEN** the new Desktop instance restores all three selected values from stable user configuration

#### Scenario: Legacy configuration has no appearance fields
- **WHEN** ACECode loads a configuration created before appearance persistence fields existed
- **THEN** it uses system light-dark resolution, the blue color theme, and medium font size without rejecting the configuration

### Requirement: Desktop restores appearance before frontend mount
The Desktop shell SHALL make the validated configured appearance available to the WebUI before frontend modules execute.

#### Scenario: First render on a new origin
- **WHEN** Desktop opens a WebView at a loopback origin that has no prior localStorage
- **THEN** the initial React theme and font-size state uses the injected configured appearance rather than unrelated defaults

### Requirement: Authenticated restore is canonical
The WebUI SHALL request the complete appearance preference set after daemon authentication and SHALL apply a valid complete response as the canonical state.

#### Scenario: Browser cache differs from configuration
- **WHEN** valid local browser cache values differ from the complete appearance values returned by the authenticated daemon
- **THEN** the WebUI applies the daemon values and refreshes its local cache

#### Scenario: Older daemon returns no appearance fields
- **WHEN** the UI-preferences response contains only legacy fields
- **THEN** the WebUI retains its current compatible cache/default state instead of replacing it with fabricated appearance values

### Requirement: Every appearance entry point persists live changes
The system SHALL route the TopBar light-dark toggle and all Settings Appearance controls through the same immediate and durable mutation path.

#### Scenario: TopBar switches light-dark mode
- **WHEN** the user clicks the TopBar light-dark button
- **THEN** the interface updates immediately and the complete resulting appearance snapshot is submitted for durable persistence

#### Scenario: Settings changes color theme or font size
- **WHEN** the user selects a color theme or font size in Settings Appearance
- **THEN** the interface updates immediately and the complete resulting appearance snapshot is submitted for durable persistence

### Requirement: Persistence failures do not leave false state
The WebUI SHALL serialize appearance writes, track the most recently confirmed snapshot, and restore that snapshot when the latest persistence attempt fails.

#### Scenario: Latest save fails
- **WHEN** an appearance change is shown optimistically but its canonical save fails
- **THEN** the UI restores the last confirmed appearance and informs the user that the preference was not saved

#### Scenario: User changes appearance rapidly
- **WHEN** multiple appearance changes are requested before earlier saves complete
- **THEN** saves occur in request order and an older response does not overwrite the newest visible selection

### Requirement: UI preferences API remains backward compatible
The authenticated UI-preferences API SHALL return the complete normalized appearance set, SHALL validate supplied appearance fields, and SHALL continue accepting the legacy avatar preference field.

#### Scenario: Complete valid update
- **WHEN** a client submits valid `theme`, `color_theme`, and `font_size` values
- **THEN** the endpoint persists them and returns those normalized values together with `show_acecode_avatar:false`

#### Scenario: Partial legacy update
- **WHEN** an older client submits a boolean `show_acecode_avatar` field without appearance fields
- **THEN** the endpoint succeeds, keeps existing appearance values unchanged, and returns `show_acecode_avatar:false`

#### Scenario: Invalid appearance value
- **WHEN** a client submits an unsupported theme, color theme, or font size
- **THEN** the endpoint rejects the request without mutating or persisting any UI preference
