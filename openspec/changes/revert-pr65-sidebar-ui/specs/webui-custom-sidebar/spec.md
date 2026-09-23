## ADDED Requirements

### Requirement: Restored compact sidebar presentation

The sidebar SHALL use the presentation from before PR #65, including compact row spacing, content-sized trailing columns, the nested extension list, and the original header, icon, footer, and top-bar alignment.

#### Scenario: Sidebar is visible after rollback
- **WHEN** the user views the sidebar
- **THEN** its layout matches the first-parent baseline of PR #65 rather than the fixed-height rows and fixed 76-pixel trailing columns introduced by that PR
- **AND** unrelated features added after that baseline remain available

### Requirement: Explicit workspace actions

The sidebar SHALL provide the original add-workspace and collapse-all actions, preserve workspace-row expansion independently from workspace activation, and offer activation and expansion actions in the workspace context menu. Onboarding SHALL describe the restored add-workspace entry point.

#### Scenario: User clicks a workspace row
- **WHEN** the user clicks a workspace row or activates that row with Enter or Space
- **THEN** the workspace folder expands or collapses without implicitly activating the workspace

#### Scenario: User manages sidebar workspaces
- **WHEN** the user opens the workspace header actions or a workspace context menu
- **THEN** the original add, collapse-all, activate, and expand or collapse actions are available in their corresponding locations
- **AND** the guided tour points to the available add-workspace button

### Requirement: Four-dot running feedback

Running sidebar sessions SHALL display the original four-dot indicator with a 16-pixel slot and retain visible running feedback under reduced-motion preferences.

#### Scenario: Session is running
- **WHEN** a session is in progress
- **THEN** its sidebar indicator uses four orbiting dots under normal motion preferences
- **AND** reduced-motion preferences replace orbital movement with the existing fade feedback
