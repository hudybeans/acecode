## Purpose

Let users choose between the changes recorded in a conversation turn and the current content of the same file directly from the modified-files list, with clear and independently operable actions.

## ADDED Requirements

### Requirement: Distinct change and file actions

Each modified-file item SHALL keep its original row appearance and right-side “打开” label. The row SHALL open file content, while a separate “查看变更” action SHALL open the recorded turn changes, in both historical and latest completed turns.

#### Scenario: Open turn changes

- **WHEN** the user activates “查看变更”
- **THEN** the preview shows the selected file's changes scoped to that item's turn
- **AND** the file-content action is not invoked

#### Scenario: Open current file

- **WHEN** the user activates any other part of the row, including the filename, counts, blank area or “打开”
- **THEN** the existing file preview opens that file's current content using the session workspace, without activating the change action
- **AND** existing file-preview errors apply if the file cannot be read

### Requirement: Accessible actions preserve list presentation

The list SHALL preserve paths, addition/deletion counts at rest and expand/collapse behavior. Row hover SHALL replace the per-file counts beside the filename with muted “查看变更” and an up-right arrow. Only hovering that action SHALL underline its label. Both actions SHALL remain independently keyboard accessible and usable at narrow widths in Chinese and English.

#### Scenario: Hover distinction

- **WHEN** the pointer enters a file row
- **THEN** “查看变更” appears beside its filename while the right-side “打开” remains unchanged
- **AND** “查看变更” becomes underlined only when the pointer is over that action

#### Scenario: Keyboard and localization

- **WHEN** the user navigates to either action using Tab and activates it with Enter or Space
- **THEN** only that action runs and focus is visibly indicated
- **AND** keyboard focus reveals the change action; touch devices without hover expose it directly
- **AND** English visible labels read “View changes” and “Open” when English is selected

#### Scenario: Long paths and collapsed list

- **WHEN** long paths are displayed in a narrow list with more than three files
- **THEN** paths can truncate while the hover action and “打开” remain usable, and expanding the list exposes the same behavior on remaining files
