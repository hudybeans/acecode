## 1. Configuration

- [ ] 1.1 Add `int max_options = 6` to `AskConfig` in `src/config/config.hpp`, with a comment mirroring `max_questions`.
- [ ] 1.2 Parse `ask.max_options` in `src/config/config.cpp` load path: integer-only, clamp to [4,8] with a warning on out-of-range values.
- [ ] 1.3 Add `max_options` to config validation (out-of-range check) and to the config JSON dump so the value persists and round-trips.

## 2. Tool layer

- [ ] 2.1 In `src/tool/ask_user_question_tool.hpp/.cpp`, replace the fixed `kMaxOptions=4` with `kDefaultAskMaxOptions=6` plus range constants `kMinAskMaxOptions=4` / `kMaxAskMaxOptions=8`; keep `kMinOptions=2` fixed.
- [ ] 2.2 Thread `max_options` through `validate_ask_user_question_args` and `build_ask_user_question_def`; clamp at the tool boundary; derive the error message ("between 2 and N") and the schema `maxItems` from the effective value.
- [ ] 2.3 Keep the overloads used by independent callers working with defaults (6).

## 3. Registration sites

- [ ] 3.1 Pass `cfg.ask.max_options` at `src/main.cpp` (TUI), `src/headless/headless_runner.cpp`, and `src/daemon/worker.cpp`.

## 4. Tests

- [ ] 4.1 `tests/config/config_ask_test.cpp`: default 6; parse of 4/8; clamp of 3→4 and 10→8 with warning.
- [ ] 4.2 `tests/tool/ask_user_question_tool_test.cpp`: dynamic acceptance/rejection at the configured bound; 8 accepts / 9 rejects; rejection message names the current limit; schema `maxItems` follows configuration; lower bound 2 still enforced.

## 5. Documentation

- [ ] 5.1 `docs/help/configuration.html`: add an "AskUserQuestion 跨端配置" section documenting `ask.max_questions` and `ask.max_options` (defaults, ranges, notes).

## 6. Verification

- [ ] 6.1 Build the C++ targets and run the focused config and tool test suites; fix any failures.
- [ ] 6.2 Write `verification.md` with the exact commands and results; run `git diff --check`.
