import assert from 'node:assert/strict';
import { canManageTheme, chooseThemeSaveDestination, createThemeExportController, downloadThemeBlob, themeExportFilename, themeExportProgress, themeManagementFailure } from './themeExports.js';

async function run(name, fn) { await fn(); console.log(`[pass] ${name}`); }
const entry = { id: 'ai-eva', name: 'EVA 初号机', version: '1.0.0', source: 'local', installed: true };
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const job = (state, values = {}) => ({ job_id: 'export-1', id: entry.id, version: entry.version, filename: 'EVA 初号机.zip', state, progress: null, reused: false, native_saved: false, ...values });
function fixture({ destination = { kind: 'download' }, first = job('completed', { reused: true }), next = [], chooseSave } = {}) {
  const calls = [], updates = [], downloads = [], completions = [];
  const api = {
    exportTheme: async (id, options) => { calls.push(['export', id, options]); return first; },
    getThemeExport: async (id) => { calls.push(['poll', id]); return next.shift() || job('completed'); },
    cancelThemeExport: async (id) => { calls.push(['cancel', id]); return job('cancelled'); },
    readThemeExport: async (id, options) => { calls.push(['read', id, options]); return new Blob(['zip'], { type: 'application/zip' }); },
  };
  const controller = createThemeExportController({ api, chooseSave: chooseSave || (() => destination), wait: async () => {},
    download: (...args) => downloads.push(args), onChange: (state) => updates.push(state), onComplete: (result) => completions.push(result) });
  return { controller, api, calls, updates, downloads, completions };
}

await run('only installed custom themes expose management and filenames remain safe ZIP names', () => {
  assert.equal(canManageTheme(entry), true);
  for (const id of ['blue', 'orange', 'eva-01', 'ai-../x']) assert.equal(canManageTheme({ ...entry, id }), false);
  assert.equal(canManageTheme({ ...entry, installed: false }), false);
  assert.equal(canManageTheme({ ...entry, source: 'remote' }), false);
  assert.equal(themeExportFilename({ name: 'EVA:初号机/自定义.zip' }), 'EVA-初号机-自定义.zip');
  assert.equal(themeExportFilename({ name: 'CON' }), 'theme-CON.zip');
});

await run('save picker opens synchronously before a job and cancelling it does not package', async () => {
  const selected = pending(), order = [];
  const win = { isSecureContext: true, showSaveFilePicker: (options) => { order.push('picker'); assert.deepEqual(options.types[0].accept, { 'application/zip': ['.zip'] }); return selected.promise; } };
  const f = fixture({ chooseSave: (value) => chooseThemeSaveDestination(value, win) });
  const running = f.controller.start(entry);
  assert.deepEqual(order, ['picker']);
  assert.deepEqual(f.calls, []);
  selected.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  assert.equal(await running, false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.state().status, 'cancelled');
});

await run('native and Edge webapp use backend Save As while unsupported browser pickers fall back', async () => {
  for (const win of [{ __ACECODE_DESKTOP_SHELL__: true }, { __ACECODE_WEBAPP_COMPAT__: true }]) {
    assert.deepEqual(await chooseThemeSaveDestination(entry, win), { kind: 'native' });
  }
  assert.deepEqual(await chooseThemeSaveDestination(entry, { isSecureContext: false, showSaveFilePicker: () => assert.fail('insecure picker') }), { kind: 'download' });
  assert.deepEqual(await chooseThemeSaveDestination(entry, { showSaveFilePicker: () => { throw Object.assign(new Error(), { name: 'SecurityError' }); } }), { kind: 'download' });
});

await run('reused ZIPs go straight to authenticated blob download with no compression state', async () => {
  const f = fixture();
  assert.equal(await f.controller.start(entry), true);
  assert.deepEqual(f.calls[0], ['export', entry.id, { native_save: false }]);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0][1], 'EVA 初号机.zip');
  assert.equal(f.updates.some((state) => state.hadCompression), false);
  assert.deepEqual(f.completions, [{ filename: 'EVA 初号机.zip', saved: false }]);
});

