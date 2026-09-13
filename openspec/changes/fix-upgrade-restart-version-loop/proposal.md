## Why

An installed update can leave the old Desktop-managed daemon alive when background continuation is enabled. The replacement Desktop accepts its protocol without checking its application version or installation, so version display and update checks continue using the old runtime indefinitely.

## What Changes

- Make upgrade restart stop and wait for all managed daemons even when normal application exit keeps them alive.
- Reuse a managed daemon only when its runtime version and executable installation match the launching Desktop; replace verified incompatible managed generations safely.
- Reject staged executables whose reported version differs from the selected release, and verify the installed executable before declaring file installation successful.
- Preserve pending-restart status and prevent repeated installation of the same target by a still-running old daemon.
- Add regression coverage, publish the next stable release, and verify every platform's GitHub assets and aupdate mirror.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `self-upgrade`: Require version-verified installation, a complete managed-runtime restart, and protection against duplicate installation pending restart.

## Impact

Desktop restart/supervision, managed-daemon identity checks, upgrade package/application validation, update job APIs, tests, and upgrade documentation. No new third-party dependencies. Normal background continuation and standalone CLI daemon ownership remain unchanged.
