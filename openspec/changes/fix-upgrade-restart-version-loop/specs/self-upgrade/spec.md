## ADDED Requirements

### Requirement: Upgrade restart replaces the managed runtime
An accepted Desktop upgrade restart SHALL terminate and confirm exit of its managed backend before launching the installed Desktop, regardless of the normal background-continuation preference. It SHALL preserve that preference and SHALL NOT launch a replacement when managed shutdown fails.

#### Scenario: Upgrade with background continuation enabled
- **WHEN** the user accepts restart after an installed upgrade with background continuation enabled
- **THEN** the old managed backend exits and the installed Desktop starts a new backend
- **AND** normal later exits still honor the saved continuation preference

#### Scenario: Managed shutdown cannot complete
- **WHEN** an upgrade restart cannot confirm termination of its managed backend
- **THEN** the application records an actionable error and does not report or launch a successful replacement

### Requirement: Desktop uses its installed backend version
Desktop SHALL reuse an existing owned backend only when the backend application version and executable installation match the launching Desktop. Existing ownership and runtime generation validation SHALL precede replacement.

#### Scenario: An older release preserved its daemon after upgrade
- **WHEN** the updated Desktop discovers an otherwise healthy managed backend with an older application version
- **THEN** it replaces that backend and displays the updated runtime version

#### Scenario: Backend belongs to another installation copy
- **WHEN** an owned backend has a matching protocol and version but runs from another executable installation
- **THEN** Desktop replaces it with the backend from its own installation

#### Scenario: Compatible background backend survives a normal exit
- **WHEN** Desktop finds a healthy owned backend from the same version and installation
- **THEN** it reuses that backend without interrupting its work

### Requirement: Package binaries match the selected release
The updater SHALL verify that the staged backend executable reports the selected release version before replacing installed files. A flat-package installation SHALL verify the installed backend version before reporting success and roll back on verification failure. Version probing SHALL be bounded and SHALL NOT invoke a command shell.

#### Scenario: Archive contains an older executable
- **WHEN** the downloaded archive matches its checksum but its executable reports an older version
- **THEN** installation fails with a version-mismatch error without replacing the existing installation

#### Scenario: Executable cannot report its version
- **WHEN** the version probe fails, times out, exits unsuccessfully, or produces invalid output
- **THEN** the updater fails with an actionable error and never reports successful installation

#### Scenario: Installed executable fails verification
- **WHEN** files have been copied but the installed executable does not report the selected version
- **THEN** the updater restores the previous installation and reports failure

### Requirement: Installed GUI updates remain pending restart without reinstalling
A successful GUI update that still requires restart SHALL retain its job identity and result when installation is requested again. It SHALL NOT start another download or file replacement until that serving runtime is replaced.

#### Scenario: User requests the same update again
- **WHEN** the serving backend still holds a successful update requiring restart and receives another installation request
- **THEN** it returns the existing successful job and restart requirement without running the updater again

#### Scenario: User retries a failed update
- **WHEN** a previous update failed and a compatible update remains available
- **THEN** a new installation attempt is allowed
