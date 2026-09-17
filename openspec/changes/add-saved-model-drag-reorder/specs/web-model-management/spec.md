## ADDED Requirements

### Requirement: Persistent saved model ordering
The settings saved-model list SHALL allow users to drag a model card before or after another card and persist the resulting order across reloads. Model pickers SHALL use the saved order. Reordering SHALL preserve every profile's content and the selected default model.

#### Scenario: Drag and persist a model
- **WHEN** the user drags a card to a different position and releases it on the list
- **THEN** the list displays insertion feedback and automatically saves the resulting order
- **AND** reopening settings and refreshing model pickers retains that order

#### Scenario: Whole card follows the pointer
- **WHEN** the user drags a card body or its handle past the drag threshold
- **THEN** the complete card follows the pointer at its original size and grab offset, including its provider icon, labels, capability badges, and action controls
- **AND** the source retains a stationary placeholder and the floating card does not intercept input or become a drop target
- **AND** dropping, cancelling, or closing the list removes the floating card

#### Scenario: Reorder filtered results
- **WHEN** the user reorders two models while a search filter is active
- **THEN** the dragged model moves before or after the target in the complete saved list
- **AND** all other models retain their relative order and contents

#### Scenario: Cancel or operate existing controls
- **WHEN** the user presses Escape, loses the pointer or window focus, releases outside the list, or clicks a row action without dragging
- **THEN** no reorder is saved and the default, edit, and delete controls retain their existing behavior

#### Scenario: Keyboard ordering and long lists
- **WHEN** the user focuses the reorder handle and presses an up or down arrow
- **THEN** the model moves one visible position in that direction and saves
- **WHEN** the user drags near the scrollable list viewport edge
- **THEN** the list scrolls so offscreen models can be reached

### Requirement: Atomic order persistence
The daemon SHALL accept only a complete permutation of model names exposed by the saved-model API under authentication and persist it through the existing configuration mutation mechanism. Ordering SHALL be disabled while another model mutation is pending.

#### Scenario: Invalid or stale order
- **WHEN** an order contains duplicates, unknown names, or omits a saved model
- **THEN** the daemon rejects it without changing disk or live configuration
- **AND** the frontend refreshes the authoritative list after a rejected save

#### Scenario: Persistence failure
- **WHEN** saving the order fails
- **THEN** the frontend restores the confirmed order and reports the error
- **AND** the daemon does not publish an unpersisted order

#### Scenario: No movement
- **WHEN** a drag or key press leaves the order unchanged
- **THEN** the frontend sends no reorder request
