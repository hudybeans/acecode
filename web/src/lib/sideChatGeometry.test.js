import assert from 'node:assert/strict';
import {
  clampSideChatGeometry,
  createSideChatGeometry,
  moveSideChatGeometry,
  resizeSideChatGeometry,
} from './sideChatGeometry.js';

const viewport = { left: 0, top: 0, width: 1280, height: 900 };
const initial = createSideChatGeometry(viewport);
assert.deepEqual(initial, { left: 320, top: 110, width: 640, height: 680 });

assert.deepEqual(moveSideChatGeometry(initial, 9000, -9000, viewport), {
  left: 628, top: 12, width: 640, height: 680,
});

// Opposite edges stay anchored while west/north edges stop at the minimum size.
const west = resizeSideChatGeometry(initial, 'w', 9000, 0, viewport);
assert.equal(west.width, 300);
assert.equal(west.left + west.width, initial.left + initial.width);
const north = resizeSideChatGeometry(initial, 'n', 0, 9000, viewport);
assert.equal(north.height, 260);
assert.equal(north.top + north.height, initial.top + initial.height);
const northWest = resizeSideChatGeometry(initial, 'nw', -9000, -9000, viewport);
assert.deepEqual(northWest, { left: 12, top: 12, width: 948, height: 778 });

const southEast = resizeSideChatGeometry(initial, 'se', 9000, 9000, viewport);
assert.deepEqual(southEast, { left: 320, top: 110, width: 948, height: 778 });

// Narrow viewports and keyboard/pinch-zoom offsets keep the full window visible.
assert.deepEqual(clampSideChatGeometry(initial, { width: 280, height: 230 }), {
  left: 12, top: 12, width: 256, height: 206,
});
assert.deepEqual(createSideChatGeometry({ left: 73, top: 180, width: 390, height: 350 }), {
  left: 85, top: 192, width: 366, height: 326,
});

for (const width of [0, 20, 280, 390, 1280, 3000]) {
  for (const height of [0, 20, 180, 350, 900, 1600]) {
    const view = { left: 17, top: 41, width, height };
    const fitted = createSideChatGeometry(view);
    assert.deepEqual(clampSideChatGeometry(fitted, view), fitted);
    for (const direction of ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']) {
      for (const delta of [-9000, -100, 0, 100, 9000]) {
        const rect = resizeSideChatGeometry(fitted, direction, delta, delta, view);
        assert.ok(Object.values(rect).every(Number.isFinite));
        assert.ok(rect.width >= 0 && rect.height >= 0);
        assert.ok(rect.left >= view.left && rect.top >= view.top);
        assert.ok(rect.left + rect.width <= view.left + view.width);
        assert.ok(rect.top + rect.height <= view.top + view.height);
        if (!direction.includes('n')) assert.equal(rect.top, fitted.top);
        if (!direction.includes('w')) assert.equal(rect.left, fitted.left);
        if (!direction.includes('e')) assert.equal(rect.left + rect.width, fitted.left + fitted.width);
        if (!direction.includes('s')) assert.equal(rect.top + rect.height, fitted.top + fitted.height);
      }
    }
  }
}

assert.deepEqual(clampSideChatGeometry({ left: NaN, top: Infinity, width: -1, height: Infinity }, viewport), {
  left: 12, top: 12, width: 300, height: 680,
});
console.log('sideChatGeometry.test.js: all tests passed');
