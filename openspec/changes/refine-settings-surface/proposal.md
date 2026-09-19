## Why

Settings still has a title bar across both columns and reuses the workspace background, unlike the supplied Claude references. The recent card flattening also leaves row underlines beside old group dividers, producing duplicate lines.

## What Changes

- Extend navigation and content to the top of the dialog; retain accessible expand and close controls independently in the upper right.
- Use a bright content surface, subtly contrasting navigation, neutral selection, and restrained separators in both themes.
- Replace legacy group dividers with whitespace so flattened rows do not produce double rules.
- Preserve configuration behavior, search, font preferences, independent scrolling, dialog dimensions, and expansion.
- 统一设置页字重：仅页面主标题和一级分组标题保留加粗；字段名、卡片名称、选项、导航和更深层标题使用常规字重，需要强调时使用现有前景色 token。

## Capabilities

### New Capabilities

- `settings-surface`: Continuous Settings columns with themed surfaces and single separators.

### Modified Capabilities

None.

## Impact

SettingsPage, scoped Settings CSS, and existing dialog architecture checks. Browser visual checks and the Web test/build pipeline verify the result. No API or dependency changes.
