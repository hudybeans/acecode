import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../../assets/seed/skills/acecode/ai-theme/scripts/artboard.js', import.meta.url), 'utf8');
async function render({width = null, height = null, viewport = [478, 605], broken = false} = {}) {
  const draws = [], notices = [];
  const canvas = {dataset: {}, getContext: () => ({drawImage: (...args) => draws.push(args.slice(1))}), after: (message) => notices.push(message)};
  const context = {
    window: {innerWidth: viewport[0], innerHeight: viewport[1]},
    Image: class {
      naturalWidth = 1600; naturalHeight = 1000;
      async decode() { if (broken) throw new Error('decode failed'); }
    },
    document: {
      getElementById: (id) => id === 'theme-artwork' ? canvas : {textContent: JSON.stringify({src: 'data:image/svg+xml;base64,test', width, height})},
      createElement: () => ({setAttribute() {}}),
    },
  };
  vm.runInNewContext(script, context);
  const result = await context.window.aceThemeArtboardReady;
  return {result, canvas, draws, notices};
}

for (const viewport of [[478, 605], [1920, 1080], [375, 900]]) {
  const {result, canvas, draws} = await render({viewport});
  assert.equal(result.ready, true);
  assert.equal(canvas.dataset.ready, 'true');
  assert.deepEqual([canvas.width, canvas.height], [1600, 1000]);
  assert.deepEqual(draws, [[0, 0, 1600, 1000, 0, 0, 1600, 1000]]);
}
for (const [width, height] of [[1920, 1080], [400, 1200], [8192, 1]]) {
  const {result, draws} = await render({width, height});
  assert.equal(result.ready, true);
  const [x, y, sw, sh, dx, dy, dw, dh] = draws[0];
  assert.ok(x >= 0 && y >= 0 && x + sw <= 1600 && y + sh <= 1000);
  assert.deepEqual([dx, dy, dw, dh], [0, 0, width, height]);
  assert.ok(Math.abs(sw / sh - width / height) < 1e-8, 'cover crop preserves proportions');
}
for (const options of [{width: 0, height: 1}, {width: 9000, height: 1},
  {width: 8192, height: 8192}, {broken: true}]) {
  const {result, canvas, draws, notices} = await render(options);
  assert.equal(result.ready, false);
  assert.equal(canvas.hidden, true);
  assert.equal(draws.length, 0);
  assert.equal(notices.length, 1);
}
console.log('Theme artboard: viewport independence, proportional cropping, limits and failed decode passed.');
