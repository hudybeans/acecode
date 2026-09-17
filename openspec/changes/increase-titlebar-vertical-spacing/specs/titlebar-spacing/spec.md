## ADDED Requirements

### Requirement: Additional title-bar breathing room
The shared title bar SHALL add 5 CSS px above and 6 CSS px below its previous 30 px control row, resulting in a 41 px overall height. Existing icons and 24 px control boxes SHALL retain their sizes.

#### Scenario: Window is maximized
- **WHEN** the title bar meets the top of the window
- **THEN** web control boxes have 8 px top and 9 px bottom clearance
- **AND** the shared background/wallpaper boundary follows the 41 px row

### Requirement: Platform-safe native controls and dragging
The title bar SHALL preserve native macOS traffic-light placement and its 80 px windowed horizontal reservation, and SHALL allow dragging through the complete visible blank row while excluding interactive controls.

#### Scenario: macOS enters or leaves native fullscreen
- **WHEN** the native fullscreen state changes
- **THEN** the existing web inset transition follows the state without rendering custom window controls
- **AND** AppKit continues to own the standard three buttons and their geometry

#### Scenario: User drags near the bottom of the padded row
- **WHEN** the pointer is within the visible blank row, including its last pixel
- **THEN** window dragging or double-click maximize is available
- **AND** controls and excluded overlay content retain their own interactions
