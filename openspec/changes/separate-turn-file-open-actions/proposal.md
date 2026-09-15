## Why

每轮“已修改 X 个文件”列表的整行和“打开”均打开差异，用户无法直接查看文件内容，也无法从标签判断打开目标。

## What Changes

- 保留原来的行样式和右侧“打开”，默认点击行内任意位置打开文件内容。
- 悬停行时，在文件名后的行数位置显示“查看变更”及右上箭头；仅悬停该入口时显示下划线，点击该入口打开该轮差异。
- 历史和最新轮次保持一致，支持键盘、窄屏和中英文界面。

## Capabilities

### New Capabilities

- `turn-file-open-actions`: 区分轮次变更预览与文件内容预览。

### Modified Capabilities

无。

## Impact

影响 TurnFileList、ChatView 两处接线、列表样式和翻译目录。复用现有预览页签，无后端 API 或依赖变更。
