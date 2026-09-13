## Why

The UTF-8 cwd fix changes the storage key used by older Windows installations, so existing directory model choices can disappear after an upgrade. The new global JSON errors also lack CORS headers and remain unreadable to supported cross-port clients.

## What Changes

- Read Windows legacy directory model settings when the canonical UTF-8 setting is absent; prefer canonical settings and remove legacy settings on explicit removal.
- Apply the existing loopback CORS policy when Crow completes responses, including uncaught route exceptions.
- Add compatibility and HTTP regression coverage and update the API documentation.

## Capabilities

### New Capabilities

- `cwd-override-compatibility`: Preserve older Windows directory model settings across the UTF-8 storage-key correction.
- `route-error-cors`: Make structured route errors readable by supported authenticated loopback clients.

### Modified Capabilities

None.

## Impact

Directory model persistence, the internal Crow application and CORS helper, provider and HTTP tests, and daemon API documentation. No dependencies or frontend changes are required.
