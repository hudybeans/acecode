## MODIFIED Requirements

### Requirement: VS Code-style panel toggle icons
The left sidebar collapse button and right side panel collapse button SHALL use panel-layout vector icons with recognizable primary/secondary sidebar placement, drawn in the shared rounded functional icon family instead of generic arrows. Expanded and collapsed states SHALL remain visually distinct.

#### Scenario: Left collapse icon
- **WHEN** the top-left sidebar collapse button is rendered
- **THEN** it uses a rounded panel-layout vector icon whose left pane identifies the primary sidebar

#### Scenario: Right collapse icon
- **WHEN** the right side panel collapse button is rendered
- **THEN** it uses a rounded panel-layout vector icon whose right pane identifies the secondary sidebar

#### Scenario: A panel is expanded
- **WHEN** a panel changes from collapsed to expanded
- **THEN** the corresponding pane gains a filled indication without changing the icon's overall size or corner style
