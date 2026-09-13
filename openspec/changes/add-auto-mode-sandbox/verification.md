# Verification: add-auto-mode-sandbox

Date: 2026-09-13. Worktree: `.claude/worktrees/auto-sandbox`, branch `worktree-auto-sandbox`.

## Scope and accepted Windows limitation

The implementation retains the unelevated Windows backend and full user-readable Shell paths.
Windows network isolation is out of scope. The user also accepted retaining the deletion/rename
limitation if it is present in Codex's equivalent backend.

Compared the unelevated call path in `spawn_prep.rs`, `token.rs`, and `acl.rs` at OpenAI Codex
commit `dfaf451426868c22e6859f5494150fd6338c3257`. A standalone native Windows probe reproduced
that token/ACL recipe, including its full deny mask, default DACL, logon/Everyone/capability SIDs,
privilege flags, and desktop. It did not run the complete Codex application or its elevated backend.

In an owned private temporary directory, external and protected content writes failed, but
DeleteFileW, MoveFileW, and an actual restricted cmd child could delete or rename protected items.
This limitation is explicitly described in `docs/sandbox.md` and `/sandbox` output.
`SandboxBackendWin.DocumentsUnelevatedDeleteAndRenameLimitation` characterizes it separately;
its passing result is not evidence of deletion isolation.

## Completed checks

- Release build: `cmake --build build --config Release --target acecode_unit_tests acecode --parallel 4`.
  Both `acecode_testable` and the final executable built successfully.
- Focused C++ regression: 465 tests, 464 passed, one expected Windows skip
  (`SystemPromptTest.PosixPromptStaysCleanOfWindowsGuidance`), no failures.
  Covered all sandbox/exec/classifier tests, permission and mode aliases, config/session storage,
  AgentLoop and hooks, command routing, Bash, system prompts, and permission HTTP endpoints.
- Four native Windows sandbox tests passed. The complete AgentLoop test uses a deterministic
  provider with real Git, Bash, restricted tokens and filesystem operations: `git status --short`
  runs without confirmation; external content write is denied; explicit approved escalation
  succeeds; `rm -rf` prompts and a denied request never executes.
- Web: `pnpm install --frozen-lockfile`, `pnpm i18n:catalog`, `pnpm test`, and `pnpm build` succeeded.
  CMake was reconfigured after the Web build so embedded assets use the new output.
- WSL Ubuntu: compiled the actual POSIX backend/probe and argv builder with g++17. Native bwrap
  smoke passed workspace writes, external-write rejection, protected-content rejection, and
  separate network/PID namespaces. Linux syntax checks also covered Bash and its launch-failure test.
- `openspec validate add-auto-mode-sandbox --strict` and `git diff --check` passed.

The focused C++ filter was:

```text
Sandbox*.*:Exec*.*:CommandClassifier.*:Permissions.*:PermissionMode*.*:HeadlessOptions*.*:ModePicker*.*:ConfigSandbox.*:ConfigFirstInitTest.*:DefaultSessionPreferencesConfig.*:SessionStorage.*:SessionManagerResume*.*:AgentLoop*.*:Bash*.*:SystemPrompt*.*:BuiltinCommands.*:SessionRegistry.*:CommandsHandlerTest.*:BuiltinCommandHandler.*:ConfigSchema.*:ConfigMutation.*:HookAgentLoop.*:WebServerHttp.*PermissionMode*:OpencodeCommandTest.*
```

Build and run logs are under the ignored `build/` directory: `sandbox-resume-build.log`,
`sandbox-final-tests.log`, `sandbox-web-tests.log`, `sandbox-linux-smoke.log`, and
`sandbox-linux-syntax.log`. Modified text files were normalized to the repository's LF convention
after compilation; no behavior changed during that normalization.

## Remaining platform coverage

macOS Seatbelt policy/argument generation is covered by portable unit tests. No macOS machine
was used for native execution. Linux smoke exercises the real backend; it is not a full Linux
ACECode build. No running user daemon was replaced, and no release was published.

## Review supplement (2026-09-13, Claude)

- Restored goal-unattended auto-approval for `bash` prompts. The approved sandbox from
  `ExecDecision::sandbox` is still applied, so a dangerous command under an active goal runs
  inside workspace-write instead of blocking the daemon prompter for five minutes. Forbidden
  rules still refuse. New tests: `AgentLoopGoal.UnattendedGoalAutoApprovesDangerousBashInsideSandbox`,
  `AgentLoopGoal.UnattendedGoalCannotOverrideForbiddenExecRule`.
- `/sandbox on` now calls `SandboxRuntime::reset_probe()` so a sticky `mark_unavailable`
  can be recovered without restarting; the recorded reason is the single-line
  `metadata.sandbox_unavailable_reason` rather than the whole tool output.
- Dropped the bare `sandbox` denial needle (compile errors in `src/sandbox/*.cpp` matched it);
  the backend-specific spellings `sandbox-exec`, `sandbox: deny`, `seatbelt`, `bwrap:` remain.
- Added scenario/expectation comments to every new test; merged `master` (7f501a73) into the
  branch; rebuilt `acecode_unit_tests`; the focused set (101 tests, 1 expected Windows skip)
  and Web `pnpm test` (2175 assertions) pass. Full-suite results are recorded below.
- Full `acecode_unit_tests` run after the merge: 4104 passed, 5 environment skips (network
  smokes, real-JSONL replay fixture, POSIX-only prompt case), 1 failure
  `McpManagerAsync.DisableConnectedServerUnregistersToolsAndSnapshots` (5 s startup-settle
  timeout under full-suite load; passes in isolation, unrelated to this change).
