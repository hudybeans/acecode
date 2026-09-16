## 1. Channel Core

- [x] 1.1 Add channel settings, stable conversation keys, bounded persisted receipts and checked binding storage; test validation, restart and account/group isolation.
- [x] 1.2 Add the session gateway using SessionClient and RC projection helpers, with access policy, no-workspace resume, deduplication and request controls; test with an in-memory session client.

## 2. WhatsApp Transport

- [x] 2.1 Add a pinned lightweight Baileys stdio bridge for QR, reconnect, text, images, documents and quotes; test frame parsing and protocol behavior without an account.
- [x] 2.2 Add a bounded C++ bridge supervisor using the existing process helper; test request timeouts, malformed output, process failure and shutdown.

## 3. Hosting And Terminal

- [x] 3.1 Add private loopback control, single-account ownership and daemon worker lifecycle integration, including standby takeover; verify ownership and authenticated control locally.
- [x] 3.2 Add TUI /channels management and automatic discovery/start of an existing-style daemon; verify parsing, command output and disabled-by-default behavior.

## 4. Delivery And Verification

- [x] 4.1 Package bridge assets and document installation, pairing, access controls, requests and lifecycle; verify checkout/package lookup and missing-dependency diagnostics.
- [x] 4.2 Build the isolated worktree and run channel, RC and relevant session regression tests; record local verification separately from real-account QR validation.

Local results and outstanding account-based checks are recorded in verification.md.

## 5. Guided Setup Follow-up

- [x] 5.1 Add cancellable dependency preparation, phone normalization, transient pairing leases and atomic setup completion; cover failure, cancellation, expiry and existing access preservation.
- [x] 5.2 Add a responsive step-by-step TUI setup surface and CLI entry with live QR updates, back/cancel/retry and personal self-chat defaults; verify rendered states and command dispatch.
- [x] 5.3 Update setup documentation, rebuild CLI/Desktop and run focused setup plus existing channel/RC regressions; distinguish local UI validation from real-account pairing.

## 6. Standalone Terminal Display

- [x] 6.1 Render only the standalone channel wizard inline after the shell command, with content-sized steps and working QR growth; test primary-screen output and unchanged in-TUI rendering.
- [x] 6.2 Rebuild and verify command/step navigation and preserved terminal history in a real terminal; document the standalone behavior.

## 7. Configuration And Host Lifecycle

- [x] 7.1 Replace daemon-backed setup with a local pairing-only session; stop and release all pairing resources on success, failure and cancellation, preserve saved access, and test no host/session creation.
- [x] 7.2 Remove main-TUI channel commands, surface and callbacks; update standalone wizard copy and CLI diagnostics so they never auto-start a daemon.
- [x] 7.3 Guarantee first-runtime ownership across daemon/Desktop startup, prevent duplicate bridges and test standby takeover and setup contention.
- [x] 7.4 Update lifecycle documentation, rebuild CLI/Desktop, run channel/RC regressions and terminal verification; report real-account verification limits.

## 8. Configuration Without Runtime Interaction

- [x] 8.1 Separate saved configuration from owner-written history, preserve legacy settings and pin runtime configuration at startup; cover stale writes, concurrent edits and standby snapshots.
- [x] 8.2 Reuse saved logins without a bridge or owner checks, isolate new pairing credentials and reduce completion copy to configuration saved; cover existing-owner and cancellation behavior.
- [x] 8.3 Update documentation, rebuild isolated CLI/Desktop binaries and verify configuration with an existing host left untouched.

## 9. Release Integration

- [x] 9.1 Preserve and validate bridge assets in all six npm packages and add fixture coverage to CI.
- [ ] 9.2 Run integrated channel and package checks on the release mainline.
