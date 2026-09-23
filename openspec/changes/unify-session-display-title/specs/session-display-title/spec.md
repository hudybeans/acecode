## ADDED Requirements

### Requirement: 会话显示标题只有一个来源

daemon MUST 为每个会话维护显示标题的三个字段:`title`、`title_source`、`summary`。会话列表(含 `list_active` 的活跃会话)与 `GET /api/sessions/:id/messages?since=0` 快照 MUST 携带这三个字段。用户改名或自动生成标题落地时 daemon MUST 发 `session_updated{title,title_source}`;每条可见用户消息落盘后 daemon MUST 发 `session_updated{summary}`,其值为已按摘要规则截断的文本。

Web 客户端在侧栏、顶部标题栏、网格卡片、搜索面板等所有显示会话名字的地方 MUST 使用同一条派生规则:非空且非 generated `[Error]` 的 `title` 优先,否则 `summary`;实时刷新 MUST 只来自 `session_updated` 与快照字段。客户端 MUST NOT 从消息正文推导标题,MUST NOT 在本地用输入文本改写标题,也 MUST NOT 为显示目的另行拉取消息全文。

#### Scenario: 顶部标题与侧栏一致

- **WHEN** 会话无标题、最近一条用户消息是 9000 字符的引用展开文本(显示文本为 `@规划 继续`)
- **THEN** 侧栏与顶部标题栏 MUST 都显示 `@规划 继续`,且长度受服务端 80 字节截断约束

#### Scenario: 大模型标题就绪

- **WHEN** daemon 发出 `session_updated{title:"规划 AgentLoop 拆分", title_source:"generated"}`
- **THEN** 侧栏与顶部标题栏 MUST 同时切换为该标题,`summary` 保持不变

#### Scenario: 新一轮用户消息

- **WHEN** 用户在无标题会话里发送第二条消息 `第二轮 换个话题`
- **THEN** daemon MUST 发出 `session_updated{summary:"第二轮 换个话题"}`,两处显示 MUST 同步更新

#### Scenario: 刷新 / 深链打开会话

- **WHEN** 客户端没有侧栏会话对象,仅凭 session id 加载 `messages?since=0`
- **THEN** 顶部标题 MUST 取快照里的 `title` / `summary`,而不是消息正文
