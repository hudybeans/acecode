## Why

A saved ACEModel profile can contain valid reasoning options discovered from the upstream `/models` response. Startup currently replaces its capability tags with the smaller built-in catalog list, then rejects the still-valid reasoning options. The last-good snapshot goes through the same path, so ACECode cannot start.

## What Changes

- Keep an explicit saved reasoning declaration in catalog-sourced ACEModel profiles when refreshing built-in capability tags at load time.
- Continue rejecting malformed reasoning settings and unrelated invalid saved-model profiles.
- Cover startup and last-good loading with regression tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `model-selection`: Loading an ACEModel saved profile with discovered reasoning metadata must preserve a coherent, selectable profile.

## Impact

`src/config/saved_models.cpp`, its tests, and config recovery tests. No API or file format changes.
