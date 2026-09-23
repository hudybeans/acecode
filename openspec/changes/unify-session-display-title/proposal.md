## Why

会话名字在两处显示、却来自两条不同的推导路径:侧栏用服务端的 `title` / `summary`(80 字节截断),顶部标题栏在加载历史后用最后一条 user 消息的全文。会话 20260923-163126-e7e3 的首条消息是 `@session` 引用展开后的 9k 字符长文,顶部标题变成了整段展开文本(长度不受限),侧栏显示的又是按展开后 `content` 截出来的 "Referenced ACECode session context follows..."。两处经常不一致,而且用户真正敲的原文(`metadata.display_text`)在哪一边都没被用上。

## What Changes

- 会话摘要(`summary`)按用户消息的**显示文本**(`metadata.display_text` 优先于 `content`)生成,折成单行、UTF-8 安全截到 80 字节 + "..."。`SessionManager` 内存值与 `list_sessions` 补齐旧 meta 走同一实现。
- daemon 在每条可见用户消息落盘后发 `session_updated{summary}`;`list_active` 与 `GET /messages?since=0` 快照带上 `title` / `title_source` / `summary`。
- Web 顶部标题栏与侧栏改为同一条派生规则(`sessionDisplayTitle`):服务端 `title` 优先,否则 `summary`;实时刷新只认 `session_updated`。删除 transcript 的 `titleFromMessages`、ChatView 发送时的本地改标题、侧栏 hover 拉全文水合跑马灯(`sidebarFullTitle.js`)。
- 大模型自动生成标题的流程不变:标题就绪时以 `session_updated{title,title_source}` 覆盖显示。

## Capabilities

### New Capabilities

- `session-display-title`:会话显示标题的单一来源合同(daemon 事件 / 快照字段 + Web 派生规则)。

### Modified Capabilities

- `session-storage`:`summary` 的生成口径(显示文本、单行、80 字节)。

## Impact

`src/session/session_storage.*`、`src/session/session_manager.*`、`src/agent_loop.*`、`src/session/session_registry.cpp`、`src/web/server_helpers.cpp`;`web/src/lib/sessionTranscript.js`、`sessionTitle.js`、`components/Sidebar.jsx`、`components/ChatView.jsx`;`docs/daemon-api.md`。WS 协议只是给既有 `session_updated` 事件增加可选字段 `summary`,老客户端忽略即可。
