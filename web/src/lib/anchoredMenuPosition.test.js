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

// 侧栏「扩展」弹出菜单:preferredPlacement='right' 时贴在触发项右侧、顶边对齐。
// 场景:侧栏宽 260,触发项在 y=120,菜单 200×160 → 右侧放得下,left=anchor.right+gap。
const flyout = place({
  preferredPlacement: 'right', menuWidth: 200, menuHeight: 160,
  anchorRect: { left: 12, right: 250, top: 120, bottom: 148 },
});
assert.deepEqual(flyout, { left: 254, top: 120, width: 200, maxHeight: 584, placement: 'right' });
// 触发项贴近视口底部:顶边被往上推,整块菜单仍留在视口内。
const flyoutBottom = place({
  preferredPlacement: 'right', menuWidth: 200, menuHeight: 160,
  anchorRect: { left: 12, right: 250, top: 560, bottom: 588 },
});
assert.equal(flyoutBottom.top + 160, 592);
// 右侧放不下(窗口很窄但左侧有空间)时翻到触发项左侧。
const flyoutLeft = place({
  preferredPlacement: 'right', menuWidth: 200, menuHeight: 160, viewportWidth: 700,
  anchorRect: { left: 480, right: 600, top: 120, bottom: 148 },
});
assert.equal(flyoutLeft.placement, 'left');
assert.equal(flyoutLeft.left, 276);
// 两侧都放不下:仍按 right 处理并夹进视口,不会越出左右边界。
const flyoutCramped = place({
  preferredPlacement: 'right', menuWidth: 200, menuHeight: 160, viewportWidth: 300,
  anchorRect: { left: 40, right: 260, top: 120, bottom: 148 },
});
assert.equal(flyoutCramped.placement, 'right');
assert.ok(flyoutCramped.left >= 8 && flyoutCramped.left + flyoutCramped.width <= 292);
