import assert from 'node:assert/strict';
import { anchoredMenuPosition } from './anchoredMenuPosition.js';

const place = (overrides = {}) => anchoredMenuPosition({
  anchorRect: { left: 400, top: 445, bottom: 475 },
  menuWidth: 280, menuHeight: 202,
  viewportWidth: 1280, viewportHeight: 600,
  ...overrides,
});

assert.deepEqual(place(), { left: 400, top: 239, width: 280, maxHeight: 433, placement: 'above' });
assert.equal(place({ viewportHeight: 900 }).placement, 'below');
const shell = place({
  anchorRect: { left: 500, top: 605, bottom: 627 },
  menuWidth: 184, menuHeight: 150, viewportHeight: 720,
});
assert.equal(shell.placement, 'above');
assert.equal(shell.top + 150, 601);
const longList = place({ menuHeight: 2000, maxHeight: 240 });
assert.equal(longList.maxHeight, 240);
assert.equal(longList.top, 201);
const neitherSideFits = place({
  anchorRect: { left: 80, top: 110, bottom: 140 },
  viewportHeight: 300, menuHeight: 600,
});
assert.equal(neitherSideFits.placement, 'below');
assert.equal(neitherSideFits.maxHeight, 148);
assert.equal(neitherSideFits.top + neitherSideFits.maxHeight, 292);
const narrow = place({ viewportWidth: 240, anchorRect: { left: 210, top: 445, bottom: 475 } });
assert.equal(narrow.left, 8);
assert.equal(narrow.width, 224);

// Sweep bottom/top/right edge combinations, including scroll-sized menus.
for (const viewportHeight of [240, 300, 400, 600, 900]) {
  for (const viewportWidth of [320, 390, 1280]) {
    for (const top of [8, viewportHeight / 2, viewportHeight - 38]) {
      for (const menuHeight of [150, 202, 2000]) {
        const result = place({
          viewportWidth, viewportHeight, menuHeight,
          anchorRect: { left: viewportWidth - 30, top, bottom: top + 30 },
        });
        assert.ok(result.left >= 8 && result.left + result.width <= viewportWidth - 8);
        assert.ok(result.top >= 8);
        assert.ok(result.top + Math.min(menuHeight, result.maxHeight) <= viewportHeight - 8);
      }
    }
  }
}
console.log('anchoredMenuPosition.test.js: all tests passed');

const preferredAbove = place({ viewportHeight: 900, preferredPlacement: 'above' });
assert.equal(preferredAbove.placement, 'above');
assert.equal(preferredAbove.top + 202, 441);
const topEdge = place({
  preferredPlacement: 'above', anchorRect: { left: 16, top: 8, bottom: 36 },
});
assert.equal(topEdge.placement, 'below');
assert.ok(topEdge.top >= 8);
