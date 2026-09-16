## 1. Encoding
- [x] 1.1 Implement shared strict UTF-8 scanning and reliable incremental codepage decoding with regression tests.
- [x] 1.2 Preserve system-codepage decoding for legacy subprocess output under a UTF-8 console and verify sandbox denial reporting.

## 2. Failure isolation
- [x] 2.1 Make active and legacy hook payloads JSON-safe and contain runner errors with tests.
- [x] 2.2 Add AgentLoop task recovery, terminal error reporting, and subsequent-task regression tests.

## 3. Validation
- [x] 3.1 Document the repair and run focused tests plus strict OpenSpec validation.
- [x] 3.1a Correct Windows test-fixture database teardown so the full regression suite can finish.
- [ ] 3.2 Review and integrate remaining project work, run release checks, and verify final package behavior.
