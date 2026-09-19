## MODIFIED Requirements

### Requirement: Sidebar collapses long workspace session lists

侧边栏 SHALL 默认仅展示每个工作区和无工作区列表前五条非置顶、非归档会话，展开状态在列表间独立。

#### Scenario: Workspace has five or fewer sessions
- **WHEN** 列表可见会话不超过五条
- **THEN** 侧边栏 MUST 显示全部且不显示展开或折叠控件

#### Scenario: Workspace has more than five sessions
- **WHEN** 列表超过五条且尚未手动展开
- **THEN** 侧边栏 MUST 仅显示前五条并提供“展开显示”

#### Scenario: 收起文件夹后重新打开
- **WHEN** 用户收起任意文件夹或全部文件夹后再打开
- **THEN** 该列表 MUST 回到前五条，当前会话自动定位不能覆盖此次手动选择

### Requirement: Expanded workspace lists can be collapsed again

侧边栏 SHALL 每次展开最多增加五条会话；仍有隐藏会话时保留“展开显示”，全部展示后提供“折叠显示”。

#### Scenario: Expand long list
- **WHEN** 十二条会话的列表从五条开始连续点击“展开显示”
- **THEN** 侧边栏 MUST 依次展示十条、十二条，不能在第一次点击时展示全部

#### Scenario: 补齐历史保留已展示顺序
- **WHEN** 用户展开显示触发首次补齐后续历史会话
- **THEN** 系统 MUST 保留此前展示的会话顺序并追加后续历史记录，不能把补齐的旧会话提升到原有列表前面

#### Scenario: Collapse long list
- **WHEN** 用户点击“折叠显示”
- **THEN** 列表 MUST 回到五条并再次提供“展开显示”

#### Scenario: 悬停文字控件
- **WHEN** 用户悬停任意列表的展开或折叠控件
- **THEN** 系统 MUST 仅加深文字颜色，不改变背景

#### Scenario: 新导航目标位于隐藏批次
- **WHEN** 用户明确导航到当前列表中隐藏的会话
- **THEN** 侧边栏 MUST 展示到包含该会话的五条批次，保留后续批次隐藏

#### Scenario: 置顶与延迟加载
- **WHEN** 列表包含置顶会话，或数据加载完成前用户已收起文件夹
- **THEN** 系统 MUST 按非置顶会话判断批次和末尾，且加载完成不能重新展开被收起的文件夹或列表
