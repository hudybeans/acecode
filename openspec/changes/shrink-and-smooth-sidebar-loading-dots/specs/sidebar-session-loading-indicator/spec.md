## Purpose

Give running sidebar sessions compact, continuous visual feedback while preserving session-row alignment and motion accessibility preferences.

## ADDED Requirements

### Requirement: Compact running-session dots
Running sidebar sessions SHALL display four accent-colored dots whose diameter is 4.3 CSS pixels. The indicator SHALL retain its existing slot and row alignment, and the four dots SHALL remain visually separate throughout contraction.

#### Scenario: A session is running
- **WHEN** a sidebar session is in progress
- **THEN** four 4.3px dots appear in the existing 16px indicator slot without shifting the title or timestamp

### Requirement: Continuous running animation
With normal motion preferences, the visible running indicator SHALL continuously rotate and breathe without a finite hold at the contracted position. Hovering a row or refreshing its title SHALL NOT pause the ongoing animation while it remains mounted and running.

#### Scenario: The indicator crosses its contracted phase
- **WHEN** the animation traverses one or more complete breathing cycles
- **THEN** each contraction proceeds into expansion without the former 36%-72% stationary interval
- **AND** the orbit rotates continuously across cycle boundaries

#### Scenario: The running row is hovered
- **WHEN** the user hovers a running session row
- **THEN** the indicator continues animating

### Requirement: Preserve attention semantics and reduced motion
The indicator SHALL retain its accessible running-state label and theme accent color. Reduced-motion preferences SHALL retain four spatially stationary dots with a gentle brightness pulse; unread and read sessions SHALL keep their existing presentation.

#### Scenario: Reduced motion is requested
- **WHEN** the system requests reduced motion
- **THEN** four separate 4.3px dots appear without rotation or radial motion and the running status label remains available
- **AND** the group gently pulses in opacity between 0.6 and 1 to show that the session is still running

#### Scenario: Motion preference changes while running
- **WHEN** the system motion preference changes while a running indicator is visible
- **THEN** it switches between full motion and the gentle opacity pulse without disappearing or remaining entirely static

#### Scenario: The session is no longer running
- **WHEN** a session becomes unread or read
- **THEN** the existing unread marker or absence of a running marker is used

### Requirement: Legacy indicator geometry
The running indicator SHALL maintain its 16px slot and four separate dots on older Chromium-based engines that support CSS keyframe animations and 2D transforms. Its initial geometry SHALL remain defined even before animations start.

#### Scenario: An older Chromium engine displays a running session
- **WHEN** the built indicator is rendered in Chromium 109 with normal motion preferences
- **THEN** rotation and radial breathing advance while the four dots retain their configured size and alignment
