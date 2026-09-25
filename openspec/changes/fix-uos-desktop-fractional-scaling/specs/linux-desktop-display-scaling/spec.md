## Purpose

Keeps ACECode Desktop text, controls, and spacing in proportion when a Linux desktop environment represents display scaling through font DPI and window scaling separately.

## ADDED Requirements

### Requirement: Consistent UOS Desktop content scaling
On UOS/Deepin X11, when native GTK text DPI represents a scale above 100%, ACECode Desktop SHALL render text and non-text WebView content at the same effective scale.

#### Scenario: Fractional display scale
- **WHEN** UOS/Deepin uses a 125% or 150% display scale with an unscaled GTK window
- **THEN** text, controls, icons, and CSS pixel spacing in the Desktop page grow by the same scale factor

#### Scenario: Integer window scale
- **WHEN** UOS/Deepin uses an integer GTK window scale that already accounts for part or all of the display scale
- **THEN** ACECode applies only the remaining page scale and avoids scaling the page twice

### Requirement: Safe scale boundaries
ACECode Desktop SHALL leave the WebView at its normal scale when native GTK DPI is 96, the native DPI signal is invalid or unavailable, or the desktop session is outside the UOS/Deepin X11 workaround.

#### Scenario: Normal 100% scale
- **WHEN** the effective native font DPI is 96 (100%)
- **THEN** ACECode does not add page zoom or override text DPI

#### Scenario: Other Linux desktop
- **WHEN** ACECode runs outside a UOS/Deepin X11 session
- **THEN** the Desktop WebView retains its existing GTK and WebKit scaling behavior

#### Scenario: Stale Deepin preference
- **WHEN** Deepin's scale-factor preference is 1.0 but native GTK font DPI remains 120
- **THEN** ACECode applies a matching 125% scale to text and control geometry

#### Scenario: Native tray menu
- **WHEN** the UOS/Deepin WebView correction normalizes GTK font DPI
- **THEN** ACECode's native tray menu labels retain the text size supplied by the original display scale

### Requirement: Scale changes during a Desktop session
ACECode Desktop SHALL update its WebView scale when the UOS/Deepin display scale changes while the window is open, without changing system-wide display settings.

#### Scenario: Fractional scale changes while open
- **WHEN** native GTK DPI changes from 120 to 144 while ACECode Desktop is open and the process-local GTK DPI is already normalized
- **THEN** its text and non-text content update to the new matching scale

#### Scenario: Return to 100%
- **WHEN** native GTK DPI returns to 96 while ACECode Desktop is open
- **THEN** its WebView returns to normal page zoom and text sizing
