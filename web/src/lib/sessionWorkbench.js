// 一个浏览窗口中的会话工作状态。身份独立于 cwd，异步 setter 始终绑定发起者。
const STORAGE_KEY = 'acecode.sessionWorkbench.v1';

function encode(_key, value) {
  if (value instanceof Map) return { $workbenchType: 'Map', entries: [...value] };
  if (value instanceof Set) return { $workbenchType: 'Set', entries: [...value] };
  return value;
}

function decode(_key, value) {
  if (value?.$workbenchType === 'Map' && Array.isArray(value.entries)) return new Map(value.entries);
  if (value?.$workbenchType === 'Set' && Array.isArray(value.entries)) return new Set(value.entries);
  if (value && typeof value === 'object' && 'baselineText' in value && 'text' in value) {
    return { ...value, saving: false, loading: false };
  }
  return value;
}

export function createSessionWorkbench({ storage, newId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` } = {}) {
  let records = new Map();
  let drafts = new Map();
  let redirects = new Map();
  const listeners = new Set();
  let persistTimer;
  let version = 0;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null', decode);
    if (saved?.records instanceof Map && saved?.drafts instanceof Map && saved?.redirects instanceof Map) {
      ({ records, drafts, redirects } = saved);
      // Widths belong to the global layout preference, including for old sessions.
      for (const record of records.values()) delete record.layout;
    }
  } catch { /* 不可用或损坏的浏览存储不影响当前窗口。 */ }

  const resolve = (owner) => {
    const visited = new Set();
    while (redirects.has(owner) && !visited.has(owner)) {
      visited.add(owner);
      owner = redirects.get(owner);
    }
    return owner;
  };
  const flush = () => {
    clearTimeout(persistTimer);
    persistTimer = undefined;
    if (!storage) return;
    try {
      // $ 前缀为运行时对象（请求、Git 缓存等），不序列化函数或连接。
      const persisted = new Map([...records].map(([owner, record]) => [owner,
        Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('$'))),
      ]));
      storage.setItem(STORAGE_KEY, JSON.stringify({ records: persisted, drafts, redirects }, encode));
    } catch { /* 容量不足时仍保留内存状态。 */ }
  };
  const changed = () => {
    version += 1;
    if (storage && persistTimer === undefined) persistTimer = setTimeout(flush, 150);
    for (const listener of listeners) listener();
  };
  const recordFor = (owner) => {
    const key = resolve(owner);
    if (!records.has(key)) records.set(key, {});
    return records.get(key);
  };

  return {
    resolve,
    flush,
    version: () => version,
    entries(field) { return [...records].filter(([, record]) => Object.hasOwn(record, field))
      .map(([owner, record]) => [owner, record[field]]); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ownerFor(ref = {}) {
      const sid = ref?.sessionId || ref?.session_id || ref?.id;
      if (sid) return `session:${sid}`;
      const homeKey = JSON.stringify([
        ref?.workspaceHash || ref?.workspace_hash || ref?.hash || '',
        ref?.composerDraftScope || (ref?.loop ? 'loops' : ref?.expertComponents ? 'experts' : 'home'),
      ]);
      if (!drafts.has(homeKey)) {
        drafts.set(homeKey, `draft:${newId()}`);
        if (storage && persistTimer === undefined) persistTimer = setTimeout(flush, 150);
      }
      return drafts.get(homeKey);
    },
    get(owner, field, initial) {
      const record = recordFor(owner);
      if (!Object.hasOwn(record, field)) record[field] = typeof initial === 'function' ? initial() : initial;
      return record[field];
    },
    set(owner, field, updater, initial) {
      const record = recordFor(owner);
      const previous = this.get(owner, field, initial);
      const next = typeof updater === 'function' ? updater(previous) : updater;
      if (Object.is(previous, next)) return previous;
      record[field] = next;
      changed();
      return next;
    },
    transfer(from, to, transform = (record) => record) {
      if (!from.startsWith('draft:') || !to.startsWith('session:') || redirects.has(from)) return false;
      // 只移交给刚创建的会话，不能覆盖已有会话的任何状态。
      if (records.has(to)) return false;
      records.set(to, transform(records.get(from) || {}));
      records.delete(from);
      redirects.set(from, to);
      for (const [key, owner] of drafts) if (owner === from) drafts.delete(key);
      changed();
      return true;
    },
  };
}

let browserStorage;
try { browserStorage = globalThis.sessionStorage; } catch {}
export const sessionWorkbench = createSessionWorkbench({ storage: browserStorage });
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => sessionWorkbench.flush());
