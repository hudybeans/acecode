import assert from 'node:assert/strict';
import { createDeveloperModeUnlock, loadDeveloperModeUnlocked, rememberDeveloperModeUnlocked } from './developerMode.js';
import { getSettingsNavGroups, getSettingsNavItems, SETTINGS_NAV_ITEMS, settingsNavIndexForKey } from './settingsNavigation.js';
import { searchSettings, settingsSearchEntries } from './settingsSearch.js';

const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'b', 'a'];
function test(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

test('developer mode requires the complete BABA sequence and accepts upper case', () => {
  const accept = createDeveloperModeUnlock();
  sequence.forEach((key, index) => {
    assert.equal(accept({ key: key.length === 1 ? key.toUpperCase() : key }), index === sequence.length - 1);
  });
  assert.equal(accept({ key: 'a' }), false);
});

test('developer sequence recovers from overlapping Up prefixes and wrong keys', () => {
  for (const prefix of [['ArrowUp'], ['ArrowUp', 'x'], ['ArrowUp', 'ArrowUp', 'ArrowDown', 'x']]) {
    const accept = createDeveloperModeUnlock();
    prefix.forEach((key) => assert.equal(accept({ key }), false));
    sequence.forEach((key, index) => assert.equal(accept({ key }), index === sequence.length - 1));
  }
});

test('repeated keydown cannot stand in for a second press and Shift can capitalize BABA', () => {
  const accept = createDeveloperModeUnlock();
  accept({ key: 'ArrowUp' });
  accept({ key: 'ArrowUp', repeat: true });
  sequence.slice(2).forEach((key) => assert.equal(accept({ key }), false));
  sequence.forEach((key, index) => {
    if (index === 8) assert.equal(accept({ key: 'Shift' }), false);
    assert.equal(accept({ key }), index === sequence.length - 1);
  });
});

test('editable controls, IME, consumed events and modifier shortcuts reset partial sequences', () => {
  for (const props of [
    { isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true },
    { defaultPrevented: true }, { target: { isContentEditable: true } },
    { target: { closest: () => ({ tagName: 'INPUT' }) } },
  ]) {
    const accept = createDeveloperModeUnlock();
    sequence.slice(0, 8).forEach((key) => accept({ key }));
    assert.equal(accept({ key: 'b', ...props }), false);
    sequence.slice(9).forEach((key) => assert.equal(accept({ key }), false));
    sequence.forEach((key, index) => assert.equal(accept({ key }), index === sequence.length - 1));
  }
});

test('locked developer settings are absent from navigation, search and deep links', () => {
  assert.deepEqual(getSettingsNavItems(), SETTINGS_NAV_ITEMS);
  assert.equal(getSettingsNavItems().some((item) => item.key === 'developer'), false);
  assert.equal(settingsNavIndexForKey('developer'), 0);
  assert.equal(searchSettings(settingsSearchEntries(), '开发者').length, 0);
  assert.equal(searchSettings(settingsSearchEntries(), '多进程').length, 0);
  const visible = getSettingsNavItems(true);
  assert.equal(visible[settingsNavIndexForKey('developer', true)].key, 'developer');
  assert.deepEqual(visible.slice(0, -1), SETTINGS_NAV_ITEMS);
  assert.equal(getSettingsNavGroups(true).at(-1).items.at(-1).label, '开发者模式');
  assert.equal(searchSettings(settingsSearchEntries(true), '多进程')[0].section, 'developer');
});

test('unlock survives settings remounts even when session storage is unavailable', () => {
  assert.equal(loadDeveloperModeUnlocked(), false);
  rememberDeveloperModeUnlocked();
  assert.equal(loadDeveloperModeUnlocked(), true);
});
