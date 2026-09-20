import assert from 'node:assert/strict';
import { computerUsePointerColor, observeComputerUsePointerTheme } from './computerUsePointerTheme.js';
import { computerUseSettingsStore } from './computerUseSettings.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  let color = ' #2563EB ', mutations, onFocus;
  const frames = new Map();
  let nextFrame = 0, disconnected = false;
  const doc = { documentElement: {} };
  const win = {
    getComputedStyle: () => ({ getPropertyValue: (key) => { assert.equal(key, '--ace-accent'); return color; } }),
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, handler) { assert.equal(name, 'focus'); onFocus = handler; },
    removeEventListener(name, handler) { assert.equal(name, 'focus'); assert.equal(handler, onFocus); onFocus = null; },
    MutationObserver: class {
      constructor(callback) { mutations = callback; }
      observe(root, options) { assert.equal(root, doc.documentElement); assert.deepEqual(options.attributeFilter, ['data-theme', 'data-color-theme', 'style']); }
      disconnect() { disconnected = true; }
    },
  };
  return { win, doc, setColor: (value) => { color = value; mutations?.(); },
    focus: () => onFocus?.(), disconnected: () => disconnected,
    async flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); await tick(); },
  };
}

{
  const page = fixture();
  const colors = [];
  let loaded = false;
  const stop = observeComputerUsePointerTheme({
    getSnapshot: () => ({ snapshot: loaded ? { enabled: false } : null }),
    load: async () => { loaded = true; return true; },
    syncPointerColor: async (color) => { colors.push(color); },
  }, page.win, page.doc);
  await page.flush();
  assert.deepEqual(colors, ['#2563eb'], 'initial authenticated mount reads the real token even with settings closed');
  page.setColor('#3b82f6'); // Dark blue theme.
  page.setColor('#ff6b1a'); // A new theme replaces the pending animation frame.
  await page.flush();
  assert.deepEqual(colors, ['#2563eb', '#ff6b1a']);
  page.setColor('#b7ef65'); // Installed/custom theme token.
  await page.flush();
  assert.equal(colors.at(-1), '#b7ef65');
  page.setColor('invalid');
  await page.flush();
  assert.equal(colors.length, 3, 'invalid CSS values never become native pointer colors');
  page.setColor('#d9272e');
  stop();
  await page.flush();
  assert.equal(colors.length, 3, 'cleanup cancels queued writes');
  assert.equal(page.disconnected(), true);
}

{
  const page = fixture();
  const colors = [];
  let completeLoad;
  const stop = observeComputerUsePointerTheme({
    getSnapshot: () => ({ snapshot: null }),
    load: () => new Promise((resolve) => { completeLoad = resolve; }),
    syncPointerColor: async (color) => { colors.push(color); },
  }, page.win, page.doc);
  await page.flush();
  page.setColor('#ea5504');
  completeLoad(true);
  await tick();
  assert.deepEqual(colors, ['#ea5504'], 'a delayed settings read must not write a stale initial theme');
  stop();
}

{
  const page = fixture();
  const colors = [];
  let completeLoad;
  const stop = observeComputerUsePointerTheme({
    getSnapshot: () => ({ snapshot: null }),
    load: () => new Promise((resolve) => { completeLoad = resolve; }),
    syncPointerColor: async (color) => { colors.push(color); },
  }, page.win, page.doc);
  await page.flush();
  stop();
  completeLoad(true);
  await tick();
  assert.deepEqual(colors, [], 'an old app connection cannot finish pending color synchronization');
}

assert.equal(computerUsePointerColor(undefined, undefined), null);

{
  const page = fixture();
  const writes = [];
  let remote = { supported: true, enabled: false, pointer_style: 'plain', pointer_color: '#2563eb' };
  const store = computerUseSettingsStore({
    getComputerUse: async () => ({ ...remote }),
    setComputerUse: async (patch) => { writes.push(patch); remote = { ...remote, ...patch }; return { ...remote }; },
  });
  await store.load();
  remote.pointer_color = '#ea5504'; // Another window changed the already visited daemon.
  const stop = observeComputerUsePointerTheme(store, page.win, page.doc);
  await page.flush();
  assert.equal(remote.pointer_color, '#2563eb', 'reconnecting refreshes a cached color before deciding that no write is necessary');
  remote.pointer_color = '#b7ef65';
  page.focus();
  await page.flush();
  assert.equal(remote.pointer_color, '#2563eb', 'returning to the app reconciles another window changing its daemon');
  assert.deepEqual(writes, [{ pointer_color: '#2563eb' }, { pointer_color: '#2563eb' }]);
  assert.equal(remote.enabled, false);
  assert.equal(remote.pointer_style, 'plain');
  stop();
}
{
  const page = fixture();
  const writes = [];
  let failed = true, reads = 0;
  let remote = { supported: true, enabled: false, pointer_style: 'plain', pointer_color: '#ea5504' };
  const store = computerUseSettingsStore({
    getComputerUse: async () => { reads++; if (failed) throw new Error('unavailable'); return { ...remote }; },
    setComputerUse: async (patch) => { writes.push(patch); remote = { ...remote, ...patch }; return { ...remote }; },
  });
  const stop = observeComputerUsePointerTheme(store, page.win, page.doc);
  await page.flush();
  assert.equal(reads, 1, 'a failed initial read must not cause an automatic retry loop');
  assert.deepEqual(writes, [], 'no appearance write follows a failed refresh');
  assert.equal(store.getSnapshot().error.action, 'load');
  page.setColor('#b7ef65');
  await page.flush();
  assert.equal(reads, 2);
  failed = false;
  assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().error, null);
  assert.deepEqual(writes, [{ pointer_color: '#b7ef65' }], 'retry restores the latest theme without another focus or theme event');
  assert.equal(remote.enabled, false);
  assert.equal(remote.pointer_style, 'plain');
  stop();
}
console.log('[pass] Computer Use follows live theme tokens outside Settings and cleans up pending synchronization');
