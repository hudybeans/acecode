## Why

The 0.9.19-pre.2 dump shows a PostToolUse hook serializing invalid UTF-8 and throwing json.type_error.316 out of the AgentLoop worker. The current validator accepts overlong encodings, surrogate encodings, and code points above U+10FFFF. GBK output can therefore bypass conversion and terminate the daemon.

## What Changes

- Share strict Unicode validation across complete and incremental text decoding.
- Preserve split UTF-8 and Windows codepage characters and guarantee JSON-safe decoded output.
- Serialize hook payloads with invalid-byte replacement and isolate failed hook runners, including the legacy asynchronous worker.
- Contain unexpected AgentLoop task exceptions, report an error, clear active state, and allow subsequent tasks.
- Keep the separately implemented default-disabled managed seed hooks.

## Capabilities

### New Capabilities
- `runtime-text-failure-isolation`: Unicode-safe process output and recoverable hook/worker errors.

### Modified Capabilities

## Impact

Encoding utilities, hook dispatch, AgentLoop task boundaries, focused regression tests, and hook documentation. No API shape changes or new dependencies.
