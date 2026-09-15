## Why

Users need to choose reasoning depth beside the model control without changing the existing composer layout. Model names and generic reasoning tags do not establish which controls an ACEModel endpoint accepts, and the current OpenAI-compatible request path does not forward saved effort settings.

## What Changes

- Consume an optional per-model `reasoning` declaration from ACEModel model discovery, including `supported_efforts` and an optional `default_effort`. Missing or empty declarations leave reasoning unchecked and hide the composer control.
- Keep custom models opted out until the user enables the reasoning capability; allow editing the supported effort list using a low/medium/high starting template.
- Add a compact, accessible reasoning-depth selector between the existing model and send controls, using the current menu appearance.
- Persist reasoning effort per session, keep model profile defaults separate, validate selections against the current model, and disallow changes while the session is busy.
- Forward explicit reasoning effort through OpenAI-compatible requests while preserving existing provider-specific handling and opt-out behavior.
- Document the API contract and verify discovery, persistence, request bodies, settings, and composer behavior.

## Capabilities

### New Capabilities

- `composer-reasoning-depth`: Explicit model reasoning capabilities, per-session effort selection, minimal composer control, and actual request propagation.

### Modified Capabilities

None.

## Impact

- Model discovery, saved model configuration, provider request construction, session model binding and metadata, daemon API routes, and React model settings/composer state.
- `docs/daemon-api.md` gains the discovery and session override contracts.
- No new dependency, no changes to model credentials, and no changes to the ACEModel service itself; the new optional response contract remains backward compatible.
