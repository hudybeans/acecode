import assert from 'node:assert/strict';
import {
  createThemeDownloadController, THEME_COLOR_KEYS, themeCssProperties,
  themeDownloadConsent, themeDownloadPercent, themeFailure, validThemeDefinition,
} from './themePackages.js';

async function run(name, fn) { await fn(); console.log(`[pass] ${name}`); }
const entry = { id: 'eva-01', version: '1.0.0', installed: false, package: { bytes: 2000000, sha256: 'a'.repeat(64) } };
const pending = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(themeEntry = entry) {
  const completion = pending(), applies = [], prepared = [], preparations = [], requests = [];
  let currentJob = { id: 'eva-01', version: themeEntry.version, state: 'downloading', bytes_total: 2000000, bytes_downloaded: 20 };
  const api = {
    getThemes: async () => ({ themes: [themeEntry], job: { state: 'idle' } }),
    installTheme: async (id, consent) => { requests.push({ id, consent }); return currentJob; },
    getThemeJob: async () => { await completion.promise; return currentJob; },
    cancelThemeInstall: async () => { currentJob = { id: 'eva-01', state: 'cancelled' }; completion.resolve(); },
  };
  const controller = createThemeDownloadController({ api, prepare: async (id, options) => { prepared.push(id); preparations.push(options); }, apply: async (id) => applies.push(id), wait: async () => {} });
  return { controller, api, applies, prepared, preparations, requests, complete: (state = 'completed') => {
    currentJob = { id: 'eva-01', version: themeEntry.version, state, error: 'THEME_INVALID_PACKAGE' }; completion.resolve();
  } };
}

await run('theme palette only accepts registered hex tokens and safe application blob URLs', () => {
  const definition = { schema_version: 1, id: 'eva-01', version: '1.0.0', mode: 'light', colors: Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, '#ABCDEF'])) };
  assert.equal(validThemeDefinition(definition), true);
  const css = themeCssProperties(definition, 'blob:http://localhost/123');
  assert.equal(css['--ace-bg-rgb'], '171, 205, 239');
  assert.equal(css['--ace-home-background-image'], 'url("blob:http://localhost/123")');
  assert.equal(themeCssProperties(definition, 'https://example.com/image.png')['--ace-home-background-image'], undefined);
  assert.equal(validThemeDefinition({ ...definition, colors: { ...definition.colors, bg: 'url(javascript:alert(1))' } }), false);
  assert.equal(validThemeDefinition({ ...definition, mode: 'dark' }), false);
});

await run('theme consent pins the displayed size, version and checksum', () => {
  assert.deepEqual(themeDownloadConsent(entry), { confirm_download: true, bytes: 2000000, version: '1.0.0', sha256: 'a'.repeat(64) });
  assert.throws(() => themeDownloadConsent({ ...entry, package: { bytes: 0 } }));
  assert.equal(themeDownloadPercent({ bytes_total: 200, bytes_downloaded: 50 }), 25);
  assert.equal(themeDownloadPercent({ bytes_total: 200, bytes_downloaded: 250 }), 100);
});

await run('catalog previews do not download a theme and only completed installs apply it', async () => {
  const f = fixture();
  await f.controller.refresh();
  assert.deepEqual(f.requests, []);
  await f.controller.install(entry);
  assert.deepEqual(f.applies, []);
  f.complete(); await tick();
  assert.deepEqual(f.prepared, ['eva-01']);
  assert.deepEqual(f.applies, ['eva-01']);
  assert.equal(f.controller.state().entry.installed, true);
  f.controller.dispose();
});

await run('a later manual theme choice wins over an in-flight installation', async () => {
  const f = fixture();
  await f.controller.install(entry);
  await f.controller.select('orange');
  f.complete(); await tick();
  assert.deepEqual(f.applies, ['orange']);
  assert.deepEqual(f.prepared, []);
  f.controller.dispose();
});

await run('cancelled and failed installs keep the current appearance', async () => {
  const cancelled = fixture();
  await cancelled.controller.install(entry);
  await cancelled.controller.cancel(); await tick();
  assert.deepEqual(cancelled.applies, []);
  assert.equal(cancelled.controller.state().job.state, 'cancelled');
  cancelled.controller.dispose();
  const failed = fixture();
  await failed.controller.install(entry);
  failed.complete('failed'); await tick();
  assert.deepEqual(failed.applies, []);
  assert.match(failed.controller.state().error, /校验失败/);
  failed.controller.dispose();
});

await run('changing theme during asset loading prevents stale automatic application', async () => {
  const asset = pending(), applies = [];
  const controller = createThemeDownloadController({ api: {}, prepare: () => asset.promise, apply: (id) => applies.push(id) });
  const selecting = controller.select('eva-01');
  await controller.select('blue');
  asset.resolve(); await selecting;
  assert.deepEqual(applies, ['blue']);
  controller.dispose();
});

