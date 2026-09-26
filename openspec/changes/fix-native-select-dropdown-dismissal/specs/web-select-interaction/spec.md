## Purpose

Keep shared single-choice dropdowns usable across ACECode settings, documents, and feedback while preserving form values, keyboard control, and platform compatibility.

## ADDED Requirements

### Requirement: A single click opens a stable dropdown

On supported Windows Desktop engines, enabled single-choice dropdowns SHALL stay open after a primary mouse click until the user chooses an option or dismisses the picker.

#### Scenario: User opens language or feedback options
- **WHEN** the user clicks the interface-language or feedback-session dropdown once
- **THEN** the available options SHALL remain visible and selectable
- **AND** opening the dropdown SHALL NOT change its value or submit a form

#### Scenario: User selects an option
- **WHEN** the user selects an enabled option with the mouse or keyboard
- **THEN** the dropdown SHALL close and deliver the selected value once to the existing change handler

### Requirement: Picker dismissal respects its containing surface

An open picker SHALL handle Escape without closing its containing settings or feedback dialog.

#### Scenario: User cancels a selection
- **WHEN** the user presses Escape while the picker is open
- **THEN** the picker SHALL close without changing its value
- **AND** its containing dialog SHALL remain open

### Requirement: Shared pickers respect compatibility and appearance

Shared dropdown styling SHALL follow active theme colors and keep long menus within the viewport. Multiple selections, multirow lists, unsupported engines, and non-Windows-Desktop environments SHALL retain their existing control rendering.

#### Scenario: Feedback labels are long
- **WHEN** feedback options contain long session titles or paths
- **THEN** the menu SHALL remain readable and scrollable without extending beyond the viewport

#### Scenario: Enhanced rendering is unavailable
- **WHEN** the engine lacks the required picker rendering support or is not Windows Desktop
- **THEN** the original select rendering and keyboard event propagation SHALL remain available

### Requirement: 菜单宽度适应选项内容

增强下拉菜单 SHALL 按选项内容展开，并在视口允许时至少与触发控件等宽；菜单及选项 SHALL 保留既有主题颜色、常规字重、选中标记和键盘交互。

#### Scenario: 紧凑控件包含较长选项
- **WHEN** 用户展开“关闭窗口时”等紧凑下拉控件
- **THEN** 菜单可宽于控件，“每次询问”“最小化到托盘”“退出应用”等普通选项保持单行

#### Scenario: 菜单靠近视口边缘或包含超长内容
- **WHEN** 控件靠近视口边缘，或选项包含超长会话标题、路径
- **THEN** 菜单不超出视口，长文本可换行、长列表可滚动，禁用选项不可选择
