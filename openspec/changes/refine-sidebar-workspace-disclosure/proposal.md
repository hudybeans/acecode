## Why

侧边栏文件夹点击当前会激活工作区并进入新会话页面，选中会话也会使其所属文件夹变蓝；“展开显示”一次展示全部会话且悬停出现背景。这些行为与用户要求的纯折叠导航和渐进浏览不符。

## What Changes

- 文件夹行点击仅展开或收起，不切换会话、工作区或进入新会话页面；行内右侧新建按钮保持新会话入口。
- 文件夹行取消所有激活样式，仅保留现有悬停样式。
- “展开显示”每次增加五条，末批不足五条时显示剩余会话；全部显示后保留“折叠显示”返回五条。
- 展开/折叠文字按钮悬停仅改变文字颜色，无背景变化。
- 保留手动收起、全部收起和重新展开默认五条，以及定位选中会话时展示目标所在批次的行为。

## Capabilities

### New Capabilities

- `sidebar-workspace-disclosure`: 文件夹行只负责展开/收起，取消激活样式。

### Modified Capabilities

- `sidebar-session-collapse`: 将一次全部展开改为每次增加五条，并限制文字按钮的悬停样式。

## Impact

影响 `web/src/components/Sidebar.jsx`、`web/src/lib/sidebarSessions.js`、`web/src/lib/sidebarWorkspaceSessions.js` 及其回归测试。工作区和无工作区列表共用计数投影；保留现有后台缓存加载方式和显式新建、菜单动作。首批请求通过已有 limit 参数补偿置顶名额，无后端协议变更。
