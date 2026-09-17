## Purpose

Keep ACECode's functional Web/Desktop iconography consistent, theme-aware and recognizable across operation, navigation and status controls while preserving brand and file-type artwork.

## ADDED Requirements

### Requirement: Rounded functional icon family
All first-party operation, navigation and status icons SHALL use a coherent thin-line family with round endpoints, softened corners and consistent visual padding. Existing control actions, hit targets and icon meanings SHALL remain intact.

#### Scenario: Icons are shown together in a toolbar
- **WHEN** search, add, folder, terminal, settings or other functional icons appear together
- **THEN** their line weight, corner treatment and occupied area follow the same family
- **AND** changing the artwork does not change the controls' actions or hit targets

#### Scenario: MCP and experts have distinct navigation identities
- **WHEN** an MCP server or expert entry point is shown
- **THEN** MCP uses an outlined plug and experts use a simplified head outline with a small gear
- **AND** both symbols use the same rounded stroke family without large solid areas
- **AND** model and reasoning entries retain their distinct brain symbol

#### Scenario: 列表面板展开或收起
- **WHEN** 用户在列表面板或预览详情栏操作列表开关
- **THEN** 两处入口使用同一 16 px 三横线图标，继承圆端点细线和无固定颜色的规范
- **AND** 列表展开时开关使用主题高亮色与背景表示激活，收起后的恢复入口使用普通状态

### Requirement: Size-aware stroke weights

Functional icons SHALL use regular stroke targets of 0.8, 1.0, 1.2, 1.4, 1.6 and 1.8 CSS px at nominal sizes 12, 16, 20, 24, 28 and 32 px respectively. Intermediate sizes SHALL use a consistent interpolation. Standalone 20-unit assets SHALL expose their reference size explicitly.

#### Scenario: A shared icon changes display size
- **WHEN** a shared icon is rendered at 16, 20 or 24 CSS px
- **THEN** its regular stroke target is respectively 1, 1.2 or 1.4 CSS px
- **AND** the icon remains centered without clipping its rounded endpoints

### Requirement: Functional source icons contain no fixed colors
Functional icon sources and exported SVGs SHALL contain only currentColor or none for paint. They SHALL inherit their visible color from the consuming control, including dark themes, hover, disabled and status colors.

#### Scenario: An icon is placed on a themed control
- **WHEN** the control's CSS color changes
- **THEN** the icon follows that color without an invert filter or a separate colored source asset
- **AND** icon source files contain no hex, RGB, named-color, gradient or raster paint

### Requirement: Complete and reproducible icon inventory
Every shipped first-party functional icon SHALL be included in the canonical inventory. Existing public icon URLs and semantic aliases SHALL continue to resolve. Regenerating the public assets SHALL reproduce the committed glyph geometry and color rules.

#### Scenario: The public family is regenerated
- **WHEN** a contributor runs the icon generator
- **THEN** all public functional icon SVGs are regenerated from the canonical family
- **AND** none return to a legacy vendor style or fixed paint color

### Requirement: Preserve excluded artwork
Brand logos and file-type icons SHALL preserve their existing source artwork and rendering. Dynamic data charts and terminal text glyph contracts SHALL remain outside the functional icon replacement.

#### Scenario: File types and provider identities appear next to controls
- **WHEN** the UI shows Seti/PPTX file icons or provider/application logos alongside functional icons
- **THEN** those file-type and brand assets retain their prior artwork and color
- **AND** the surrounding functional controls use the unified family
