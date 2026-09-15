## 1. Model capabilities and provider requests

- [x] 1.1 Parse, validate, cache and return explicit discovery reasoning metadata, preserving absent/empty opt-out and verifying valid, invalid and removed declarations with unit tests.
- [x] 1.2 Forward enabled OpenAI-compatible effort while preserving provider-specific encodings and opt-out; verify captured request bodies and budget precedence with provider tests.

## 2. Session reasoning state

- [x] 2.1 Add durable per-session effort overrides and effective model state, retaining valid values through profile reload, resume and fork; verify session and storage tests.
- [x] 2.2 Add creation input and idle-only reasoning mutation API with validation, default reset and model-switch clearing; verify API/session isolation and failure tests.

## 3. Model settings and chat composer

- [x] 3.1 Propagate discovery capabilities into model settings and implement explicit custom opt-in with editable effort choices; verify model-settings normalization and mutation tests.
- [x] 3.2 Add the compact reasoning selector to the existing composer and connect home/session state and API calls; verify focused tests plus browser interactions for supported, unsupported, busy and narrow states.

## 4. Integration and delivery

- [x] 4.1 Document model discovery and session API fields and add English translations; verify i18n catalog generation and strict OpenSpec validation.
- [x] 4.2 Run focused C++ tests, full frontend tests/build, scoped browser/API smoke and git diff checks; record results and reconcile all usable master changes.
- [x] 4.3 Prepare v0.9.19 release notes and review the reconciled master source for delivery. Track commit, push, publication and six-target updater verification in the release run so post-publication status does not require changing the tagged source.
