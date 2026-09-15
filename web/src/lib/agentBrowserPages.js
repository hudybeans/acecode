// Agent Browser 页面归属登记表(App 级单写者 store)。
//
// 页面属于哪个会话由 Desktop host 决定:每条 `acecode:agent-browser-state` 事件与
// `aceDesktop_agentBrowserListPages` 的结果都带 `owner`。这里只是前端镜像,随时能
// 回答「会话 X 拥有哪些页面、哪一页是 Agent 的默认目标」,并且**不依赖当前正在
// 渲染哪个会话**。ChatView 从它派生浏览器页签。
//
// 曾经的做法是 ChatView 只在「当前 transcript 里有正在执行的 browser_* 工具」那
// 一瞬间认领页面:用户在工具执行期间切走会话,事件无人接收,页面成了孤儿;切回
// 来时工具已结束,页签永远不出现(会话 20260915-120207-bdf9 的复现)。
import { createSingleWriterStore } from './singleWriterStore.js';
import {
  AGENT_BROWSER_STATE_EVENT,
  hasNativeAgentBrowser,
  listAgentBrowserPages,
} from './agentBrowser.js';

export const EMPTY_AGENT_BROWSER_PAGES = Object.freeze({
  order: Object.freeze([]),
  pages: Object.freeze({}),
});

const RECORD_FIELDS = [
  'pageId',
  'sessionId',
  'workspaceHash',
  'rootSessionId',
  'ownerSource',
  'title',
  'favicon',
  'url',
  'agentTarget',
  'active',
  'sharedWithAgent',
  'contentState',
];

function stringField(value) {
  return value == null ? '' : String(value);
}

export function agentBrowserOwnerFromState(detail = {}) {
  const owner = detail?.owner;
  if (!owner || typeof owner !== 'object') return null;
  const sessionId = stringField(owner.session_id).trim();
  if (!sessionId) return null;
  return {
    sessionId,
    workspaceHash: stringField(owner.workspace_hash).trim(),
    rootSessionId: stringField(owner.root_session_id).trim() || sessionId,
  };
}

// 把一条 native 状态快照归一成登记表记录。native 快照是完整的,所以字段整体
// 覆盖;唯一例外是「本地认领」的归属:旧版 Desktop 的事件不带 owner,不能让它把
// 前端已认领的会话冲掉。
export function normalizeAgentBrowserPageRecord(detail = {}, previous = null) {
  const pageId = stringField(detail?.page_id || detail?.pageId).trim();
  if (!pageId) return null;
  const owner = agentBrowserOwnerFromState(detail);
  const keepLocalOwner = !owner && previous?.ownerSource === 'local';
  return {
    pageId,
    sessionId: owner ? owner.sessionId : (keepLocalOwner ? previous.sessionId : ''),
    workspaceHash: owner ? owner.workspaceHash : (keepLocalOwner ? previous.workspaceHash : ''),
    rootSessionId: owner ? owner.rootSessionId : (keepLocalOwner ? previous.rootSessionId : ''),
    ownerSource: owner ? 'native' : (keepLocalOwner ? 'local' : ''),
    title: stringField(detail?.title),
    favicon: stringField(detail?.favicon),
    url: stringField(detail?.url),
    agentTarget: detail?.agent_target === true,
    active: detail?.active === true,
    sharedWithAgent: detail?.shared_with_agent === true,
    contentState: stringField(detail?.content_state),
  };
}

function sameRecord(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return RECORD_FIELDS.every((field) => a[field] === b[field]);
}

function withRecord(state, record) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  const previous = source.pages?.[record.pageId];
  if (sameRecord(previous, record)) return source;
  const order = previous ? source.order : [...(source.order || []), record.pageId];
  return {
    order,
    pages: { ...(source.pages || {}), [record.pageId]: record },
  };
}

function withoutPage(state, pageId) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  if (!source.pages?.[pageId]) return source;
  const pages = { ...source.pages };
  delete pages[pageId];
  return {
    order: (source.order || []).filter((id) => id !== pageId),
    pages,
  };
}

// 单条状态事件 → 登记表。closed 事件删除记录;其它事件整体覆盖。
export function reduceAgentBrowserPageState(state, detail) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  if (!detail || typeof detail !== 'object') return source;
  const pageId = stringField(detail.page_id || detail.pageId).trim();
  if (!pageId) return source;
  if (detail.closed === true) return withoutPage(source, pageId);
  const record = normalizeAgentBrowserPageRecord(detail, source.pages?.[pageId] || null);
  return record ? withRecord(source, record) : source;
}

