import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOPBAR_WINDOW_DRAG_HEIGHT, topBarWindowDragAction, isTopBarDragBackdrop, isTopBarDragExcludedTarget, topBarWindowControlAt } from './topBarWindowDrag.js';

const bounds = { left: 0, right: 1280, top: 0, width: 1280, height: 30 };
const event = { button: 0, clientX: 600, clientY: 15, detail: 1 };
assert.equal(TOPBAR_WINDOW_DRAG_HEIGHT, 44);
for (const clientY of [0, 15, 29.9, 30, 43.9]) {
  assert.equal(topBarWindowDragAction({ ...event, clientY }, bounds), 'drag');
}
for (const clientY of [-1, 44, 60, NaN]) {
  assert.equal(topBarWindowDragAction({ ...event, clientY }, bounds), null);
}
for (const clientX of [-1, 1280, NaN]) {
  assert.equal(topBarWindowDragAction({ ...event, clientX }, bounds), null);
}
assert.equal(topBarWindowDragAction({ ...event, clientY: 40, detail: 2 }, bounds), 'maximize');
assert.equal(topBarWindowDragAction({ ...event, button: 2 }, bounds), null);
assert.equal(topBarWindowDragAction({ ...event, defaultPrevented: true }, bounds), null);
assert.equal(topBarWindowDragAction(event, bounds, true), null);
assert.equal(topBarWindowDragAction(event, null), null);
assert.equal(topBarWindowDragAction(event, { ...bounds, height: 0 }), null);
assert.equal(topBarWindowDragAction({ ...event, clientY: 49 }, { ...bounds, top: 10 }), 'drag');
assert.equal(isTopBarDragExcludedTarget(null), false);
for (const selector of ['[data-ace-native-overlay]', '[role="tab"]', '[role="separator"]', '[draggable="true"]', '.ace-resize-handle']) {
  assert.equal(isTopBarDragExcludedTarget({ closest: (list) => list.split(',').includes(selector) }), true);
}
console.log('[pass] compact title-bar drag keeps the original band and excludes consumed interactions');

for (const height of [45, 60]) {
  const padded = { ...bounds, top: 10, height };
  assert.equal(topBarWindowDragAction({ ...event, clientY: 10 + height - .1 }, padded), 'drag');
  assert.equal(topBarWindowDragAction({ ...event, clientY: 10 + height - .1, detail: 2 }, padded), 'maximize');
  assert.equal(topBarWindowDragAction({ ...event, clientY: 10 + height }, padded), null);
  assert.equal(topBarWindowDragAction({ ...event, clientY: 10 + height - .1 }, padded, true), null);
}
for (const height of [NaN, Infinity]) {
  assert.equal(topBarWindowDragAction(event, { ...bounds, height }), null);
}
console.log('[pass] taller title bars include their final blank pixel without extending into content');

function overlayTarget({ backdrop = false, selectors = [] } = {}) {
  return {
    matches: (selector) => backdrop && selector === '[data-ace-native-overlay="blocking"]',
    closest: (selector) => selector.split(',').some((item) => selectors.includes(item)),
  };
}
for (const role of [[], ['[role="dialog"]']]) {
  const backdrop = overlayTarget({ backdrop: true, selectors: ['[data-ace-native-overlay]', ...role] });
  assert.equal(isTopBarDragBackdrop(backdrop), true);
  const excluded = isTopBarDragExcludedTarget(backdrop);
  assert.equal(excluded, false);
  assert.equal(topBarWindowDragAction(event, bounds, excluded), 'drag');
  assert.equal(topBarWindowDragAction({ ...event, detail: 2 }, bounds, excluded), 'maximize');
  assert.equal(topBarWindowDragAction({ ...event, clientY: 44 }, bounds, excluded), null);
}
for (const selectors of [
  ['[data-ace-native-overlay]'],
  ['[data-ace-native-overlay]', '[role="dialog"]'],
  ['[role="dialog"]'],
]) {
  const content = overlayTarget({ selectors });
  assert.equal(isTopBarDragBackdrop(content), false);
  assert.equal(isTopBarDragExcludedTarget(content), true);
}
assert.equal(isTopBarDragExcludedTarget(overlayTarget({ backdrop: true, selectors: ['[tabindex]'] })), true);
console.log('[pass] only the blocking backdrop itself permits title-bar gestures; modal content stays excluded');

const closeControl = { getBoundingClientRect: () => ({ left: 1240, right: 1270, top: 0, bottom: 30 }) };
const maximizeControl = { getBoundingClientRect: () => ({ left: 1210, right: 1240, top: 0, bottom: 30 }) };
const topBar = {
  getBoundingClientRect: () => bounds,
  querySelectorAll: () => [maximizeControl, closeControl],
};
assert.equal(topBarWindowControlAt({ ...event, clientX: 1255 }, topBar), closeControl);
assert.equal(topBarWindowControlAt({ ...event, clientX: 1225, detail: 2 }, topBar), maximizeControl);
for (const other of [event, { ...event, clientX: 1270 }, { ...event, clientX: 1255, clientY: 30 },
  { ...event, clientX: 1255, button: 2 }, { ...event, clientX: 1255, defaultPrevented: true },
  { ...event, clientX: 1255, target: overlayTarget({ selectors: ['[role="dialog"]'] }) }]) {
  assert.equal(topBarWindowControlAt(other, topBar), null);
}
assert.equal(topBarWindowControlAt(event, null), null);
console.log('[pass] covered window controls use their real bounds and remain distinct from blank-area dragging');

const topbar = fs.readFileSync(new URL('../components/TopBar.jsx', import.meta.url), 'utf8');
const icon = fs.readFileSync(new URL('../components/Icon.jsx', import.meta.url), 'utf8');
assert.match(topbar, /isInteractiveTarget\(event.target\) \|\| isTopBarDragExcludedTarget\(event.target\)/);
assert.match(topbar, /document.addEventListener\('mousedown', onWindowDragMouseDown\)/);
assert.match(topbar, /document.removeEventListener\('mousedown', onWindowDragMouseDown\)/);
assert.doesNotMatch(topbar, /onMouseDown=\{onTopBarMouseDown\}/);
assert.match(topbar, /panelToggle \? 'ace-topbar-panel-toggle' : 'ace-topbar-toggle-btn'/);
assert.match(topbar, /side="left" size=\{16\} expanded=\{!sidebarCollapsed\}/);
assert.match(topbar, /side="right" size=\{16\} expanded=\{!rightPanelCollapsed\}/);
assert.match(icon, /name=\{expanded \? `\$\{name\}Filled` : name\}/);
for (const side of ['Left', 'Right']) {
  const svg = fs.readFileSync(new URL(`../../public/vs-icons/Panel${side}Filled.svg`, import.meta.url), 'utf8');
  const collapsed = fs.readFileSync(new URL(`../../public/vs-icons/Panel${side}.svg`, import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 20 20"/);
  assert.match(svg, /stroke-linejoin="round"/);
  assert.match(svg, /<(?:path|rect)[^>]+fill="currentColor"/);
  assert.notEqual(svg, collapsed, 'expanded panels need a visible filled-pane distinction');
  assert.doesNotMatch(svg, /(?:fill|stroke)="(?!none|currentColor)[^"]+"/);
}
console.log('[pass] panel toggles use matching filled assets without the blue pressed class');
