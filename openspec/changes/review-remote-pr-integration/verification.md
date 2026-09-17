# Remote PR integration review, 2026-09-17

Reviewed PRs #51, #52, #57, #58 and #59 against master `a92e471e`. All five original PR heads passed both Linux Web and C++ CI. Their commit histories were retained in local merge commits.

## Repairs

- #51: TUI registration omitted `ask.max_options`; it now matches daemon and headless behavior.
- #52: A long question inside the non-shrinking composer dock clipped the footer. The pending-question dock can now shrink and scroll its options. Documentation now matches the PR's final default-expanded result behavior.
- #58: Startup errors could be hidden by a stale port file. Only success and the daemon's explicit already-running code are accepted. Fixed the batch wrapper's `py` fallback and native executable discovery on non-Windows hosts.
- #59: Failed resume state now prevents live monitoring and submission. Disk history remains visible during live promotion. Recovery blocks the composer instead of hiding the whole transcript.
- Reconciled the conflicting root domain documents under `docs/ask-user-question-context.md`; removed whitespace errors in the HTML prototype.

## Validation

- `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`: passed. Repeated Web tests/build against an exported Git index snapshot with its own dependencies, excluding all unrelated concurrent working-tree edits.
- Production bundle regex check: 4,447 literals scanned; no unsupported lookbehind.
- `sessionTranscriptRecovery.test.js`: production hook exercised with deferred HTTP; verifies history retention, failed resume without a live subscription, session identity changes and stale completion rejection.
- `python -B tests/scripts/dev_web_test.py`: five tests passed, including the actual Windows batch fallback. `python -B scripts/dev_web.py --help` passed.
- `cmake --build build --target acecode_unit_tests --config Release --parallel 4`: passed. Focused `ConfigAsk*:AskUserQuestion*:AgentLoopAskUserQuestionParallel.*:AgentLoopQuestionInterjection.*`: 64 tests passed.
- Production TUI compilation: `MSBuild build/acecode.vcxproj /t:ClCompile /p:Configuration=Release /p:Platform=x64 /m:4 /nr:false` passed.
- Chromium fixture, 8 long options: at 390x520 the old dock placed the footer bottom at 1000px; the repaired dock places it at 511px and scrolls 843px of options within 354px. Header/footer visibility also passed at 980x700. The fixture intercepted API requests and did not send real session answers.
- Independent FTXUI prototype compiled and linked with MSVC. Built the vendored FTXUI source in a temporary directory using `CMAKE_POLICY_DEFAULT_CMP0091=NEW` and a static MSVC runtime. Disabled user-wide vcpkg auto-linking for that isolated build with `/p:VcpkgEnabled=false`; the earlier conflicting runtime libraries were a local build integration issue.
- `openspec validate add-configurable-ask-option-limit --strict`, `openspec validate review-remote-pr-integration --strict`, and whitespace checks passed.

No live-provider conversation, packaged desktop rebuild, or native desktop visual verification was performed. The local C++ build included unrelated concurrent source edits; the focused review-owned configuration/question paths passed. Web validation also passed independently without those concurrent edits.

## Publication

- Repair commit: `9a30a2b78d3e945549dc7b95c0d6adfc8fd67a00`.
- GitHub confirmed PRs #51, #52, #57, #58 and #59 merged on 2026-09-17; no open PRs remained.
- Local `master`, `origin/master`, and `git ls-remote origin refs/heads/master` matched; divergence was `0 0`.
- SHA-256 checks confirmed 16 unrelated modified/untracked files remained unchanged through commit and push.
- Post-merge CI: https://github.com/tmoonlight/acecode/actions/runs/35175527345 (running when this publication record was written).
