## Why

The 0.9.19-pre.2 crash dump shows an uncaught JSON encoding exception while preparing PostToolUse hook input. The next release should leave bundled seed hooks disabled by default, including official copies installed by older releases.

## What Changes

- Ship the agent-reporting seed with a source-level `enabled: false` switch and honor that switch when loading Codex-shaped hook files.
- Advance the seed revision and retain the previous official fingerprint so unchanged installed copies migrate to the disabled definition without overwriting user edits.
- Serialize event payloads only when a matching, trusted command hook will actually run.
- Document the disabled default and the existing manual, reviewed opt-in path through the active example configuration.

## Capabilities

### New Capabilities

- `seed-hook-defaults`: Default activation and upgrade behavior of bundled hook sources, including inert dispatch when no command can run.

### Modified Capabilities

None. The active `align-codex-hooks` change owns the broader hook contract; this adds source activation before normalization without changing trust policy for loaded handlers.

## Impact

Seed JSON, manifest and revision; default seed fingerprint registry; hook source parsing and dispatch; focused hook/seeder tests; hook documentation. User-global/project hook trust and enablement remain intact. Full encoding remediation is outside this interim change.
