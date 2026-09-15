## ADDED Requirements

### Requirement: Browser pages are owned by the session that created them
The Desktop host SHALL record an owner (`session_id`, optional `workspace_hash` and `root_session_id`) on every Agent Browser page created through the daemon proxy or the UI bridge, expose it in every page state snapshot, and list pages filtered by owner session on request. `session_id` is the only join key.

#### Scenario: Agent opens a page while the user is viewing another session
- **WHEN** session A calls `browser_open` while the Web UI displays session B
- **THEN** the page is recorded with owner A, session B's displayed page is not changed, and when the user returns to session A its Browser tab exists and is activated

#### Scenario: Web UI reloads or switches workspace
- **WHEN** the Web UI mounts again while native pages still exist
- **THEN** it reconciles the page registry from the host listing and rebuilds each session's Browser tabs from their owners

#### Scenario: Sub-agent opens a page
- **WHEN** a sub-agent session calls `browser_open`
- **THEN** the page owner is the sub-agent session with `root_session_id` set to the parent, and the parent session's tab list shows the page

### Requirement: Displayed page and per-session agent target are independent
The Desktop host SHALL keep one displayed page (set only by the UI or by close fallback) and one agent target page per owner session. Creating a page for an owner SHALL update that owner's agent target without changing the displayed page.

#### Scenario: Tool omits page_id
- **WHEN** a browser tool with an owner omits `page_id`
- **THEN** the host resolves the owner's agent target page, otherwise the displayed page only if it belongs to the same session, otherwise creates a new page for that owner; it never resolves to another session's page

#### Scenario: Explicit page_id across sessions
- **WHEN** a tool passes an explicit `page_id` owned by another session that is shared with the Agent
- **THEN** the request is served and the caller session's agent target moves to that page

#### Scenario: Displayed page closes
- **WHEN** the displayed page is closed
- **THEN** the host prefers the most recent page of the same session as the next displayed page, then the most recent page overall

### Requirement: Legacy requests keep the pre-ownership behavior
Proxy requests without `owner` and state events without `owner` SHALL behave as before ownership existed: the displayed page is the default tool target, and the Web UI claims pages only while the displayed session has a live browser tool, without overriding a native owner.

#### Scenario: Old daemon talks to new Desktop
- **WHEN** a proxy request carries no owner and no page_id
- **THEN** the displayed page is used, or a new displayed page is created

### Requirement: Protocol version identifies the ownership contract
The runtime manifest protocol version SHALL be 5 for hosts that implement page ownership, and daemons SHALL reject manifests with a different protocol version.

#### Scenario: Mismatched versions
- **WHEN** the manifest protocol version differs from the daemon's expected version
- **THEN** browser tools report the manifest as unusable instead of guessing the ownership semantics
