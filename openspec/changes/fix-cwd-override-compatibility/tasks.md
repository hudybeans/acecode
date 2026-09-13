## 1. Compatibility fixes

- [x] 1.1 Implement Windows legacy cwd override fallback and removal semantics; verify provider tests cover existing choices, separator variants, canonical priority, malformed files and removal.
- [x] 1.2 Apply the existing CORS policy at response completion; verify HTTP tests cover global errors with Origin and Token, unsupported origins and duplicate-header prevention.

## 2. Verification and integration

- [x] 2.1 Update daemon API and implementation documentation; run strict OpenSpec validation and git diff --check.
- [x] 2.2 Build the C++ targets and run the provider and complete HTTP regression suites; inspect any failures before proceeding. Both targets built; all 250 selected tests passed, including 216 HTTP tests and 12 cwd override tests.
- [x] 2.3 Commit the scoped change and merge it into local master; verify ancestry and preserve all unrelated working-copy changes. Master fast-forwarded to 989b366d; 177 unrelated local files retained identical bytes and 6 overlapping files matched the reviewed merge preview.

## Validation

- Windows CP936: `cmake --build build --config Release --target acecode_unit_tests acecode --parallel 2` passed.
- `acecode_unit_tests.exe --gtest_filter=CwdModelOverrideTest.*:LegacyCwdModelOverrideTest.*:WebServerHttp.*:*AuthTest.*:*Origin*.*`: 250 tests passed.
- `openspec validate fix-cwd-override-compatibility --strict` and `git diff --check` passed.
- Integration used a scoped temporary stash for the 6 overlapping files; it was dropped only after verifying the restored local changes. No unrelated local edits were committed.
