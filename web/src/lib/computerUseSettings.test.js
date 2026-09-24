import assert from 'node:assert/strict';
import { ApiError, createApi } from './api.js';
import { lookupErrorMessage } from './errors.js';
import { computerUseSettingsStore } from './computerUseSettings.js';

const initial = { enabled: false, supported: true, platform: 'windows' };
const copy = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setImmediate(resolve));
let saved = copy(initial);
const writes = [];
let finishSave;
const client = {
  getComputerUse: async () => copy(saved),
  setComputerUse: (patch) => new Promise((resolve) => {
    writes.push(copy(patch));
    finishSave = () => { saved = { ...saved, ...patch }; resolve(copy(saved)); };
  }),
};
const store = computerUseSettingsStore(client);
assert.equal(store.getSnapshot().snapshot, null);
assert.equal(await store.setEnabled(true), false, 'a missing snapshot cannot implicitly enable control');
await store.load();
assert.equal(store.getSnapshot().snapshot.pointer_style, 'ace');
assert.equal(store.getSnapshot().snapshot.pointer_color, '#2563eb');
const enabling = store.setEnabled(true);
await tick();
assert.equal(store.getSnapshot().snapshot.enabled, false, 'show the acknowledged state during persistence');
assert.equal(store.getSnapshot().saving, true);
const reopened = computerUseSettingsStore(client);
assert.equal(reopened, store, 'settings navigation shares the pending operation');
const loadingAgain = reopened.load();
finishSave();
assert.equal(await enabling, true);
await loadingAgain;
assert.equal(store.getSnapshot().snapshot.enabled, true, 'a reopened page loads after the save');
assert.deepEqual(writes, [{ enabled: true }]);
assert.equal(await store.setEnabled(true), true);
assert.equal(writes.length, 1, 'unchanged settings do not write');

let failWrite = true;
const failureClient = {
  getComputerUse: async () => ({ ...initial, enabled: true }),
  setComputerUse: async (patch) => {
    if (failWrite) throw new ApiError(500, { error: 'PERSIST_FAILED' });
    return { ...initial, ...patch };
  },
};
const failed = computerUseSettingsStore(failureClient);
await failed.load();
assert.equal(await failed.setEnabled(false), false);
assert.equal(failed.getSnapshot().snapshot.enabled, true, 'a failed disable must remain visibly enabled');
assert.equal(failed.getSnapshot().error.enabled, false, 'retry retains the requested disable');
assert.deepEqual(failed.getSnapshot().error.patch, { enabled: false });
failWrite = false;
assert.equal(await failed.retry(), true);
assert.equal(failed.getSnapshot().snapshot.enabled, false);
assert.equal(failed.getSnapshot().error, null);

let timedOutEnabled = false;
const timedOut = computerUseSettingsStore({
  getComputerUse: async () => ({ ...initial, enabled: timedOutEnabled }),
  setComputerUse: async ({ enabled }) => {
    timedOutEnabled = enabled;
    throw new ApiError(0, { error: 'TIMEOUT' });
  },
});
await timedOut.load();
assert.equal(await timedOut.setEnabled(true), true);
assert.equal(timedOut.getSnapshot().snapshot.enabled, true, 'a lost save response is reconciled with the daemon');
assert.equal(timedOut.getSnapshot().error, null);

let unsupportedWrites = 0;
const unsupported = computerUseSettingsStore({
  getComputerUse: async () => ({ enabled: false, supported: false, platform: 'macos' }),
  setComputerUse: async () => { unsupportedWrites++; return copy(initial); },
});
await unsupported.load();
assert.equal(await unsupported.setEnabled(true), false);
assert.equal(unsupportedWrites, 0, 'unsupported platforms cannot enable desktop control');

for (const [status, code] of [[404, 'COMPUTER_USE_SETTINGS_UNSUPPORTED'], [405, 'COMPUTER_USE_SETTINGS_UNSUPPORTED'],
  [401, 'COMPUTER_USE_SETTINGS_AUTH_REQUIRED'], [403, 'COMPUTER_USE_SETTINGS_AUTH_REQUIRED'], [503, 'COMPUTER_USE_SETTINGS_UNAVAILABLE']]) {
  const failure = computerUseSettingsStore({ getComputerUse: async () => { throw new ApiError(status, 'failure'); } });
  assert.equal(await failure.load(), false);
  assert.equal(failure.getSnapshot().error.code, code);
  assert.notEqual(lookupErrorMessage(code, 'fallback'), 'fallback');
  assert.equal(await failure.setEnabled(true), false);
}

