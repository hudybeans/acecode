## Purpose

Make Linux and Deepin Desktop stable during ordinary use and present a consistent startup and sidebar layout on the supported old WebKit runtime.

## ADDED Requirements

### Requirement: Stable desktop process
The Desktop SHALL remain running during idle operation and opening an existing workspace directory, and SHALL release optional native integrations without accessing destroyed platform resources.

#### Scenario: Idle and workspace interaction
- **WHEN** a user leaves the Desktop idle or opens an existing directory in a new session
- **THEN** the host remains responsive and does not unexpectedly exit

#### Scenario: GTK and DTK share an X11 process
- **WHEN** the dedicated Deepin build starts in a Deepin session
- **THEN** Xlib threading is initialized before any GTK display or resource access
- **AND** optional DTK effects are skipped if early initialization failed

### Requirement: Available native directory selection
The Linux Desktop SHALL offer directory selection through its GTK runtime without requiring an external zenity or kdialog executable.

#### Scenario: External pickers absent
- **WHEN** the user opens an existing directory on a system without zenity and kdialog
- **THEN** a parented native directory picker opens and returns the selected directory

#### Scenario: User cancels
- **WHEN** the user cancels the native picker
- **THEN** no workspace is registered and the Desktop remains available

### Requirement: Stable session-list width
The session list SHALL reserve scrollbar space whether or not its contents overflow, including on WebKit versions without `scrollbar-gutter` support.

#### Scenario: Overflow threshold crossed
- **WHEN** session-list content changes from short to overflowing and back
- **THEN** the usable row width remains unchanged and no horizontal layout shift occurs

### Requirement: Linux startup presentation
Linux and Deepin Desktop SHALL show the existing ACECode logo during startup and reveal the first main window centered inside the selected monitor's usable area.

#### Scenario: First window becomes ready
- **WHEN** the initial frontend becomes ready
- **THEN** the startup logo closes and the main window is shown centered with its size constrained to the available work area

#### Scenario: Existing window restored
- **WHEN** an already-shown main window is restored later
- **THEN** its user-selected placement is preserved

### Requirement: External Deepin runtime libraries
The Deepin package SHALL dynamically link system DTK/Qt and SHALL NOT include copies of their runtime libraries or plugins in its archive.

#### Scenario: Package staged
- **WHEN** a Deepin release archive is staged
- **THEN** verification confirms the expected shared dependencies and rejects bundled Qt/DTK libraries or plugins
