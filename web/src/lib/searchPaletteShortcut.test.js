// 搜索面板默认快捷键(Ctrl+K / ⌘K)的纯逻辑测试:
// 命中规则、修饰键排除、非拉丁布局的 e.code 兜底、按平台生成的提示文案。

import assert from 'node:assert/strict';
import {
  SEARCH_PALETTE_SHORTCUT,
  isSearchPaletteShortcut,
  searchPaletteShortcutLabel,
  withSearchPaletteShortcutHint,
} from './searchPaletteShortcut.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('默认键位是 Ctrl/⌘ + K', () => {
  assert.deepEqual(SEARCH_PALETTE_SHORTCUT, { key: 'k', ctrl: true, meta: true });
});

run('Windows 的 Ctrl+K 与 macOS 的 ⌘K 都命中', () => {
  // 触发场景:用户在任意焦点位置按下 Ctrl+K(Windows / Linux)或 ⌘K(macOS)。
  // 期望:两者都被认作搜索面板快捷键。
  assert.equal(isSearchPaletteShortcut({ key: 'k', code: 'KeyK', ctrlKey: true }), true);
  assert.equal(isSearchPaletteShortcut({ key: 'k', code: 'KeyK', metaKey: true }), true);
  assert.equal(isSearchPaletteShortcut({ key: 'K', code: 'KeyK', ctrlKey: true }), true);
});

run('裸 K、Ctrl+J、Alt / Shift 组合都不命中', () => {
  // Ctrl+Shift+K / Ctrl+Alt+K 留给其它功能,不能被搜索面板抢走。
  assert.equal(isSearchPaletteShortcut({ key: 'k', code: 'KeyK' }), false);
  assert.equal(isSearchPaletteShortcut({ key: 'j', code: 'KeyJ', ctrlKey: true }), false);
  assert.equal(isSearchPaletteShortcut({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }), false);
  assert.equal(isSearchPaletteShortcut({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true }), false);
});

run('非拉丁键盘布局按物理键位 KeyK 兜底命中', () => {
  // 触发场景:俄语等布局下同一个物理键的 e.key 是 'л',只有 e.code 还是 'KeyK'。
  // 期望:仍然打开搜索面板;反之 e.code 是别的键时不能因 e.key 缺失误判。
  assert.equal(isSearchPaletteShortcut({ key: 'л', code: 'KeyK', ctrlKey: true }), true);
  assert.equal(isSearchPaletteShortcut({ key: 'Unidentified', code: 'KeyJ', ctrlKey: true }), false);
});

run('event 为 null / key 非字符串时安全返回 false', () => {
  assert.equal(isSearchPaletteShortcut(null), false);
  assert.equal(isSearchPaletteShortcut({ ctrlKey: true }), false);
});

run('提示文案按宿主平台切换:desktop 壳注入的 __ACECODE_OS__ 优先于 UA', () => {
  assert.equal(searchPaletteShortcutLabel({ __ACECODE_OS__: 'macos' }), '⌘K');
  assert.equal(searchPaletteShortcutLabel({ __ACECODE_OS__: 'windows' }), 'Ctrl+K');
  // desktop 壳明确说是 windows 时,即便 UA 里带 Macintosh 也不显示 ⌘。
  assert.equal(
    searchPaletteShortcutLabel({ __ACECODE_OS__: 'windows', navigator: { userAgent: 'Macintosh' } }),
    'Ctrl+K',
  );
  // 浏览器直连没有注入变量:退回 navigator 判断。
  assert.equal(searchPaletteShortcutLabel({ navigator: { platform: 'MacIntel' } }), '⌘K');
  assert.equal(searchPaletteShortcutLabel({ navigator: { platform: 'Win32' } }), 'Ctrl+K');
  assert.equal(searchPaletteShortcutLabel(undefined), 'Ctrl+K');
});

run('按钮提示拼成「文案 (快捷键)」,空文案只留快捷键', () => {
  assert.equal(withSearchPaletteShortcutHint('搜索任务', { __ACECODE_OS__: 'windows' }), '搜索任务 (Ctrl+K)');
  assert.equal(withSearchPaletteShortcutHint('', { __ACECODE_OS__: 'macos' }), '⌘K');
});
