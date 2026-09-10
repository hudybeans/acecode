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

The stable release must additionally verify the GitHub-built package, all six updater targets, and every downloadable release asset in aupdate before release completion.
