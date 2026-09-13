import assert from 'node:assert/strict';
import { themeWorkshopUrl, validateThemeImportFile } from './themeImports.js';
import { createThemeDownloadController } from './themePackages.js';

assert.equal(themeWorkshopUrl('http://2017studio.imwork.net:82/aupdate/'), 'http://2017studio.imwork.net:82/aupdate/workshop');
assert.equal(themeWorkshopUrl('https://updates.example/custom/path?x=1#part'), 'https://updates.example/custom/path/workshop');
assert.throws(() => themeWorkshopUrl('javascript:alert(1)'));
assert.throws(() => themeWorkshopUrl('https://secret:token@updates.example/aupdate'));
assert.throws(() => validateThemeImportFile({ name: 'picture.png', size: 12 }));
assert.throws(() => validateThemeImportFile({ name: 'theme.zip', size: 16 * 1024 * 1024 + 1 }));
console.log('[pass] workshop URL resolves configured prefix and rejects unsafe addresses');

for (const scenario of ['apply', 'keep-current', 'later-selection']) {
  let complete;
  const applied = [], prepared = [], forgotten = [];
  const controller = createThemeDownloadController({
    api: { importTheme: () => new Promise((resolve) => { complete = resolve; }), getThemes: async () => ({ themes: [], job: { state: 'idle' } }) },
    prepare: async (id, options) => prepared.push([id, options]), apply: async (id) => applied.push(id), forget: (id) => forgotten.push(id),
  });
  const pending = controller.importLocal({}, 'a'.repeat(64), scenario !== 'keep-current');
  if (scenario === 'later-selection') await controller.select('orange');
  complete({ id: 'ai-imported', version: '1.0.0' });
  const result = await pending;
  assert.deepEqual(forgotten, ['ai-imported']);
  assert.deepEqual(applied, scenario === 'apply' ? ['ai-imported'] : scenario === 'later-selection' ? ['orange'] : []);
  assert.equal(result.applied, scenario === 'apply');
  if (scenario === 'apply') assert.deepEqual(prepared, [['ai-imported', { refresh: true }]]);
  controller.dispose();
}
console.log('[pass] local import honors apply choice, refreshes resources, and preserves later theme selections');
