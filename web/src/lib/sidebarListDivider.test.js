import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sidebarListScrolledPastTop, syncSidebarListDivider } from './sidebarListDivider.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (err) {
    console.error(`[fail] ${name}`);
    throw err;
  }
}

// 场景:任务列表在顶部 / 滚下去一点 / 小数缩放下滚回顶部残留亚像素。
// 期望:只有真正滚离顶部(超过半像素)才算,残留的 0.4 仍视为在顶部,分隔线不闪现。
test('列表滚离顶部的判定容忍亚像素残留', () => {
  assert.equal(sidebarListScrolledPastTop(0), false);
  assert.equal(sidebarListScrolledPastTop(0.4), false);
  assert.equal(sidebarListScrolledPastTop(1), true);
  assert.equal(sidebarListScrolledPastTop(240), true);
  assert.equal(sidebarListScrolledPastTop(undefined), false);
});

// 场景:滚动事件里同步固定导航的 data 属性。期望:滚下去写 true、回到顶部写 false;
// 值没变时不重复写;任一元素缺失时安静返回。
test('同步固定导航的 data-list-scrolled', () => {
  const writes = [];
  const dataset = {};
  const nav = {
    dataset: new Proxy(dataset, {
      set(target, key, value) {
        writes.push(value);
        target[key] = value;
        return true;
      },
    }),
  };
  const list = { scrollTop: 0 };
  syncSidebarListDivider(nav, list);
  assert.equal(dataset.listScrolled, 'false');
  list.scrollTop = 120;
  syncSidebarListDivider(nav, list);
  syncSidebarListDivider(nav, list);
  assert.equal(dataset.listScrolled, 'true');
  list.scrollTop = 0;
  syncSidebarListDivider(nav, list);
  assert.equal(dataset.listScrolled, 'false');
  assert.deepEqual(writes, ['false', 'true', 'false']);
  syncSidebarListDivider(null, list);
  syncSidebarListDivider(nav, null);
});

// 场景:接线回归。期望:任务列表的 onScroll 走同步函数,固定导航挂 ref;CSS 边框常驻
// 透明、仅在 data-list-scrolled="true" 时上色(切换不引起布局位移)。
test('侧栏把列表滚动状态接到固定导航的分隔线上', () => {
  const sidebar = fs.readFileSync(path.join(srcRoot, 'components/Sidebar.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(srcRoot, 'styles/globals.css'), 'utf8');
  assert.match(sidebar, /<div ref=\{sidebarFixedNavRef\} className="ace-sidebar-fixed-nav /);
  assert.match(sidebar, /className="ace-sidebar-scroll [^"]*"\s+onScroll=\{handleSidebarListScroll\}/);
  assert.match(sidebar, /syncSidebarListDivider\(sidebarFixedNavRef\.current, sidebarScrollRef\.current\)/);
  assert.match(css, /\.ace-sidebar-fixed-nav \{[^}]*border-bottom: 1px solid transparent;/);
  assert.match(css, /\.ace-sidebar-fixed-nav\[data-list-scrolled="true"\] \{\s*border-bottom-color: var\(--ace-border\);/);
});
