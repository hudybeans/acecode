## Purpose

Make dedicated Deepin release packages identifiable and compatible with older UOS/Deepin installations while preserving the ordinary Linux release family.

## ADDED Requirements

### Requirement: Dedicated release family
Release packaging SHALL replace `linux-old` archives with `acecode-linux-deepin-<arch>.tar.gz`, retain x64/arm64 Desktop and ARMv7 CLI coverage, and explicitly select the dedicated build variant. Desktop packages MUST use WebKitGTK 4.0 and DTK 5; the maximum required GLIBC version SHALL remain 2.28.

#### Scenario: Complete release
- **WHEN** a tagged release is assembled
- **THEN** all three Deepin archives are required along with the existing generic platform artifacts

#### Scenario: Incompatible Desktop linkage
- **WHEN** the dedicated Desktop links WebKitGTK 4.1/6, lacks DTK 5 or requires GLIBC above 2.28
- **THEN** the packaging verification fails

### Requirement: Separate update identity
The dedicated executables MUST use a Deepin-specific update target and MUST NOT select ordinary Linux update packages.

#### Scenario: Only generic updates exist
- **WHEN** a Deepin build checks a manifest containing only generic Linux packages
- **THEN** no generic package is selected for installation

#### Scenario: Generic Linux build
- **WHEN** a generic build checks for updates
- **THEN** its existing Linux update identity is preserved