await run('compression progress follows only measured backend values and never invents a percentage', async () => {
  const f = fixture({ first: job('preparing'), next: [job('compressing'), job('compressing', { progress: 0.68 }), job('completed')] });
  await f.controller.start(entry);
  const compressing = f.updates.filter((state) => state.status === 'compressing');
  assert.deepEqual(compressing.map((state) => themeExportProgress(state.job)), [null, 0.68]);
  assert.equal(themeExportProgress({ progress: '0.5' }), null);
  assert.equal(themeExportProgress({ progress: NaN }), null);
  assert.equal(f.downloads.length, 1);
});

await run('native cancellation starts no poll or download and native completion never downloads twice', async () => {
  const cancelled = fixture({ destination: { kind: 'native' }, first: { state: 'cancelled', cancelled: true } });
  assert.equal(await cancelled.controller.start(entry), false);
  assert.deepEqual(cancelled.calls, [['export', entry.id, { native_save: true }]]);
  const saved = fixture({ destination: { kind: 'native' }, first: job('completed', { native_saved: true, reused: true }) });
  assert.equal(await saved.controller.start(entry), true);
  assert.deepEqual(saved.downloads, []);
  assert.deepEqual(saved.completions, [{ filename: 'EVA 初号机.zip', saved: true }]);
});

await run('missing native Save As capability falls back to browser download without arbitrary paths', async () => {
  const f = fixture({ destination: { kind: 'native' } });
  f.api.exportTheme = async (id, options) => {
    f.calls.push(['export', id, options]);
    if (options.native_save) throw { code: 'THEME_NATIVE_SAVE_UNAVAILABLE' };
    return job('completed');
  };
  await f.controller.start(entry);
  assert.deepEqual(f.calls.slice(0, 2), [['export', entry.id, { native_save: true }], ['export', entry.id, { native_save: false }]]);
  assert.equal(f.downloads.length, 1);
});

await run('File System Access writes and closes the selected file after the package completes', async () => {
  const sequence = [];
  const f = fixture({ destination: { kind: 'file', handle: { createWritable: async () => {
    sequence.push('open'); return { write: async (blob) => { sequence.push(await blob.text()); }, close: async () => sequence.push('close'), abort: async () => sequence.push('abort') };
  } } } });
  await f.controller.start(entry);
  assert.deepEqual(sequence, ['open', 'zip', 'close']);
  assert.deepEqual(f.downloads, []);
  assert.equal(f.completions[0].saved, true);
});

await run('cancel during packaging stops saving and repeated export cannot start another job', async () => {
  const waiting = pending();
  const f = fixture({ first: job('compressing', { progress: 0.15 }) });
  f.api.getThemeExport = async () => waiting.promise;
  const running = f.controller.start(entry);
  await tick();
  assert.equal(await f.controller.start(entry), false);
  await f.controller.cancel();
  waiting.resolve(job('completed'));
  assert.equal(await running, false);
  assert.deepEqual(f.downloads, []);
  assert.equal(f.calls.filter(([kind]) => kind === 'cancel').length, 1);
  assert.equal(f.controller.state().status, 'cancelled');
});

await run('closing settings while Save As is pending cancels a late job without downloading', async () => {
  const starting = pending();
  const f = fixture({ destination: { kind: 'native' } });
  f.api.exportTheme = async () => starting.promise;
  const running = f.controller.start(entry);
  await tick();
  f.controller.dispose();
  starting.resolve(job('preparing'));
  await running;
  assert.deepEqual(f.calls, [['cancel', 'export-1']]);
  assert.deepEqual(f.downloads, []);
});

