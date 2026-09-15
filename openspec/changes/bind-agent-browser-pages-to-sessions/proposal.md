## Why

Desktop Agent Browser 的页面没有会话归属：原生 host 只有一个进程级页面池和一个全局「活动页」，daemon 的 browser_* 工具不上报会话身份，Web UI 只在「当前渲染的会话 transcript 里恰好有一条正在执行的 browser_* 工具并同时收到状态事件」那一瞬间认领页面并创建页签。用户在 `browser_open` 前的延迟里切到另一个会话（会话 20260915-120207-bdf9 的复现），事件无人接收，页面成为孤儿；切回来时工具已经结束，页签永远不出现。同一个全局活动页还让后台会话的 `browser_open` 把用户正在看的页面挤成隐藏，并让省略 `page_id` 的工具落到别的会话的页面上。

## What Changes

- 在 Desktop host 引入页面归属：每个页面记录 `owner{session_id, workspace_hash, root_session_id}`；把全局「活动页」拆成「显示页」（只由 UI 设置）与「每会话的 Agent 目标页」；带 owner 的 Agent 建页不再改变显示页。
- 代理协议升到 v5：每个代理请求可携带 `owner`；`create_page` / `claim_page` / `close_page` / `select_page` / `cdp` 都按 owner 解析默认目标页；页面状态事件与新增的 `aceDesktop_agentBrowserListPages` bridge 携带 `owner` 与 `agent_target`；`aceDesktop_agentBrowserCreatePage` 接受 owner。
- daemon 侧：`ToolContext` 增加会话身份（`session_id` / `parent_session_id` / `workspace_hash`），browser_* 工具每次连接代理时把它作为 owner 发送。
- Web UI：新增 App 级页面归属登记表（`lib/agentBrowserPages.js`），挂载时安装状态事件监听并全量对账，切会话按会话对账；ChatView 只从登记表派生浏览器页签，本视图首次见到的页面自动打开并激活；活动推断只保留彩虹边框与目标页前置。
- 兼容：无 owner 的旧协议请求与旧 Desktop 事件沿用引入归属前的行为（显示页即默认目标、前端按活动认领）。

## Capabilities

### New Capabilities

- `agent-browser-page-ownership`: Agent Browser 页面归属会话，显示页与 Agent 目标页分离，Web UI 页签由归属登记表派生。

### Modified Capabilities

- `agent-browser`: 工具省略 `page_id` 时的默认目标从「全局活动页」改为「本会话的 Agent 目标页」；`browser_close` 省略时关闭本会话的目标页。

## Impact

- Desktop native：`agent_browser_host.{hpp,cpp}`、`agent_browser_host_mac.mm`、新增 `agent_browser_page_directory.{hpp,cpp}`、`agent_browser_runtime.hpp`（协议版本）、`main.cpp`（状态 JSON 与 bridge）。
- daemon：`tool/tool_executor.hpp`（ToolContext）、`agent_loop.cpp`（填会话身份）、`tool/agent_browser/{cdp_client,browser_tools}.{hpp,cpp}`。
- Web UI：`App.jsx`、`components/ChatView.jsx`、`lib/agentBrowser.js`、`lib/previewTabs.js`、新增 `lib/agentBrowserPages.js`。
- 测试：`tests/desktop/agent_browser_page_directory_test.cpp`、`tests/tool/agent_browser_tools_test.cpp`、Windows smoke、前端 `agentBrowserPages.test.js` / `previewTabs.test.js` / `agentBrowser.test.js` / `agentBrowserArchitecture.test.js`。
- 文档：`docs/agent-browser.md`「页面归属」、`CLAUDE.md`。
