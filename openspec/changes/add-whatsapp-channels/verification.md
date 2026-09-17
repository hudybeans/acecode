# Verification

Date: 2026-09-06. Host: Windows x64, MSVC 19.39, Release configuration.
Worktree: N:/Users/shao/acecode.worktrees/whatsapp-channels.
Branch: codex/whatsapp-channels, based on cce1d7c314986192a70f778337b46b122dd93dda.

Results below are chronological; later follow-ups supersede earlier lifecycle behavior.

## Passed

- `cmake --build build --config Release --target acecode acecode-desktop acecode_unit_tests --parallel 6`.
- C++ regression filter covering channels, RC, permissions, questions, session registry, local session client, LSP process/client, daemon and attachments: 407 tests across 72 suites, zero failures. Report: build/channels-regression.xml.
- `npm test --prefix assets/channels/whatsapp`: 6 tests, zero failures.
- Real SessionRegistry integration with a deterministic provider: create a no-workspace session, execute and quote the response, destroy the registry entry, resume the persisted binding and execute again. The host's dangerous/Yolo settings are not inherited on creation or restore.
- Real Baileys module startup and disconnected stdio status, without connecting an account.
- Real CLI automatic-host smoke with an isolated USERPROFILE under build/channels-smoke: `channels on` starts a daemon and returns the expected missing-dependency diagnostic; status, off and daemon status/stop with explicit run-dir work. The test daemon was stopped.
- Bridge package staging with component whatsapp_channel: exactly four assets, SHA-256 identical between source, build output and install staging. No node_modules or credentials packaged.
- `pnpm install --frozen-lockfile` and `pnpm build` in web; regenerated embedded frontend and built Desktop.
- Bash syntax check for scripts/macos_create_update_zip.sh.
- `openspec validate add-whatsapp-channels --strict` and `git diff --check`.

## Guided Setup Follow-up

- Rebuilt `acecode`, `acecode-desktop` and `acecode_unit_tests` with the native guided setup surface.
- Regression filter above: 429 tests across 74 suites, 428 passed and one opt-in installation test skipped. No failures. Report: build/channels-wizard-regression.xml.
- Independently ran `ChannelSetup.RealDependencyInstallationIsOptionalAndUsesTemporaryState` with `ACECODE_TEST_CHANNEL_INSTALL=1`: passed. Installed the actual pinned npm dependencies in a temporary directory, verified a second run reuses them, and confirmed no account credentials or enabled state were created.
- Six TUI view tests cover keyboard navigation, contact validation, retry, asynchronous cancellation, QR contrast in light/dark themes, standard/narrow terminal layout, and Chinese labels. Setup/command/state/runtime tests cover transient leases, expiry, verified-account completion, atomic access preservation and no chat-history submission.
- Actual Windows ConPTY smoke with `acecode channels`: the Chinese personal-account selection and preparation/review pages rendered at 80x24, Enter continued, Escape exited with code 0. This smoke did not start pairing or submit a model request.
- Re-ran all six bridge protocol tests. Staged component whatsapp_channel into build/channels-wizard-stage; all four SHA-256 hashes match the source assets.
- Stopped only the earlier test daemon through its explicit channels/whatsapp/run directory after the user closed the test application. Did not stop the main-workspace Debug process.
- Strict OpenSpec validation and `git diff --check` passed.

## Standalone Terminal Display Follow-up

- Rebuilt `acecode` and `acecode_unit_tests` in Release after changing only the standalone setup display. The main TUI `/channels` surface keeps its existing rendering path.
- `ChannelSetupViewTest.*:ChannelCommand.*`: 14 tests passed, including content-sized steps, QR growth after a shorter step, and captured terminal output without alternate-screen, clear-screen, clear-scrollback or home-cursor sequences.
- `*Channel*`: 136 tests across 25 suites, 135 passed and one opt-in installation test skipped. No failures. Report: build/channels-inline-regression.xml.
- Actual Windows ConPTY smoke inside an interactive PowerShell at 80x24: printed `CHANNEL_INLINE_HISTORY_SENTINEL`, invoked `acecode channels`, advanced to review with Enter, and exited with Escape. The wizard started below the existing command, grew from 12 to 16 rows, and redrew from its original start row without erasing earlier output. The shell prompt returned below it and printed `CHANNEL_INLINE_RETURNED_TO_SHELL`; the test shell exited with code 0. Pairing and dependency installation were not started.
- After the user closed the test window, stopped only the worktree's channel daemon via its explicit run-dir and the verified residual standalone command before replacing the executable. The main checkout's Debug process was left running.
- Strict OpenSpec validation and `git diff --check` passed.

