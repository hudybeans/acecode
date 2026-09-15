## 1. Native ownership bookkeeping

- [x] 1.1 Add `AgentBrowserPageDirectory` (owner, displayed page, per-session agent target, resolution and close fallback) with cross-platform unit tests
- [x] 1.2 Replace `page_order` / `active_page` in the Windows and macOS hosts with the directory; owned agent page creation no longer selects the displayed page
- [x] 1.3 Carry `owner` and `agent_target` in `AgentBrowserState`, filter `states()` by owner session, accept owner on `create_page`

## 2. Proxy protocol and daemon tools

- [x] 2.1 Bump the runtime protocol to v5 and parse `owner` on every proxy operation (create / claim / close / select / cdp)
- [x] 2.2 Add session identity to `ToolContext`, fill it in `AgentLoop::build_tool_context`, and send it as the proxy owner from every browser_* tool
- [x] 2.3 Unit tests for `agent_browser_owner_from_context` and `build_agent_browser_proxy_request`

## 3. Desktop bridge

- [x] 3.1 Emit `owner` / `agent_target` in state JSON, accept owner on `aceDesktop_agentBrowserCreatePage`, add `aceDesktop_agentBrowserListPages`
- [x] 3.2 Extend the Windows host smoke with the ownership scenario (`SMOKE_OWNERSHIP_OK`)

## 4. Web UI

- [x] 4.1 Add the App-level page registry (`lib/agentBrowserPages.js`) with listener install, bridge reconciliation and Node tests
- [x] 4.2 Derive Browser tabs from the registry (`syncBrowserTabsForSession`), reveal new pages once per session view, keep activity only for the agent-active border and target activation
- [x] 4.3 Update bridge helpers (`createAgentBrowserPage(owner)`, `listAgentBrowserPages`, `agentBrowserOwnerForSession`) and the architecture contract tests

## 5. Verification and docs

- [x] 5.1 Build `acecode-desktop` and `acecode_unit_tests`, run the Agent Browser unit tests and the Windows smoke
- [x] 5.2 Run the Web test suite and production build
- [x] 5.3 Document the ownership model in `docs/agent-browser.md` and `CLAUDE.md`
