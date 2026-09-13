## 1. Managed runtime handoff

- [x] 1.1 Implement version/path-aware managed daemon reuse and cover same installation, old version, alternate path, and unknown identity with focused tests.
- [x] 1.2 Implement explicit upgrade shutdown, wait for owned process termination, block failed relaunch, and cover continuation-enabled restart and normal exits with focused tests.

## 2. Verified installation and update jobs

- [x] 2.1 Add bounded executable version probing, staged/installed checks and rollback; test correct/old versions, nonzero exit, timeout, malformed output, and post-copy failure.
- [x] 2.2 Return the existing pending-restart job on repeated update requests, preserve failure retry, and verify HTTP regression tests and documented API behavior.

## 3. Verification and release

- [x] 3.1 Reconcile usable release content, run relevant native and Web tests/builds, validate the OpenSpec change, and verify packaged upgrade behavior.
- [x] 3.2 Publish the next stable release using ACECode Release, await all platform assets, mirror all downloadable content to aupdate, and verify versioned files, aliases, manifest, public sizes and SHA256 checksums.
