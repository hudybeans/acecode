// Agent Browser 页面归属登记表(lib/agentBrowserPages.js)的纯逻辑与 store 测试。
//
// 场景:
// 1. 状态事件 → 记录:owner 解析、closed 删除、未变化不产生新状态。
// 2. 按会话取页面:子代理页面(root_session_id 指向父)归到父会话。
// 3. 对账:给了 sessionId 只替换该会话的 native 页面;全量对账替换全部。
// 4. 旧版 Desktop 无 owner 事件的本地认领,以及本地认领不被后续无 owner 事件冲掉。
// 5. Agent 默认目标页按会话隔离。
// 6. App 级监听器把 window 事件写进 store;reconcile 走 bridge 并按 ok 门控。
import assert from 'node:assert/strict';
import {
  EMPTY_AGENT_BROWSER_PAGES,
  agentBrowserOwnerFromState,
  agentBrowserPagesForSession,
  agentBrowserSessionTargetPageId,
  claimUnownedAgentBrowserPage,
  createAgentBrowserPageStore,
  installAgentBrowserPageListener,
  normalizeAgentBrowserPageRecord,
  reconcileAgentBrowserPageStore,
  reconcileAgentBrowserPages,
  reduceAgentBrowserPageState,
} from './agentBrowserPages.js';
import { AGENT_BROWSER_STATE_EVENT } from './agentBrowser.js';

async function run(name, fn) {
  try {
    await fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function pageEvent(pageId, overrides = {}) {
  return {
    page_id: pageId,
    title: `title-${pageId}`,
    favicon: '',
    url: `https://${pageId}.example/`,
    active: false,
    closed: false,
    agent_target: false,
    shared_with_agent: true,
    content_state: 'live',
    owner: { session_id: 'sess-a', workspace_hash: 'ws-1', root_session_id: 'sess-a' },
    ...overrides,
  };
}

await run('native owner parsing keeps session id as the join key and defaults root to itself', () => {
  assert.deepEqual(agentBrowserOwnerFromState(pageEvent('p1')), {
    sessionId: 'sess-a', workspaceHash: 'ws-1', rootSessionId: 'sess-a',
  });
  assert.deepEqual(
    agentBrowserOwnerFromState({ owner: { session_id: 'child', root_session_id: 'parent' } }),
    { sessionId: 'child', workspaceHash: '', rootSessionId: 'parent' },
  );
  assert.equal(agentBrowserOwnerFromState({ owner: null }), null);
  assert.equal(agentBrowserOwnerFromState({ owner: { workspace_hash: 'x' } }), null);
  assert.equal(normalizeAgentBrowserPageRecord({}), null);
});

await run('state events add, update and remove records without churning unchanged state', () => {
  let state = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, pageEvent('p1'));
  assert.deepEqual(state.order, ['p1']);
  assert.equal(state.pages.p1.sessionId, 'sess-a');
  assert.equal(state.pages.p1.ownerSource, 'native');
  // 同一份快照再来一次不产生新对象(useSyncExternalStore 依赖引用稳定)。
  assert.equal(reduceAgentBrowserPageState(state, pageEvent('p1')), state);
  const retitled = reduceAgentBrowserPageState(state, pageEvent('p1', { title: '百度一下' }));
  assert.notEqual(retitled, state);
  assert.equal(retitled.pages.p1.title, '百度一下');
  const closed = reduceAgentBrowserPageState(retitled, { page_id: 'p1', closed: true });
  assert.deepEqual(closed.order, []);
  assert.equal(closed.pages.p1, undefined);
  // 未知页面的 closed 与没有 page_id 的事件都是 no-op。
  assert.equal(reduceAgentBrowserPageState(closed, { page_id: 'zzz', closed: true }), closed);
  assert.equal(reduceAgentBrowserPageState(closed, { title: 'x' }), closed);
});

await run('pages resolve to their session and sub-agent pages surface under the parent', () => {
  let state = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, pageEvent('p1'));
  state = reduceAgentBrowserPageState(state, pageEvent('p2', {
    owner: { session_id: 'sess-b', workspace_hash: 'ws-1', root_session_id: 'sess-b' },
  }));
  state = reduceAgentBrowserPageState(state, pageEvent('p3', {
    owner: { session_id: 'child-of-a', workspace_hash: 'ws-1', root_session_id: 'sess-a' },
  }));
  assert.deepEqual(agentBrowserPagesForSession(state, 'sess-a').map((p) => p.pageId), ['p1', 'p3']);
  assert.deepEqual(agentBrowserPagesForSession(state, 'sess-b').map((p) => p.pageId), ['p2']);
  assert.deepEqual(agentBrowserPagesForSession(state, 'child-of-a').map((p) => p.pageId), ['p3']);
  assert.deepEqual(agentBrowserPagesForSession(state, ''), []);
});

await run('reconciling with a native listing drops vanished pages only within the requested scope', () => {
  let state = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, pageEvent('p1'));
  state = reduceAgentBrowserPageState(state, pageEvent('p2'));
  state = reduceAgentBrowserPageState(state, pageEvent('p9', {
    owner: { session_id: 'sess-b', workspace_hash: 'ws-1', root_session_id: 'sess-b' },
  }));
  // 只对账 sess-a:p2 已不在 native 列表 → 删除;p9 属于 sess-b,不受影响。
  const scoped = reconcileAgentBrowserPages(state, [pageEvent('p1', { title: 'fresh' })], { sessionId: 'sess-a' });
  assert.deepEqual(scoped.order, ['p1', 'p9']);
  assert.equal(scoped.pages.p1.title, 'fresh');
  // 全量对账:列表之外的一律删除,新页面按列表顺序补进来。
  const full = reconcileAgentBrowserPages(scoped, [pageEvent('p9', {
    owner: { session_id: 'sess-b' },
  }), pageEvent('p10')]);
  assert.deepEqual(full.order, ['p9', 'p10']);
  assert.equal(full.pages.p9.rootSessionId, 'sess-b');
  // 列表里重复 / 无 id 的条目忽略。
  const dedup = reconcileAgentBrowserPages(EMPTY_AGENT_BROWSER_PAGES, [pageEvent('x'), pageEvent('x'), { title: 'no id' }]);
  assert.deepEqual(dedup.order, ['x']);
});

