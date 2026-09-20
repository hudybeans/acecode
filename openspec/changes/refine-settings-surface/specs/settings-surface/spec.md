## Purpose

Provide a quiet, readable Settings dialog whose continuous columns and restrained separators match the supplied visual references.

## ADDED Requirements

### Requirement: Continuous columns with accessible window actions

The Settings dialog SHALL extend navigation and the content surface to its top edge without a visible shared Settings title bar. The dialog SHALL retain an accessible name, independent scrolling, and working expand, restore, and close actions.

#### Scenario: Open and resize Settings
- **WHEN** the user opens Settings and expands or restores it
- **THEN** the navigation divider reaches both vertical edges of the dialog and window actions remain reachable without covering content

### Requirement: Theme-aware surface hierarchy

Settings SHALL display a bright content area in light mode, subtly contrasting navigation, neutral navigation selection, and fine separators. Dark mode and the user's accent and font preferences SHALL remain usable.

#### Scenario: Change appearance
- **WHEN** the user changes between light and dark modes or the available accent themes
- **THEN** Settings keeps legible text, distinct control states, and consistent column surfaces

### Requirement: Single separators between settings

Adjacent configuration groups SHALL NOT display a flattened row underline together with a legacy group rule at the same boundary. Group spacing SHALL preserve readable hierarchy while inputs retain visible boundaries.

#### Scenario: Flattened row followed by a group
- **WHEN** a configuration row precedes another settings group
- **THEN** the boundary contains at most one divider and whitespace separates the groups

### Requirement: 仅两级标题使用加粗字重

设置界面 SHALL 仅对页面主标题和一级分组标题使用加粗字重。字段名、选项标题、卡片名称、列表项、导航文字和更深层标题 SHALL 使用 400 常规字重；强调 SHALL 通过现有前景色 token 表达。设置子弹窗 SHALL 遵守相同层级规则，保留其独立主标题的字重。

#### Scenario: 查看配置字段
- **WHEN** 用户打开配置页
- **THEN** “配置”“升级服务”“工作空间依赖项”和“默认终端”等主标题或一级标题保留加粗，而“升级服务 URL”“Python 工具”“Node.js 工具”“C# 工具”“终端类型”和“终端程序路径”使用常规字重

#### Scenario: 切换设置分区和主题
- **WHEN** 用户查看常规、外观、技能、模型、工具、安全中心等设置分区，或打开设置子弹窗，并切换明暗主题、语言与字体大小
- **THEN** 下级标题、选项和字段不因选中、默认状态或主题发生加粗，主次文字继续使用主题前景色区分，现有配置行为保持不变