const originalFetch = globalThis.fetch;
const calls = [];
try {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ...initial, ...JSON.parse(options.body || '{}') }) };
  };
  const base = { origin: 'http://127.0.0.1:9876', token: 'fixture-token' };
  const api = createApi(base);
  await api.getComputerUse();
  await api.setComputerUse({ enabled: true });
  assert.deepEqual(calls.map(({ options }) => options.method), ['GET', 'PUT']);
  assert.equal(calls[1].options.keepalive, true);
  assert.equal(calls[1].options.headers['X-ACECode-Token'], 'fixture-token');
  assert.equal(calls[1].url, 'http://127.0.0.1:9876/api/config/computer-use');
  assert.deepEqual(JSON.parse(calls[1].options.body), { enabled: true });
  const originalStore = computerUseSettingsStore(api);
  await originalStore.load();
  Object.assign(base, { origin: 'http://127.0.0.1:9877', token: 'other-token' });
  assert.notEqual(computerUseSettingsStore(api), originalStore);
  const priorCalls = calls.length;
  assert.equal(await originalStore.setEnabled(true), false);
  assert.equal(calls.length, priorCalls, 'an old settings page cannot enable control on a different daemon');
} finally { globalThis.fetch = originalFetch; }

let pointerSaved = { ...initial, pointer_style: 'ace', pointer_color: '#2563eb' };
const pointerWrites = [];
const pointerStore = computerUseSettingsStore({
  getComputerUse: async () => copy(pointerSaved),
  setComputerUse: async (patch) => { pointerWrites.push(copy(patch)); pointerSaved = { ...pointerSaved, ...patch }; return copy(pointerSaved); },
});
assert.equal(await pointerStore.syncPointerColor('#AB12EF'), true, 'the app can synchronize its theme before opening Tools');
assert.equal(pointerStore.getSnapshot().snapshot.enabled, false);
assert.equal(await pointerStore.setPointerStyle('plain'), true, 'pointer appearance is configurable while Computer Use is off');
assert.deepEqual(pointerWrites, [{ pointer_color: '#ab12ef' }, { pointer_style: 'plain' }]);
assert.equal(pointerSaved.enabled, false, 'appearance changes never implicitly enable control');
for (const color of ['red', '#fff', '#12345g', '', null]) assert.equal(await pointerStore.syncPointerColor(color), false);
assert.equal(await pointerStore.setPointerStyle('unknown'), false);
assert.equal(pointerWrites.length, 2);

let queuedSaved = { ...initial, pointer_style: 'ace', pointer_color: '#2563eb' };
const queuedWrites = [];
const finishQueued = [];
const queued = computerUseSettingsStore({
  getComputerUse: async () => copy(queuedSaved),
  setComputerUse: (patch) => new Promise((resolve) => {
    queuedWrites.push(copy(patch));
    finishQueued.push(() => { queuedSaved = { ...queuedSaved, ...patch }; resolve(copy(queuedSaved)); });
  }),
});
await queued.load();
const plainPending = queued.setPointerStyle('plain');
await tick();
const firstTheme = queued.syncPointerColor('#112233');
const latestTheme = queued.syncPointerColor('#445566');
const acePending = queued.setPointerStyle('ace');
assert.equal(queued.getSnapshot().snapshot.pointer_style, 'ace', 'a radio displays its acknowledged style while saving');
assert.deepEqual(queuedWrites, [{ pointer_style: 'plain' }], 'all appearance operations wait for the active write');
for (let index = 0; index < 4; index++) { finishQueued.shift()(); await tick(); }
assert.deepEqual(await Promise.all([plainPending, firstTheme, latestTheme, acePending]), [true, true, true, true]);
assert.deepEqual(queuedWrites, [{ pointer_style: 'plain' }, { pointer_color: '#112233' }, { pointer_color: '#445566' }, { pointer_style: 'ace' }]);
assert.equal(queuedSaved.pointer_style, 'ace');
assert.equal(queuedSaved.pointer_color, '#445566', 'an old style acknowledgment cannot discard a newer theme color');
assert.equal(queuedSaved.enabled, false);

const remountStyle = queued.setPointerStyle('plain');
await tick();
const remountLoad = queued.load();
const colorDuringRemount = queued.syncPointerColor('#778899');
assert.equal(queued.getSnapshot().loading, true);
finishQueued.shift()();
await tick();
assert.equal(queuedWrites.at(-1).pointer_color, '#778899', 'a theme update arriving during remount is queued after its reload');
finishQueued.shift()();
await Promise.all([remountStyle, remountLoad, colorDuringRemount]);
assert.equal(queuedSaved.pointer_style, 'plain');
assert.equal(queuedSaved.pointer_color, '#778899');

