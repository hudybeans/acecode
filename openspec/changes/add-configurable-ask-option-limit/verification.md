## Verification

### Build

Fresh Linux x64 build (vcpkg manifest mode, triplet x64-linux, tests feature):

```
cmake -S . -B build/linux-x64-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake \
  -DVCPKG_TARGET_TRIPLET=x64-linux \
  -DVCPKG_OVERLAY_PORTS=ports \
  -DVCPKG_MANIFEST_FEATURES=tests \
  -DBUILD_TESTING=ON
cmake --build build/linux-x64-release --target acecode_unit_tests -j$(nproc)
```

Result: configure OK, `acecode_unit_tests` linked successfully. Two environment hurdles had to be cleared first (both independent of this change): the repo's ftxui overlay port builds from the `external/ftxui` git submodule (`git submodule update --init --recursive`), and the pinned vcpkg baseline commit must be fetched into a shallow vcpkg clone.

### Focused test results

`./tests/acecode_unit_tests --gtest_filter='Config*:*Ask*:*ask*:Headless*:-AgentLoopGoal.*:GoalCommand.*'`

```
[==========] 448 tests from 97 test suites ran. (10018 ms total)
[  PASSED  ] 447 tests.
[  SKIPPED ] HeadlessJsonlProcess.RequiresWindowsPipeHarness (Windows-only)
```

All ConfigAsk* and AskUserQuestion* tests pass, including the new ones:

- `ConfigAskDefaults.StructAndAppConfigUseDefaults` — max_questions=10, max_options=6
- `ConfigAskLoader.AcceptsSupportedBoundaryValues` — max_options 4/6/8
- `ConfigAskLoader.ClampsValuesOutsideSupportedRange` — max_options 3→4, 9/100→8
- `ConfigAskLoader.InvalidTypesAndSectionKeepDefault` — non-integer max_options ignored
- `ConfigAskSave.NonDefaultValueIsPersistedAndRoundTrips` — max_options=8 persists and reloads
- `ConfigAskValidation.RejectsManuallyConstructedOutOfRangeValues` — max_options=9 rejected by validate_config
- `AskUserQuestionValidateTest.DefaultOptionLimitIsSix` — 6 accepted, 7 rejected with "between 2 and 6"
- `AskUserQuestionValidateTest.CustomOptionLimitIsApplied` — 8 accepted, 9 rejected with "between 2 and 8"
- `AskUserQuestionValidateTest.OptionLimitIsDefensivelyClamped` — 9→8, 3→4
- `AskUserQuestionValidateTest.OptionFloorStaysAtTwo` — 2 accepted, 1 rejected
- `AskUserQuestionSchemaTest.SchemaFollowsConfiguredOptionLimit` — schema maxItems/description follow config (6 default, 8 custom, 9 clamped to 8)
- `AskUserQuestionExecutionTest.ConfiguredOptionLimitRejectsBeforeOpeningChannel` — over-limit rejected before the ask channel opens
- `AskUserQuestionValidateTest.OptionsLengthOutOfRangeRejected` — updated to the new default (7 rejected)

### Pre-existing environment issue (not caused by this change)

The full unit-test binary crashes in teardown of project-state harnesses (`AgentLoopGoal.*`, `AgentLoopTurnSteering.*`, `GoalCommand.*`) with `std::filesystem::filesystem_error: cannot remove: Directory not empty [/home/user/.acecode/projects/<hash>]`. The SessionManager's background writer can recreate files while the harness destructor runs `remove_all`. Evidence this predates the change: `~/.acecode/projects` contains leftover session artifacts timestamped 2026-09-14 17:56 (the day before this change), produced by the same teardown failure. These suites were excluded from the focused run above; they are unrelated to AskUserQuestion configuration.

### Other checks

- `git diff --check`: clean (no whitespace errors).
- No remaining references to the removed `kMaxOptions` constant or hardcoded "2-4" strings outside the historical ADR text.
