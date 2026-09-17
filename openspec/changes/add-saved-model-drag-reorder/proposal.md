## Why

Users cannot arrange saved model cards in their preferred order. The existing array order already drives the settings list and model pickers, so dragging should persist that order across reloads.

## What Changes

- Add row dragging, a subtle drag handle, insertion feedback, and keyboard reordering while keeping the current card layout and actions.
- Persist the complete saved-model order through an authenticated daemon endpoint; preserve profile contents, credentials, and the default model.
- Keep filtered-out models during search, cancel unfinished drags, and restore confirmed state if saving fails.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-model-management`: Persistent drag ordering for saved models in settings and the model picker.

## Impact

- `SavedModelList`, `ModelSettingsSection`, frontend API and ordering helpers.
- Model routes and the existing atomic settings mutation pipeline; no new dependency or configuration field.
- Regression tests, translations, and daemon API documentation.