// 用 native 的完整列表对账:给了 sessionId 只替换该会话(native 归属)的页面,
// 否则替换全部。列表里没有的页面视为已关闭。本地认领的页面(旧版 Desktop)在
// 全量对账时按 native 未绑定处理,但保留认领。
export function reconcileAgentBrowserPages(state, pages = [], { sessionId = '' } = {}) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  const listed = [];
  const listedIds = new Set();
  for (const page of Array.isArray(pages) ? pages : []) {
    const pageId = stringField(page?.page_id || page?.pageId).trim();
    if (!pageId || listedIds.has(pageId)) continue;
    listedIds.add(pageId);
    listed.push(page);
  }
  let next = source;
  for (const pageId of source.order || []) {
    if (listedIds.has(pageId)) continue;
    const record = source.pages?.[pageId];
    if (!record) continue;
    const scoped = !sessionId
      || (record.ownerSource === 'native' && record.sessionId === sessionId);
    if (scoped) next = withoutPage(next, pageId);
  }
  for (const page of listed) {
    const pageId = stringField(page?.page_id || page?.pageId).trim();
    const record = normalizeAgentBrowserPageRecord(page, next.pages?.[pageId] || null);
    if (record) next = withRecord(next, record);
  }
  return next;
}

// 旧版 Desktop 不带 owner 时,由正在渲染的会话在「有浏览器工具正在执行」的前提下
// 认领页面。只对未绑定页面生效,不会抢走 native 已归属的页面。
export function claimUnownedAgentBrowserPage(state, pageId, sessionId, workspaceHash = '') {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  const id = stringField(pageId).trim();
  const sid = stringField(sessionId).trim();
  if (!id || !sid) return source;
  const previous = source.pages?.[id];
  if (previous && previous.sessionId && previous.sessionId !== sid) return source;
  const record = {
    ...(previous || normalizeAgentBrowserPageRecord({ page_id: id })),
    sessionId: sid,
    workspaceHash: stringField(workspaceHash),
    rootSessionId: sid,
    ownerSource: 'local',
  };
  return withRecord(source, record);
}

// 会话拥有的页面(按登记顺序)。子代理开的页面 root_session_id 指向父会话,
// 因此父会话的页签里也能看到它们。
export function agentBrowserPagesForSession(state, sessionId) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  const sid = stringField(sessionId).trim();
  if (!sid) return [];
  const result = [];
  for (const pageId of source.order || []) {
    const record = source.pages?.[pageId];
    if (!record) continue;
    if (record.sessionId === sid || record.rootSessionId === sid) result.push(record);
  }
  return result;
}

// 该会话自己的 Agent 默认目标页(工具省略 page_id 时会落到的那一页)。
export function agentBrowserSessionTargetPageId(state, sessionId) {
  const source = state && typeof state === 'object' ? state : EMPTY_AGENT_BROWSER_PAGES;
  const sid = stringField(sessionId).trim();
  if (!sid) return '';
  for (const pageId of source.order || []) {
    const record = source.pages?.[pageId];
    if (record?.agentTarget && record.sessionId === sid) return pageId;
  }
  return '';
}

export function createAgentBrowserPageStore(initial = EMPTY_AGENT_BROWSER_PAGES) {
  return createSingleWriterStore(initial);
}

let sharedStore = null;

export function agentBrowserPageStore() {
  if (!sharedStore) sharedStore = createAgentBrowserPageStore();
  return sharedStore;
}

export function agentBrowserPageStoreSubscribe(listener) {
  return agentBrowserPageStore().subscribe(listener);
}

export function agentBrowserPageStoreSnapshot() {
  return agentBrowserPageStore().getState();
}

let installedListener = null;

// 在 App 挂载时装一次:不管用户正在看哪个会话,所有 native 状态事件都进登记表。
export function installAgentBrowserPageListener(win = globalThis.window, store = agentBrowserPageStore()) {
  if (!win?.addEventListener || installedListener) return () => {};
  const handler = (event) => {
    const detail = event?.detail;
    if (!detail || typeof detail !== 'object') return;
    store.commit((state) => reduceAgentBrowserPageState(state, detail));
  };
  win.addEventListener(AGENT_BROWSER_STATE_EVENT, handler);
  installedListener = { win, handler };
  return () => {
    if (installedListener?.handler !== handler) return;
    win.removeEventListener(AGENT_BROWSER_STATE_EVENT, handler);
    installedListener = null;
  };
}

// 向 Desktop 要一次完整列表并对账。页面刷新 / 切工作区 / 切会话时调用:native
// 页面池比前端状态活得久,这是把它们找回来的唯一途径。
export async function reconcileAgentBrowserPageStore(
  sessionId = '',
  win = globalThis.window,
  store = agentBrowserPageStore(),
) {
  if (!hasNativeAgentBrowser(win)) return false;
  const result = await listAgentBrowserPages(sessionId, win);
  if (result?.ok !== true || !Array.isArray(result.pages)) return false;
  store.commit((state) => reconcileAgentBrowserPages(state, result.pages, { sessionId }));
  return true;
}