## Configuration And Host Lifecycle Follow-up

- Replaced owner RPC setup with a local setup session holding the account lock. The temporary bridge receives `--setup-only`, suppresses message ingress, rejects message/file sends and downloads, flushes credentials before saving, and stops before completion is reported. Configuration no longer creates a daemon, control listener or agent session.
- Removed main-TUI `/channels` registration, root surface and callbacks. The remaining `main.cpp` changes only dispatch the standalone CLI command and list it in top-level help. Runtime commands cannot start a missing host; offline status distinguishes saved configuration from a running owner.
- Focused setup/view/command/runtime/bridge suite: 43 tests, 42 passed and one opt-in npm installation test skipped. Report: build/channels-lifecycle-focused.xml. This includes actual fake-bridge child PID exit before completion, failure/cancellation cleanup, account verification, retained access, busy-owner preservation, first-start ownership and standby takeover.
- Channel, RC, permission, question, daemon, session-registry, local-session-client, LSP and attachment regression: 519 tests across 91 suites, 518 passed, one opt-in installation test skipped, zero failures. Report: build/channels-lifecycle-regression.xml.
- Six Node protocol tests passed. The actual Baileys bridge was smoke-tested in configuration mode without connecting an account; send, file send and download were rejected. `node --check assets/channels/whatsapp/bridge.mjs` passed.
- Built `acecode_unit_tests` normally and compiled the main executable sources. The old user-test daemon (PID 9488 with proxy child 10632) still held the Release executable, so it was not stopped without approval. Linked fresh `acecode` and `acecode-desktop` into build/lifecycle-preview with `/p:BuildProjectReferences=false /p:OutDir=N:/Users/shao/acecode.worktrees/whatsapp-channels/build/lifecycle-preview/`, using the already rebuilt dependencies. The Release executable remains the older build.
- Staged WhatsApp assets, models.dev registry, seed resources and winpty-agent beside the preview executables. All four bridge assets and three registry files match source SHA-256; seed verification passed for 96 files. The preview binary's registry validation resolved its own staged registry (207 providers, 7483 models).
- Actual 80x24 Windows ConPTY smoke used a temporary USERPROFILE and deliberately missing Node.js. The content-sized Chinese wizard preserved shell history, showed the new review labels, failed dependency preparation without creating a daemon or saved channel state, and returned below the wizard on Escape. Offline `channels status` succeeded; `channels on` reported that daemon/Desktop must be started. No owner descriptor or channel run directory was created, and the test shell exited.
- Cross-process smoke using two actual preview daemons and a temporary disabled configuration passed: the first daemon kept ownership while both were alive, the second took over only after the first exited, and both test daemons were stopped. Windows force-stop may retain a descriptor for the dead owner; offline status correctly ignored it. No WhatsApp account was paired. Reproduction script: build/verify_channel_host_lifecycle.ps1.
- Strict OpenSpec validation and `git diff --check` passed. No commit, merge, push or replacement of the user's running Release executable was performed.

## Configuration Without Runtime Interaction Follow-up

