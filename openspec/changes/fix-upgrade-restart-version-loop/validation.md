## Implementation verification

- Native MinSizeRel build: acecode, acecode-desktop, acecode_unit_tests, and the opt-in acecode_upgrade_restart_smoke target succeeded.
- 136 focused tests passed, covering daemon pool/restart, executable version probes, updater application and rollback, default seed migration, and HTTP update jobs.
- The release preflight ran its additional 59 Upgrade/ConfigUpgrade tests successfully with executable version 0.9.14.
- Web pnpm test and pnpm build passed. OpenSpec strict validation passed.
- A temporary packaged installation replaced a real 0.9.13 managed daemon with 0.9.14. The process ID changed; the old process exited. A normal shutdown preserved the new process, a subsequent activation reused it, and UpgradeRestart stopped it even with continuation enabled.
- The extracted Windows package reported 0.9.14 without creating user configuration during --version. All 96 packaged seed files matched the source bundle.
- With an isolated user profile initialized by the real 0.9.13 package, startup migrated seed marker 2026-08-30.1 to 2026-09-09.1, updated the official Desktop skill, installed the absent managed hook, and preserved a modified user skill.
- With the current marker already present, startup repaired a recognized previous official hook and reinstalled an absent managed hook directory. A partially edited resource remains subject to the existing user-content preservation policy.

## Release scope

Includes the reconciled master implementation and its archived-session/settings improvements and branding concept assets. The unfinished WhatsApp Channels implementation remains in its independent worktree for a separate release.

## Published release verification

- Published stable tag v0.9.14 from bda73b54bfd626e91bee6ac06044e2df9d39c68b. GitHub Actions run 34508471448 completed all ten native build/package jobs and the release job successfully.
- The official Windows x64 updater is 16,864,454 bytes, SHA256 05be854f82a415ed13bf2d21cd9a046efaa9ef67301ac01ed26bbfff9d6447ff. The GitHub archive, aupdate versioned file, alias and public downloads match.
- Repeated the seed migration and managed-daemon replacement tests using that exact GitHub-built archive. All passed. Its 96 seed files exactly match a fresh Windows checkout of v0.9.14 with the repository's Git attributes; the long-lived local checkout had line-ending differences, not content changes.
- Exercised real in-place self-update from the previously published 0.9.13 archive to the official 0.9.14 archive. The new updater also successfully reinstalled the same real package in force mode, including staged/installed executable checks. A manifest claiming 0.9.15 while serving the valid 0.9.14 archive was rejected without changing the installed executable.
- ACECode Release completed its six-platform updater gate: Windows x64/ARM64, macOS x64/ARM64, and Linux x64/ARM64 updater-v1. Manifest latest is 0.9.14. Versioned files and aliases passed public MIME, byte-count and SHA256 verification.
- Mirrored all 35 GitHub assets (759,893,465 bytes), including PKGs, regular/older-Linux archives, all debugging symbols and SHA256SUMS. All 50 versioned/alias download paths passed public content verification. Added explicit IIS MIME mappings for the public .pdb and .debug files while preserving the existing server configuration.
- Agent Browser remains integrated in Desktop; the updater packages contain no legacy ace-browser-host/bridge or extension payload.

The separate npm publishing job failed with E404 on PUT for @aceagent/darwin-arm64@0.9.14. This machine has no npm login (ENEEDAUTH), so registry publication requires a valid authorized credential. GitHub installation packages and the complete aupdate mirror are available; the release notes explicitly distinguish this npm limitation.
