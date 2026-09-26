## Purpose

Provide UOS/Deepin native window effects and scaling without making other operating systems depend on the Deepin desktop toolkit.

## ADDED Requirements

### Requirement: Explicit Deepin build selection
The project SHALL require an explicit default-off Linux build option to include DTK integration and the Deepin scaling workaround. Generic Linux, Windows and macOS builds MUST NOT discover or link DTK/Qt as a result of this feature.

#### Scenario: Generic build
- **WHEN** a developer builds without the Deepin option
- **THEN** the Desktop builds without DTK or Qt development packages and does not activate the Deepin-specific integration

#### Scenario: Unsupported platform
- **WHEN** the Deepin option is enabled for a non-Linux target
- **THEN** configuration fails with an actionable diagnostic

### Requirement: Native frame with full-height web content
The dedicated Desktop SHALL enable native Deepin window effects on Deepin X11 or XWayland and preserve WebKitGTK 4.0, full-height web content, existing web window controls and close-to-tray behavior. It MUST NOT overlay a second titlebar over web interactions.

#### Scenario: Deepin session
- **WHEN** the dedicated Desktop runs on a Deepin X11 or XWayland backend
- **THEN** the system frame provides its rounded corners and shadow while the web titlebar remains interactive

#### Scenario: Different runtime backend
- **WHEN** the dedicated Desktop runs outside Deepin or uses native Wayland
- **THEN** X11-specific native integration is skipped

#### Scenario: Fractional scale
- **WHEN** the dedicated Desktop runs on Deepin X11 with effective font DPI above 96 and valid scale parameters
- **THEN** text and controls follow the same scale and live display changes refresh the correction