- Separated atomic configuration writes in `config.json` from owner-written history in `state.json`. Legacy settings are read without migration until a configuration file is saved. Tests verify old-binary state rewrites, concurrent configuration edits, explicit live-control edits, and history refresh cannot overwrite a pending configuration or implicitly update an existing runtime.
- Runtime startup captures configuration once. Disabled instances claim no connection ownership. Enabled standby instances retain their startup settings on takeover while refreshing bindings/receipts. The first enabled host still owns the only service bridge.
- Setup no longer reads owner descriptors, acquires `owner.lock`, sends host RPCs or emits a busy/close/restart prompt. A saved linked account is reused without Node, npm or a bridge. First-time pairing uses a unique profile and only selects it after completion. Failure/cancellation delete only that setup's unselected profile. Tests cover legacy and profile logins, device-JID normalization, occupied-owner configuration, untouched existing credentials and profile-scoped media validation.
- Wizard review uses `Save configuration`; completion only displays the account and `Configuration saved.` Inline rendering and the absence of main-TUI `/channels` remain covered.
- `*Channel*`: 146 tests across 25 suites, 145 passed and one opt-in dependency installation test skipped. Report: build/channels-config-only-focused.xml. After adding three profile-specific cases, the focused eight-suite rerun passed 67 of 68 tests with the same opt-in skip: build/channels-config-only-final.xml.
- Remaining RC, question, permission, session, daemon, LSP and attachment regressions excluding the already-run channel tests: 378 tests across 70 suites, all passed. Report: build/channels-config-only-regression.xml. Across the three reports, 527 distinct C++ cases were exercised: 526 passed, one optional installation case skipped, no failures. Six Node protocol tests also passed.
- Built both executables into build/config-only-preview using the already rebuilt dependencies and `/p:BuildProjectReferences=false /p:OutDir=N:/Users/shao/acecode.worktrees/whatsapp-channels/build/config-only-preview/`. No running user application was stopped or inspected. Previous preview/Release binaries were not replaced.
- Staged four bridge assets, three registry files, the 96-file seed bundle and winpty-agent beside the new executables. Source/staged SHA-256 values match; seed verification and packaged registry resolution passed (207 providers, 7483 models).
- Actual Windows ConPTY smoke used an isolated USERPROFILE, synthetic saved login and PATH without Node.js. A real test daemon stayed running while the wizard selected an extra contact and saved successfully. Auth/history hashes and live access remained unchanged; the terminal completion contained no host-management instruction. A subsequently started daemon read the new settings, waited for the first test host to exit, then acquired ownership with the added contact. Both test daemons and the temporary profile were cleaned up. Reproduction: build/verify_channel_config_only.ps1. No real WhatsApp connection or user account data was involved.
- Strict OpenSpec validation and whitespace checks passed. No commit, merge, push, release or modification of the main checkout was performed.

## Mainline Release Integration (2026-09-17)

- Reviewed the preserved worktree changes, committed them as `cc5956e4`, pushed `codex/whatsapp-channels`, and merged them into master. Both session reasoning settings and isolated channel permission behavior were retained during conflict resolution.
- Added the bridge's four-file allowlist to every platform's npm package assembly, validated both macOS app and CLI resource copies, and added three passing package fixture tests. Re-ran all six Node protocol tests and the real pinned Baileys bridge in configuration-only mode without pairing an account; message/file sends and downloads were rejected as expected.
- Built the mainline CLI, desktop, and test targets on Windows. Full release workflow [35140320614](https://github.com/tmoonlight/acecode/actions/runs/35140320614) succeeded for all ten Windows, macOS, and Linux build targets.
- Published [v0.9.20](https://github.com/tmoonlight/acecode/releases/tag/v0.9.20) from `3256b8241b492a9c6740a5deaecb1f10e5bc1009` and mirrored all six updater packages. Every versioned package and stable alias passed public download size/SHA-256 verification. Separate archive inspection confirmed the intended bridge files and disabled seed hook in all six packages, including both macOS resource layouts.
- The final Windows x64 package reports the correct version and `WhatsApp: disabled` under a clean isolated profile. npm package fixture validation does not imply npm publication; that workflow job remains disabled.

## Not Validated

- No real WhatsApp account was paired. QR scanning, real personal/self-chat/group delivery, native quoting, media transfer and approvals require the operator's account-based acceptance checks in docs/channels.md.
- Interactive desktop behavior on Linux and macOS was not exercised; native CI builds and released archive contents were verified in the mainline release follow-up.
- The release was not installed over the user's running application during verification.
