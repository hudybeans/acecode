## Why

会话标题与窗口顶栏分成两行，按钮位置分散。菜单分组线绘制在圆角按钮上，导致端点弯曲。

## What Changes

- 会话标题、工作区和会话操作并入 41 px 顶栏，删除主会话的第二行标题。
- 侧边聊天与查找移入带图标的竖三点菜单，三点紧邻控制台按钮左侧。
- 功能组与 Windows 窗口控制组间距为 40 px；保留 macOS 原生三灯避让。
- 所有共享右键菜单使用独立、直线的分组分隔元素。

## Capabilities

### New Capabilities
- `unified-session-titlebar`: 单行会话窗口标题与菜单操作。

### Modified Capabilities

## Impact

Web App、TopBar、ChatView、DesktopContextMenu 和共享样式；不修改原生窗口层级或会话 API。