await run('reopening settings can observe completion without dropping automatic application', async () => {
  const f = fixture();
  await f.controller.install(entry);
  f.api.getThemes = async () => ({ themes: [{ ...entry, installed: true }], job: { id: 'eva-01', version: entry.version, state: 'completed' } });
  await f.controller.refresh();
  f.complete(); await tick();
  assert.deepEqual(f.applies, ['eva-01']);
  f.controller.dispose();
});

await run('passive catalogue failures stay quiet while a user retry reports the actual address', async () => {
  const f = fixture();
  const path = 'https://mirror.example/custom/themes/catalog.json';
  f.api.getThemes = async () => { throw { code: 'THEME_CATALOG_UNAVAILABLE', body: { error_path: path } }; };
  assert.equal(await f.controller.refresh(), null);
  assert.equal(f.controller.state().failure, null);
  assert.deepEqual(f.requests, []);
  assert.equal(await f.controller.refresh({ notify: true }), null);
  assert.equal(f.controller.state().failure.path, path);
  f.controller.dismissFailure();
  await f.controller.refresh();
  assert.equal(f.controller.state().failure, null);
  f.controller.dispose();
});

await run('download failure remains available to the shell and dismissing it does not reopen a stale error', async () => {
  const f = fixture();
  const path = 'https://mirror.example/custom/themes/eva-01/1.0.0/theme.zip';
  const failedJob = { state: 'failed', error: 'THEME_DOWNLOAD_FAILED', error_path: path };
  f.api.getThemeJob = async () => failedJob;
  await f.controller.install(entry);
  await tick();
  assert.equal(f.controller.state().failure.path, path);
  assert.deepEqual(f.applies, []);
  f.controller.dismissFailure();
  f.api.getThemes = async () => ({ themes: [entry], job: failedJob });
  await f.controller.refresh();
  assert.equal(f.controller.state().failure, null);
  f.controller.dispose();
});

await run('failure paths prefer backend detail and preserve local file paths', () => {
  assert.equal(themeFailure({ code: 'THEME_SAVE_FAILED', body: { error_path: 'C:\\Themes\\EVA\\theme.json' } }, 'https://mirror.example/theme.zip').path, 'C:\\Themes\\EVA\\theme.json');
  assert.equal(themeFailure(new Error('Network disconnected'), 'https://mirror.example/theme.zip').path, 'https://mirror.example/theme.zip');
});

await run('an installed theme update waits for consent and reloads cached resources on completion', async () => {
  const update = { ...entry, version: '1.0.1', installed: true, installed_version: '1.0.0', update_available: true };
  const f = fixture(update);
  await f.controller.refresh();
  assert.deepEqual(f.requests, []);
  await f.controller.install(update);
  assert.equal(f.requests[0].consent.version, '1.0.1');
  f.complete(); await tick();
  assert.deepEqual(f.preparations, [{ refresh: true }]);
  assert.deepEqual(f.applies, ['eva-01']);
  assert.equal(f.controller.state().entry.installed_version, '1.0.1');
  assert.equal(f.controller.state().entry.update_available, false);
  f.controller.dispose();
});

await run('replayed older completion neither hides an update nor prematurely applies it', async () => {
  const update = { ...entry, version: '1.0.1', installed: true, installed_version: '1.0.0', update_available: true };
  const f = fixture(update);
  f.api.getThemes = async () => ({ themes: [update], job: { id: 'eva-01', version: '1.0.0', state: 'completed' } });
  await f.controller.refresh();
  assert.equal(f.controller.state().entry.update_available, true);
  await f.controller.install(update);
  await f.controller.refresh();
  assert.deepEqual(f.prepared, []);
  assert.equal(f.controller.state().entry.update_available, true);
  f.complete(); await tick();
  assert.deepEqual(f.applies, ['eva-01']);
  assert.equal(f.controller.state().entry.update_available, false);
  f.controller.dispose();
});

await run('a failed update retains the installed version and does not replace the loaded theme', async () => {
  const update = { ...entry, version: '1.0.1', installed: true, installed_version: '1.0.0', update_available: true };
  const f = fixture(update);
  await f.controller.refresh();
  await f.controller.install(update);
  f.complete('failed'); await tick();
  assert.deepEqual(f.prepared, []);
  assert.deepEqual(f.applies, []);
  assert.equal(f.controller.state().entry.installed_version, '1.0.0');
  assert.equal(f.controller.state().entry.update_available, true);
  f.controller.dispose();
});
