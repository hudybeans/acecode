import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setImmediate as nextTask } from 'node:timers/promises';
import { parseSync } from '@babel/core';
import * as workspaceSessions from './sidebarWorkspaceSessions.js';
import * as sidebarSessions from './sidebarSessions.js';
import * as pinnedSessions from './pinnedSessions.js';
import * as auxiliaryFetch from './sidebarAuxiliaryFetch.js';
import { applyStatusUpdate } from './sessionStatus.js';

// Execute the production callbacks, including the await boundaries and state
// setters. Testing only the sequence helper cannot expose a check before a later
// await, or a background request invalidating a pending user full-list request.
const source = readFileSync(new URL('../components/Sidebar.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const component = ast.program.body.map((node) => node.declaration || node)
  .find((node) => node.id?.name === 'Sidebar');
assert.ok(component, 'Missing production Sidebar');
const declarations = component.body.body.flatMap((statement) => statement.declarations || []);

function installCallback(context, name) {
  const declaration = declarations.find((node) => node.id.name === name);
  assert.equal(declaration?.init.callee?.name, 'useCallback', `Missing production callback ${name}`);
  const callback = declaration.init.arguments[0];
  vm.runInContext(`${name} = (${source.slice(callback.start, callback.end)})`, context);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function sessions(count, prefix = 'session') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`, workspace_hash: 'w', title: `${prefix} ${i}`,
    updated_at: new Date(Date.UTC(2026, 8, 20, 0, count - i)).toISOString(),
  }));
}

const compactPage = () => ({ sessions: sessions(5), total: 20, has_more: true });

function fixture({ initialSessions = sessions(5), loaded = true, noWorkspace, pinned } = {}) {
  const workspace = { hash: 'w', cwd: '/fixture', active: true };
  const state = {
    sessions: initialSessions,
    loading: new Set(), loaded: new Set(loaded ? ['w'] : []), fullyLoaded: new Set(),
    totals: new Map(), statuses: new Map(), workspaces: [workspace],
  };
  const requests = [];
  const context = vm.createContext({
    Map, Set, Array, Promise, setTimeout,
    ...workspaceSessions, ...sidebarSessions, ...pinnedSessions, ...auxiliaryFetch,
    applyStatusUpdate,
    workspaces: state.workspaces, activeWorkspaceHash: 'w',
    revealTarget: { noWorkspace: false, workspaceHash: 'w' },
    api: {
      listWorkspaces: async () => [workspace],
      listSessions: () => noWorkspace?.promise || Promise.resolve([]),
      listWorkspaceSessions: (hash, query) => {
        const request = { hash, query, ...deferred() };
        requests.push(request);
        return request.promise;
      },
      getPinnedSessions: () => pinned?.promise || Promise.resolve({ session_ids: [] }),
      getNoWorkspacePinnedSessions: async () => ({ session_ids: [] }),
      getPinnedSessionOrder: async () => ({ items: [] }),
    },
    hasDesktopBridge: () => false,
    desktopTaskbarBadge: { retainWorkspaces() {}, replaceScope() {} },
    desktopTaskbarBadgeAvailable: () => false,
    connection: { subscribeWorkspaceStatus() {} },
    refreshOpencodeImportPreview: async () => {},
    syncRetainedSessionIds() {}, cancelSessionSelection() {}, onOpenHome() {},
    setExpandedSessionLists() {},
    setPinnedMap: (value) => { context.pinnedByWorkspaceRef.current = value; },
    setPinnedOrder: (value) => { context.pinnedOrderItemsRef.current = value; },
    updateExpanded: (updater) => { context.expandedRef.current = updater(context.expandedRef.current); },
    setActiveWorkspaceHash: (value) => { context.activeWorkspaceHash = value; },
  });
  const refs = {
    sessionsRef: state.sessions,
    sessionLoadedWorkspacesRef: state.loaded,
    sessionFullyLoadedWorkspacesRef: state.fullyLoaded,
    workspaceSessionLoadSeqRef: new Map(),
    pendingFullWorkspaceLoadsRef: new Map(),
    refreshingRef: false, pendingRefreshHashRef: '',
    expandedRef: new Set(['w']),
    workspaceCollapseAllRef: false, userCollapsedWorkspacesRef: new Set(),
    sessionListDisclosureCompactRef: new Set(),
    opencodePreviewProbedRef: new Set(),
    pinnedByWorkspaceRef: new Map(), pinnedOrderItemsRef: [],
  };
  for (const [name, current] of Object.entries(refs)) context[name] = { current };
  for (const [setter, key, ref] of [
    ['setSessions', 'sessions', 'sessionsRef'],
    ['setSessionLoadingWorkspaces', 'loading'],
    ['setSessionLoadedWorkspaces', 'loaded', 'sessionLoadedWorkspacesRef'],
    ['setSessionFullyLoadedWorkspaces', 'fullyLoaded', 'sessionFullyLoadedWorkspacesRef'],
    ['setSessionListTotals', 'totals'],
    ['setStatusBySession', 'statuses'],
    ['setWorkspaces', 'workspaces'],
  ]) {
    context[setter] = (update) => {
      state[key] = typeof update === 'function' ? update(state[key]) : update;
      if (ref) context[ref].current = state[key];
      if (key === 'workspaces') context.workspaces = state[key];
    };
  }
  for (const name of ['isNoWorkspaceSession', 'normalizeNoWorkspaceSession', 'normalizeWorkspaceSession']) {
    const node = ast.program.body.find((item) => item.type === 'FunctionDeclaration' && item.id.name === name);
    assert.ok(node, `Missing production helper ${name}`);
    vm.runInContext(source.slice(node.start, node.end), context);
  }
  for (const name of [
    'setSessionWorkspaceLoading', 'setSessionWorkspacesLoaded', 'markWorkspaceSessionsFullyLoaded',
    'applyWorkspaceSessionList', 'loadWorkspaceSessions', 'refresh', 'onActivate',
  ]) installCallback(context, name);
  return { context, state, requests, workspace };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('an old compact result cannot overwrite a full load while waiting for no-workspace sessions', async () => {
  const noWorkspace = deferred();
  const { context, state, requests } = fixture({ noWorkspace });
  const refresh = context.refresh();
  await nextTask();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].query.limit, 5);
  requests[0].resolve({ ...compactPage(), total: 99 });
  await nextTask();
  const full = context.loadWorkspaceSessions('w', { full: true });
  requests[1].resolve(sessions(20));
  await full;
  assert.equal(state.sessions.length, 20, 'user full load commits before the old refresh resumes');
  noWorkspace.resolve([]);
  await refresh;
  assert.equal(state.sessions.length, 20);
  assert.equal(state.totals.get('w'), 20);
  assert.equal(state.fullyLoaded.has('w'), true);
});

test('a periodic refresh reuses a pending user full load instead of superseding it with five rows', async () => {
  const { context, state, requests } = fixture();
  const full = context.loadWorkspaceSessions('w', { full: true });
  const refresh = context.refresh();
  await nextTask();
  // Resolve a compact request too on the unfixed PR, exposing the resulting
  // five-row list without hanging the regression test.
  requests.slice(1).forEach((request) => request.resolve(compactPage()));
  requests[0].resolve(sessions(20));
  await Promise.all([full, refresh]);
  assert.equal(state.sessions.length, 20);
  assert.equal(state.fullyLoaded.has('w'), true);
  assert.equal(requests.length, 1, 'background refresh must share the full request');
});

test('reactivating an already loaded empty workspace exits loading after the current request settles', async () => {
  const { context, state, requests, workspace } = fixture({ initialSessions: [] });
  const productionRefresh = context.refresh;
  let refresh;
  context.refresh = (...args) => { refresh = productionRefresh(...args); return refresh; };
  await context.onActivate(workspace);
  await nextTask();
  assert.equal(state.loading.has('w'), true);
  assert.equal(requests.length, 1);
  requests[0].resolve([]);
  await refresh;
  assert.equal(state.loading.has('w'), false);
  assert.equal(state.loaded.has('w'), true);
  assert.equal(state.sessions.length, 0);
});

test('an old refresh cannot clear the loading indicator of a newer pending full request', async () => {
  const { context, state, requests } = fixture({ initialSessions: [], loaded: false });
  const refresh = context.refresh();
  await nextTask();
  const full = context.loadWorkspaceSessions('w', { full: true });
  requests[0].resolve(compactPage());
  await refresh;
  assert.equal(state.loading.has('w'), true, 'new full request still owns loading');
  requests[1].resolve(sessions(20));
  await full;
  assert.equal(state.loading.has('w'), false);
  assert.equal(state.sessions.length, 20);
});

test('a failed current request also clears activation loading for an already loaded empty workspace', async () => {
  const { context, state, requests, workspace } = fixture({ initialSessions: [] });
  const productionRefresh = context.refresh;
  let refresh;
  context.refresh = (...args) => { refresh = productionRefresh(...args); return refresh; };
  await context.onActivate(workspace);
  await nextTask();
  assert.equal(requests.length, 1);
  requests[0].reject(new Error('unavailable'));
  await refresh;
  assert.equal(state.loading.has('w'), false);
  assert.equal(state.loaded.has('w'), true);
  assert.equal(state.sessions.length, 0);
});

test('a failed shared full request retains cached rows and permits a later retry', async () => {
  const { context, state, requests } = fixture();
  const full = context.loadWorkspaceSessions('w', { full: true });
  const refresh = context.refresh();
  await nextTask();
  requests.slice(1).forEach((request) => request.reject(new Error('unavailable')));
  requests[0].reject(new Error('unavailable'));
  await Promise.all([full, refresh]);
  assert.equal(state.sessions.length, 5);
  assert.equal(state.fullyLoaded.has('w'), false);
  assert.equal(state.loading.has('w'), false);
  const beforeRetry = requests.length;
  const retry = context.loadWorkspaceSessions('w', { full: true });
  assert.equal(requests.length, beforeRetry + 1);
  requests.at(-1).resolve(sessions(20));
  await retry;
  assert.equal(state.sessions.length, 20);
  assert.equal(state.fullyLoaded.has('w'), true);
});

test('settling an earlier full request does not remove a later full request from refresh sharing', async () => {
  const { context, state, requests } = fixture();
  const first = context.loadWorkspaceSessions('w', { full: true });
  const second = context.loadWorkspaceSessions('w', { full: true });
  requests[0].resolve(sessions(10));
  await first;
  assert.equal(state.sessions.length, 5, 'superseded full result is discarded');
  const refresh = context.refresh();
  await nextTask();
  requests.slice(2).forEach((request) => request.resolve(compactPage()));
  requests[1].resolve(sessions(20));
  await Promise.all([second, refresh]);
  assert.equal(state.sessions.length, 20);
  assert.equal(requests.length, 2, 'refresh shares the second full request');
});

test('visible session requests still start before slow pinned metadata resolves', async () => {
  const pinned = deferred();
  const { context, state, requests } = fixture({ pinned });
  const refresh = context.refresh();
  await nextTask();
  assert.equal(requests.length, 1, 'retain the early request benefit of PR #64');
  requests[0].resolve(compactPage());
  pinned.resolve({ session_ids: [] });
  await refresh;
  assert.equal(state.sessions.length, 5);
  assert.equal(state.totals.get('w'), 20);
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`[pass] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[fail] ${name}\n${error.stack}`);
  }
}
assert.equal(failures, 0, `${failures} sidebar request timing regressions`);
