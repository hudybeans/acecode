# Verification

Date: 2026-09-17 (UTC+8). Release: [v0.9.20](https://github.com/tmoonlight/acecode/releases/tag/v0.9.20).
Released source: `3256b8241b492a9c6740a5deaecb1f10e5bc1009`.

## Dump evidence and repair

- The supplied `acecode.exe.72992.dmp` belongs to 0.9.19-pre.2. The matching executable identifies the path from `AgentLoop::worker_main` through the PostToolUse lifecycle and `HookManager::dispatch_codex` to strict JSON serialization and process termination.
- The recovered exception is `[json.exception.type_error.316] invalid UTF-8 byte at index 58: 0xC0`. The available local PDB had a different age and was not forced onto the dump. The original tool-output heap is absent, so its exact text cannot be recovered.
- A GBK byte sequence beginning with C0 reproduces the serializer failure. Strict scalar validation, incremental legacy-codepage decoding, JSON-safe hook payloads, lazy dispatch, runner isolation, and recovery at the worker task boundary address the failure chain.
- Seed revision `2026-09-17.1` disables the managed agent-reporting hook by default. Official definitions upgrade, missing files in empty owned directories repair, and modified or newer user state remains preserved. Installation reconciliation runs on the next application startup.

## Code and tests

- Reviewed and integrated the outstanding side-chat, sidebar font scaling, inline file/skill composition, security-center, and WhatsApp channel work. Preserved historical duplicate worktree edits instead of applying them twice.
- Built the CLI, desktop shell, and C++ test executable on Windows in MinSizeRel; the CLI reports `acecode v0.9.20`.
- The final focused Windows regression passed 224 tests across 27 suites, covering encoding, hooks, seed upgrades, worker recovery, goal cancellation, compact suggestions, sandbox denial classification, security endpoints, and updater behavior.
- Full Windows aggregate runs exposed fixture teardown, codepage selection, seed-revision assertions, and goal-test synchronization issues, which were corrected. A compact-suggestion timing failure passed three isolated repetitions and the final focused regression. The aggregate run is not reported as an all-pass result.
- Frontend `pnpm test` and `pnpm build`, six bridge protocol tests, three npm packaging fixture tests, and the package/development helper tests passed. The actual pinned Baileys bridge started in an isolated configuration-only profile and rejected message/file operations without pairing an account.
- Final-source [CI run 35140269855](https://github.com/tmoonlight/acecode/actions/runs/35140269855) passed both frontend and complete Linux C++ build/test jobs. CTest reported zero failures out of 4,541 non-disabled cases in 208.95 seconds; 11 platform/opt-in cases were skipped and one additional case was disabled.

## Released artifacts

- [Full release workflow 35140320614](https://github.com/tmoonlight/acecode/actions/runs/35140320614) succeeded for all ten native build targets, including both Windows architectures, both notarized macOS architectures, and six Linux variants. Release assets include matching debug symbols. npm publication remains disabled by the existing workflow.
- Mirrored all six self-updater packages and their stable aliases to aupdate. The release helper downloaded every public package body and verified size, SHA-256, ZIP MIME type, manifest mappings, and Unix executable modes.
- Independently inspected all six final mirrored ZIPs: seed revision and managed-hook fingerprint match the release source, `enabled` is false, legacy browser resources are absent, and each expected WhatsApp bundle contains only the four intended bridge files. Both macOS CLI and app resource copies match.
- Executed the final Windows x64 CI package in isolated profiles for clean installation, old-version missing hook, equal-version missing hook, old official hook, modified user hook, and newer seed marker. All six scenarios passed. Old-version scenarios started from the actual 0.9.19-pre.2 package and its recorded seed ownership; missing-file cases left the owned directory in place. `channels status` reports disabled.

| Target | Bytes | SHA-256 |
| --- | ---: | --- |
| windows-x64 | 17827888 | `ec6ed0b2a0832d108fa9f120d6ed8619081c65b2addf34c9224ad0c411c256f2` |
| windows-arm64 | 17723692 | `de6c67eb8efbfe8200f0053ce36f48e926476dd9a93a9979f7a961c5a8a3f89f` |
| macos-x64 | 39513214 | `6b36d144d9a65e3019bf6fed57593456282608a663045785265220edf371ed0c` |
| macos-arm64 | 39020042 | `830f690df54c19fc7ba3033f18ae894f59e62afe35098b59def47ccb5c9caa8d` |
| linux-x64-updater-v1 | 21336959 | `524c2e586961276686af25c2761e1169c7d642afdc5095e343b605c2bab15cbd` |
| linux-arm64-updater-v1 | 21858257 | `3c609f6ad67378ccc4d4e14d7e28a2fb46b7cec2f1b57ab5615f01ea2e803a7a` |

## Limits

No real WhatsApp account was paired, and no user messages were sent. Cross-platform native builds and package inspection do not constitute interactive desktop acceptance tests. The release was not installed over the user's running application during verification. Ordinary hook/task exceptions are contained; recovery from process-wide resource exhaustion is not guaranteed.