await run('cancelling a package read aborts fetch and prevents a browser save', async () => {
  const f = fixture();
  f.api.readThemeExport = async (id, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const running = f.controller.start(entry);
  await tick();
  await f.controller.cancel();
  await running;
  assert.equal(f.controller.state().status, 'cancelled');
  assert.deepEqual(f.downloads, []);
});

await run('failed browser writes abort the stream and surface an error instead of claiming saved', async () => {
  const aborted = [];
  const f = fixture({ destination: { kind: 'file', handle: { createWritable: async () => ({ write: async () => { throw new Error('disk full'); }, close: async () => assert.fail('must not commit'), abort: async () => aborted.push(true) }) } } });
  assert.equal(await f.controller.start(entry), false);
  assert.equal(f.controller.state().error.message, 'disk full');
  assert.deepEqual(aborted, [true]);
  assert.deepEqual(f.completions, []);
});

await run('failed export and stale job identity remain actionable errors without a download', async () => {
  const failed = fixture({ first: job('failed', { error: 'THEME_SAVE_FAILED', message: 'Access denied', error_path: 'C:/Themes/eva.zip' }) });
  await failed.controller.start(entry);
  assert.match(failed.controller.state().error.message, /无法保存主题包/);
  assert.equal(failed.controller.state().error.detail, 'Access denied');
  assert.equal(failed.controller.state().error.path, 'C:/Themes/eva.zip');
  assert.deepEqual(failed.downloads, []);
  const stale = fixture({ first: job('completed', { id: 'ai-other' }) });
  await stale.controller.start(entry);
  assert.match(stale.controller.state().error.message, /无效结果/);
  assert.deepEqual(stale.downloads, []);
  assert.match(themeManagementFailure({ code: 'THEME_BUILTIN_PROTECTED' }).message, /内置主题/);
});

await run('ordinary ZIP download uses only a Blob URL and releases it after browser handoff', () => {
  const calls = [], scheduled = [];
  const anchor = { style: {}, click() { calls.push(['click', this.href, this.download]); }, remove() { calls.push(['remove']); } };
  downloadThemeBlob(new Blob(['zip']), '主题.zip', {
    document: { createElement: () => anchor, body: { append() {} } },
    URLApi: { createObjectURL: () => 'blob:theme', revokeObjectURL: (url) => calls.push(['revoke', url]) },
    schedule: (fn, ms) => scheduled.push({ fn, ms }),
  });
  assert.deepEqual(calls, [['click', 'blob:theme', '主题.zip'], ['remove']]);
  assert.equal(scheduled[0].ms, 60000);
  scheduled[0].fn();
  assert.deepEqual(calls.at(-1), ['revoke', 'blob:theme']);
});

await run('late native commit wins over an earlier nonterminal cancellation response', async () => {
  const polling = pending();
  const f = fixture({ destination: { kind: 'native' }, first: job('compressing', { progress: 0.4 }) });
  f.api.getThemeExport = async () => polling.promise;
  f.api.cancelThemeExport = async () => job('saving');
  const running = f.controller.start(entry);
  await tick();
  await f.controller.cancel();
  polling.resolve(job('completed', { native_saved: true }));
  await running;
  assert.equal(f.controller.state().status, 'completed');
  assert.equal(f.completions[0].saved, true);
  assert.deepEqual(f.downloads, []);
});

await run('native cancellation polls a saving response until its actual terminal result', async () => {
  const wait = pending(), calls = [], completions = [];
  let first = true;
  const controller = createThemeExportController({ chooseSave: () => ({ kind: 'native' }), wait: async () => { if (first) { first = false; await wait.promise; } },
    api: { exportTheme: async () => job('compressing'), cancelThemeExport: async () => job('saving'),
      getThemeExport: async () => { calls.push('poll'); return job('completed', { native_saved: true }); } }, onComplete: (value) => completions.push(value) });
  const running = controller.start(entry);
  await tick();
  await controller.cancel();
  wait.resolve();
  await running;
  assert.deepEqual(calls, ['poll']);
  assert.equal(controller.state().status, 'completed');
  assert.equal(completions[0].saved, true);
});

await run('browser file cancellation cannot override a close already committing successfully', async () => {
  const closing = pending();
  const f = fixture({ destination: { kind: 'file', handle: { createWritable: async () => ({ write: async () => {}, close: () => closing.promise, abort: async () => assert.fail('already committed') }) } } });
  const running = f.controller.start(entry);
  await tick();
  assert.equal(f.controller.state().canCancel, false);
  assert.equal(await f.controller.cancel(), false);
  closing.resolve();
  assert.equal(await running, true);
  assert.equal(f.controller.state().status, 'completed');
  assert.equal(f.completions[0].saved, true);
});

await run('confirmed native save clears an earlier cancellation transport error', async () => {
  const polling = pending();
  const f = fixture({ destination: { kind: 'native' }, first: job('compressing') });
  f.api.getThemeExport = async () => polling.promise;
  f.api.cancelThemeExport = async () => { throw new Error('cancel transport failed'); };
  const running = f.controller.start(entry);
  await tick();
  await f.controller.cancel();
  polling.resolve(job('completed', { native_saved: true }));
  assert.equal(await running, true);
  assert.equal(f.controller.state().status, 'completed');
  assert.equal(f.controller.state().error, null);
  assert.equal(f.completions[0].saved, true);
});