await run('legacy desktops without owners fall back to a local claim that later events cannot erase', () => {
  const legacyEvent = pageEvent('p1', { owner: undefined, active: true });
  let state = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, legacyEvent);
  assert.equal(state.pages.p1.sessionId, '');
  assert.deepEqual(agentBrowserPagesForSession(state, 'sess-a'), []);
  state = claimUnownedAgentBrowserPage(state, 'p1', 'sess-a', 'ws-1');
  assert.equal(state.pages.p1.sessionId, 'sess-a');
  assert.equal(state.pages.p1.ownerSource, 'local');
  assert.equal(state.pages.p1.workspaceHash, 'ws-1');
  // 之后又来一条无 owner 的快照(标题变了):归属保留,标题更新。
  state = reduceAgentBrowserPageState(state, pageEvent('p1', { owner: undefined, title: 'loaded' }));
  assert.equal(state.pages.p1.sessionId, 'sess-a');
  assert.equal(state.pages.p1.title, 'loaded');
  // native 已归属别的会话的页面不能被本地认领抢走。
  const owned = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, pageEvent('p2'));
  assert.equal(claimUnownedAgentBrowserPage(owned, 'p2', 'sess-b'), owned);
  // 认领一个登记表里还没有的页面会建一条最小记录。
  const fresh = claimUnownedAgentBrowserPage(EMPTY_AGENT_BROWSER_PAGES, 'p3', 'sess-c');
  assert.deepEqual(fresh.order, ['p3']);
  assert.equal(fresh.pages.p3.rootSessionId, 'sess-c');
});

await run('agent target lookup is per session', () => {
  let state = reduceAgentBrowserPageState(EMPTY_AGENT_BROWSER_PAGES, pageEvent('p1', { agent_target: true }));
  state = reduceAgentBrowserPageState(state, pageEvent('p2', {
    agent_target: true,
    owner: { session_id: 'sess-b', workspace_hash: 'ws-1', root_session_id: 'sess-b' },
  }));
  assert.equal(agentBrowserSessionTargetPageId(state, 'sess-a'), 'p1');
  assert.equal(agentBrowserSessionTargetPageId(state, 'sess-b'), 'p2');
  assert.equal(agentBrowserSessionTargetPageId(state, 'sess-c'), '');
  // target 迁移:p1 的位翻掉、p3 成为新目标。
  state = reduceAgentBrowserPageState(state, pageEvent('p1', { agent_target: false }));
  state = reduceAgentBrowserPageState(state, pageEvent('p3', { agent_target: true }));
  assert.equal(agentBrowserSessionTargetPageId(state, 'sess-a'), 'p3');
});

await run('the app-level listener mirrors window events into the store exactly once', () => {
  const listeners = new Map();
  const win = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
  };
  const store = createAgentBrowserPageStore();
  const dispose = installAgentBrowserPageListener(win, store);
  const second = installAgentBrowserPageListener(win, store);
  assert.equal(listeners.size, 1, '重复安装不会挂第二个监听器');
  listeners.get(AGENT_BROWSER_STATE_EVENT)({ detail: pageEvent('p1') });
  listeners.get(AGENT_BROWSER_STATE_EVENT)({ detail: 'not-an-object' });
  assert.deepEqual(store.getState().order, ['p1']);
  second();
  assert.equal(listeners.size, 1, '第二次安装返回的空 dispose 不能拆掉真正的监听器');
  dispose();
  assert.equal(listeners.size, 0);
  // 拆掉之后可以重新安装(StrictMode 双调用 / 热重载)。
  const redo = installAgentBrowserPageListener(win, store);
  assert.equal(listeners.size, 1);
  redo();
});

await run('store reconciliation goes through the desktop bridge and is gated by ok', async () => {
  const store = createAgentBrowserPageStore();
  const calls = [];
  const win = {
    __ACECODE_DESKTOP_SHELL__: true,
    __ACECODE_OS__: 'windows',
    aceDesktop_agentBrowserGetState() {},
    aceDesktop_agentBrowserSetLayout() {},
    aceDesktop_agentBrowserCreatePage() {},
    aceDesktop_agentBrowserListPages(arg) {
      calls.push(arg);
      return JSON.stringify({ ok: true, pages: [pageEvent('p1'), pageEvent('p2')] });
    },
  };
  assert.equal(await reconcileAgentBrowserPageStore('sess-a', win, store), true);
  assert.deepEqual(calls, [{ session_id: 'sess-a' }]);
  assert.deepEqual(store.getState().order, ['p1', 'p2']);
  assert.equal(await reconcileAgentBrowserPageStore('', win, store), true);
  assert.deepEqual(calls[1], undefined, '全量对账不传 owner 参数');
  // 旧版 Desktop 没有 ListPages bridge → ok:false → 不动 store。
  const legacyWin = { ...win, aceDesktop_agentBrowserListPages: undefined };
  assert.equal(await reconcileAgentBrowserPageStore('sess-a', legacyWin, store), false);
  assert.deepEqual(store.getState().order, ['p1', 'p2']);
  // 非 Desktop 环境直接返回 false,不碰 bridge。
  assert.equal(await reconcileAgentBrowserPageStore('sess-a', {}, store), false);
});