let recoverySaved = { ...initial, enabled: true, pointer_style: 'ace', pointer_color: '#2563eb' };
let rejectUserChanges = true;
const recoveryWrites = [];
const recovery = computerUseSettingsStore({
  getComputerUse: async () => copy(recoverySaved),
  setComputerUse: async (patch) => {
    recoveryWrites.push(copy(patch));
    if (rejectUserChanges && ('enabled' in patch || 'pointer_style' in patch)) throw new ApiError(500, { error: 'PERSIST_FAILED' });
    recoverySaved = { ...recoverySaved, ...patch };
    return copy(recoverySaved);
  },
});
await recovery.load();
assert.equal(await recovery.setPointerStyle('plain'), false);
assert.equal(await recovery.setEnabled(false), false);
assert.deepEqual(recovery.getSnapshot().error.patch, { pointer_style: 'plain', enabled: false });
assert.equal(await recovery.syncPointerColor('#abcdef'), true);
await recovery.load();
assert.deepEqual(recovery.getSnapshot().error.patch, { pointer_style: 'plain', enabled: false }, 'automatic theme sync and settings navigation preserve failed user choices');
assert.equal(recovery.getSnapshot().snapshot.enabled, true);
assert.equal(recovery.getSnapshot().snapshot.pointer_style, 'ace');
rejectUserChanges = false;
assert.equal(await recovery.retry(), true);
assert.deepEqual(recoveryWrites.at(-1), { pointer_style: 'plain', enabled: false });
assert.equal(recoverySaved.pointer_color, '#abcdef');
assert.equal(recoverySaved.pointer_style, 'plain');
assert.equal(recoverySaved.enabled, false);
assert.equal(recovery.getSnapshot().error, null);

let readbacks = 0;
const mismatch = computerUseSettingsStore({
  getComputerUse: async () => { readbacks++; return { ...initial, pointer_style: 'ace', pointer_color: '#2563eb' }; },
  setComputerUse: async () => ({ ...initial, pointer_style: 'ace', pointer_color: '#2563eb' }),
});
await mismatch.load();
assert.equal(await mismatch.setPointerStyle('plain'), false, 'a successful HTTP response with the wrong style does not acknowledge the save');
assert.equal(readbacks, 2, 'mismatched acknowledgments also get an authoritative read-back');
assert.deepEqual(mismatch.getSnapshot().error.patch, { pointer_style: 'plain' });
assert.equal(await mismatch.syncPointerColor('#112233'), false);
assert.deepEqual(mismatch.getSnapshot().error.patch, { pointer_style: 'plain' }, 'a failing automatic color update cannot replace a failed user style');

let acknowledgedSaved = { ...initial, pointer_style: 'ace', pointer_color: '#2563eb' };
const staleAcknowledgment = computerUseSettingsStore({
  getComputerUse: async () => copy(acknowledgedSaved),
  setComputerUse: async (patch) => {
    const old = copy(acknowledgedSaved);
    acknowledgedSaved = { ...acknowledgedSaved, ...patch };
    return old;
  },
});
await staleAcknowledgment.load();
assert.equal(await staleAcknowledgment.setPointerStyle('plain'), true, 'read-back recovers a persisted style from an out-of-date acknowledgment');
assert.equal(staleAcknowledgment.getSnapshot().snapshot.pointer_style, 'plain');

console.log('[pass] Computer Use confirmed saves, pointer configuration, serialized theme updates, navigation, retry and connection gates');

let permissionRequests = 0;
let failPermission = false;
let macSnapshot = { ...initial, platform: 'macos', availability: {
  helper_available: true, accessibility: 'required', screen_recording: 'granted', ready: false,
} };
const macStore = computerUseSettingsStore({
  getComputerUse: async () => copy(macSnapshot),
  setComputerUse: async (patch) => { macSnapshot = { ...macSnapshot, ...patch }; return copy(macSnapshot); },
  requestComputerUsePermission: async (permission) => {
    permissionRequests++;
    assert.equal(permission, 'accessibility');
    if (failPermission) throw new ApiError(500, { error: 'COMPUTER_USE_PERMISSION_ERROR' });
    return copy(macSnapshot);
  },
});
await macStore.load();
assert.equal(permissionRequests, 0, 'reading settings cannot request OS permission');
assert.equal(await macStore.requestPermission('arbitrary'), false);
assert.equal(await macStore.setEnabled(true), true);
assert.equal(macStore.getSnapshot().snapshot.availability.ready, false, 'enabled intent does not imply OS authorization');
assert.equal(permissionRequests, 0, 'enabling does not implicitly prompt for permission');
assert.equal(await macStore.requestPermission('accessibility'), true);
assert.equal(permissionRequests, 1);
assert.equal(macStore.getSnapshot().snapshot.availability.ready, false, 'an opened authorization dialog is not a grant');
failPermission = true;
assert.equal(await macStore.requestPermission('accessibility'), false, 'read-back cannot turn a failed request into success');
assert.equal(macStore.getSnapshot().error.action, 'permission');
failPermission = false;
assert.equal(await macStore.retry(), true);
macSnapshot.availability.accessibility = 'granted';
macSnapshot.availability.ready = true;
await macStore.load();
assert.equal(macStore.getSnapshot().snapshot.availability.ready, true);
console.log('[pass] macOS permission requests are explicit, bounded to known permissions, and separate from enabled intent');
