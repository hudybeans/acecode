import { apiConnectionScope } from './api.js';

function settingsError(error, action, patch, source = 'user') {
  const status = error?.status;
  let code = error?.code;
  if (status === 404 || status === 405) code = 'COMPUTER_USE_SETTINGS_UNSUPPORTED';
  else if (status === 401 || status === 403) code = 'COMPUTER_USE_SETTINGS_AUTH_REQUIRED';
  else if (status >= 500 && (!code || code === 'UNAVAILABLE')) code = 'COMPUTER_USE_SETTINGS_UNAVAILABLE';
  return { code, status, action, patch, source, enabled: patch?.enabled };
}

function normalizedSnapshot(snapshot) {
  return { ...snapshot, pointer_style: snapshot.pointer_style || 'ace',
    pointer_color: (snapshot.pointer_color || '#2563eb').toLowerCase() };
}

const matches = (snapshot, patch) => snapshot && Object.entries(patch).every(([key, value]) => snapshot[key] === value);
const stores = new WeakMap();

// Render acknowledged values only. All patches share one queue, including theme
// changes from the app shell, and remain scoped to their original daemon.
export function computerUseSettingsStore(client) {
  const scope = apiConnectionScope(client);
  if (stores.has(scope)) return stores.get(scope);
  let state = { snapshot: null, loading: false, saving: false, error: null };
  let reading = null;
  let writing = null;
  let latestColor = null;
  const queue = [];
  const failures = { user: null, color: null, load: null };
  const listeners = new Set();
  const publish = (patch = {}) => {
    state = { ...state, ...patch, error: failures.user || failures.color || failures.load };
    for (const listener of listeners) listener();
  };
  const requireConnection = () => {
    if (apiConnectionScope(client) !== scope) throw new Error('Computer use settings connection changed');
  };
  const acknowledge = (patch, source) => {
    const failed = failures[source];
    if (failed) {
      const remaining = Object.fromEntries(Object.entries(failed.patch).filter(([key]) => !(key in patch)));
      failures[source] = Object.keys(remaining).length ? { ...failed, patch: remaining, enabled: remaining.enabled } : null;
    }
    failures.load = null;
    publish();
  };
  const execute = async ({ patch, source, permission }) => {
    try {
      requireConnection();
      if (permission) {
        const snapshot = normalizedSnapshot(await client.requestComputerUsePermission(permission));
        requireConnection();
        publish({ snapshot });
        if (snapshot.availability?.error) throw Object.assign(new Error('Permission request failed'), { code: snapshot.availability.error });
        failures[source] = null;
        publish();
        return true;
      }
      if (!matches(state.snapshot, patch)) {
        const snapshot = normalizedSnapshot(await client.setComputerUse(patch));
        requireConnection();
        publish({ snapshot });
        if (!matches(snapshot, patch)) throw Object.assign(new Error('Computer use settings were not acknowledged'),
          { code: 'COMPUTER_USE_SETTINGS_UNCONFIRMED' });
      }
      acknowledge(patch, source);
      return true;
    } catch (error) {
      // Timeouts and mismatched acknowledgments both require a read-back; a
      // successful HTTP response alone does not confirm every requested field.
      try {
        requireConnection();
        const snapshot = normalizedSnapshot(await client.getComputerUse());
        requireConnection();
        publish({ snapshot });
        if (!permission && matches(snapshot, patch)) {
          acknowledge(patch, source);
          return true;
        }
      } catch { /* Retain the explicit failure and the last acknowledged state. */ }
      const pending = { ...failures[source]?.patch, ...patch };
      failures[source] = { ...settingsError(error, permission ? 'permission' : 'save', pending, source), permission };
      publish();
      return false;
    }
  };
  const drain = () => {
    if (writing) return;
    publish({ saving: true });
    writing = Promise.resolve().then(async () => {
      while (queue.length) {
        const job = queue.shift();
        job.resolve(await execute(job));
      }
    }).finally(() => {
      writing = null;
      publish({ saving: false });
      if (queue.length) drain();
    });
  };
  const enqueue = (patch, source = 'user', permission) => new Promise((resolve) => {
    queue.push({ patch: { ...patch }, source, permission, resolve });
    drain();
  });
  const store = {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    load: () => {
      if (reading) return reading;
      const priorWrite = writing;
      publish({ loading: true });
      reading = Promise.resolve().then(async () => {
        if (priorWrite) await priorWrite;
        try {
          requireConnection();
          const snapshot = normalizedSnapshot(await client.getComputerUse());
          requireConnection();
          failures.load = null;
          publish({ snapshot });
          return true;
        } catch (error) {
          failures.load = settingsError(error, 'load');
          publish();
          return false;
        } finally { publish({ loading: false }); }
      }).finally(() => { reading = null; });
      return reading;
    },
    setEnabled: (enabled) => {
      if (!state.snapshot || state.loading || (enabled && !state.snapshot.supported) || typeof enabled !== 'boolean') {
        return Promise.resolve(false);
      }
      return enqueue({ enabled });
    },
    setPointerStyle: (pointer_style) => {
      if (!state.snapshot || state.loading || !['ace', 'plain'].includes(pointer_style)) return Promise.resolve(false);
      return enqueue({ pointer_style });
    },
    requestPermission: (permission) => {
      if (!state.snapshot || state.loading || state.snapshot.platform !== 'macos' || !state.snapshot.supported ||
          !['accessibility', 'screen_recording'].includes(permission)) return Promise.resolve(false);
      return enqueue({}, 'user', permission);
    },
    syncPointerColor: async (color, { defer = false } = {}) => {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return false;
      latestColor = color.toLowerCase();
      // A failed initial refresh still needs to retain the live theme for retry,
      // without immediately repeating the failed read or writing stale settings.
      if (defer) return false;
      const pointer_color = latestColor;
      if ((!state.snapshot || state.loading) && !await store.load()) return false;
      return enqueue({ pointer_color }, 'color');
    },
    retry: async () => {
      const error = state.error;
      if (!error) return true;
      if (error.action === 'permission') return store.requestPermission(error.permission);
      if (error.action === 'load') {
        if (!await store.load()) return false;
        return latestColor ? store.syncPointerColor(latestColor) : true;
      }
      return enqueue(error.patch, error.source);
    },
  };
  stores.set(scope, store);
  return store;
}
