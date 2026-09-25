## Why

UOS/Deepin needs its native DTK window effects and WebKit2GTK 4.0 while ordinary Linux installations must not acquire Qt/DTK dependencies. The existing `linux-old` release jobs are the intended home for this dedicated distribution.

## What Changes

- Add an explicit, default-off `ACECODE_DEEPIN` CMake option and compile definition for Linux builds.
- Use DTK for the Deepin window frame while keeping the existing WebKit2GTK engine, full-height web content, window controls, and close-to-tray behavior.
- Scope the UOS fractional scaling workaround to the dedicated build and preserve runtime Deepin/X11 checks, including XWayland.
- **BREAKING**: Replace `linux-old-*` release archives and job names with `linux-deepin-*`; retain the existing architecture coverage and GLIBC 2.28/WebKitGTK 4.0 compatibility checks.
- Give Deepin its own update identity so it cannot install a generic Linux update.
- Update release validation, tests and installation/build documentation.

## Capabilities

### New Capabilities

- `deepin-desktop-build`: Explicit DTK build boundary and native Deepin window integration.
- `deepin-release-packaging`: Dedicated release artifacts, dependency checks and update identity.

### Modified Capabilities

None. This change supersedes the unarchived scaling change's unconditional Linux compilation boundary while retaining its DPI policy.

## Impact

Desktop host and CMake configuration; Linux release workflow, release verifier and update target selection; focused desktop/release tests and documentation. DTK/Qt are desktop-only optional build dependencies. Existing Windows, macOS and generic Linux builds remain independent of DTK. No release publication or system package replacement is part of this local work.
