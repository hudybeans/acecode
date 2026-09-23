## 1. Catalog profile loading

- [x] 1.1 Preserve explicit supported reasoning when refreshing ACEModel catalog capability tags; verify the saved-model parser and validation tests pass.
- [x] 1.2 Add regression cases for declared reasoning, absent reasoning, and unchanged strict behavior for other profiles; verify focused saved-model tests pass.

## 2. Startup recovery

- [x] 2.1 Add a config-load regression using a valid active config and matching last-good snapshot with discovered ACEModel reasoning; verify startup succeeds without a recovery notice.
- [x] 2.2 Run focused C++ tests, strict OpenSpec validation, and `git diff --check`; review the resulting diff for unrelated changes.
