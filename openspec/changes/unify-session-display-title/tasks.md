## 1. 摘要口径(daemon / 存储层)

- [x] 1.1 `SessionStorage::visible_user_message_text` + `summarize_user_message_text`(显示文本优先、单行、80 字节 UTF-8 安全截断);`SessionManager::extract_summary` 与 `list_sessions` 补齐旧 meta 委托到同一实现;`SessionManager::current_summary()`。
- [x] 1.2 AgentLoop 在用户消息落盘后(正常回合 + soft-steer 插话)发 `session_updated{summary}`;`list_active` 填 `summary`;`GET /messages?since=0` 快照带 `title` / `title_source` / `summary`。
- [x] 1.3 回归测试:`tests/session/session_summary_test.cpp`(显示文本优先 / 空白折叠 / CJK 与英文截断 / 旧 meta 补齐)、`tests/agent_loop/agent_loop_session_summary_event_test.cpp`(事件值、顺序、每回合刷新、已截断)。

## 2. Web 单一来源

- [x] 2.1 transcript store 改存 `title` / `titleSource` / `summary`,对外 `title` 经 `transcriptDisplayTitle` 派生;`session_updated` 与快照字段合并;删除 `titleFromMessages` / `setTitle`;ChatView 发送时不再本地改标题。
- [x] 2.2 Sidebar 对 `session_updated` 合并 `summary`;删除 hover 拉全文水合跑马灯(`sidebarFullTitle.js` 及其测试),跑马灯滚动显示标题本身。
- [x] 2.3 前端测试:`sessionTranscript.test.js`「会话显示标题」组、`sessionTitleSingleSourceArchitecture.test.js`、更新 `sidebarTitleMarqueeArchitecture.test.js`;`pnpm test` 全绿。

## 3. 文档与验证

- [x] 3.1 `docs/daemon-api.md`(`session_updated` 字段、messages 快照字段)、`CLAUDE.md` 备忘。
- [x] 3.2 C++ 单测(新用例 + 标题 / 会话列表 / web smoke title 用例)通过;`git diff --check` 无夹带。
