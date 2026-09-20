import assert from 'node:assert/strict';
import {
  isComposerCompletionSelectionCollapsed,
  shouldHandleComposerDropdownKey,
} from './composerDropdownKeyboard.js';

const completionKeys = [
  'Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'PageUp', 'PageDown',
];

for (const key of completionKeys) {
  assert.equal(shouldHandleComposerDropdownKey({ key }), true, `${key} stays available to completion`);
  for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(
      shouldHandleComposerDropdownKey({ key, [modifier]: true }),
      false,
      `${modifier}+${key} stays available to the editor`,
    );
  }
  for (const compositionState of [{ isComposing: true }, { keyCode: 229 }, { which: 229 }]) {
    assert.equal(shouldHandleComposerDropdownKey({ key, ...compositionState }), false);
    assert.equal(shouldHandleComposerDropdownKey({ key, nativeEvent: compositionState }), false);
  }
  assert.equal(shouldHandleComposerDropdownKey({ key, defaultPrevented: true }), false);
}

assert.equal(shouldHandleComposerDropdownKey(null), false);
assert.equal(shouldHandleComposerDropdownKey({ key: 'Home', ctrlKey: true, shiftKey: true }), false);
console.log('ok - composer completion preserves modified editing keys and IME events');

assert.equal(isComposerCompletionSelectionCollapsed({ start: 3, end: 3 }), true);
assert.equal(isComposerCompletionSelectionCollapsed({ start: 0, end: 3, direction: 'forward' }), false);
assert.equal(isComposerCompletionSelectionCollapsed({ start: 0, end: 3, direction: 'backward' }), false);
assert.equal(isComposerCompletionSelectionCollapsed({ start: 3, end: 3, collapsed: false }), false);
assert.equal(isComposerCompletionSelectionCollapsed({ start: 3, end: 3, collapsed: true }), true);
assert.equal(isComposerCompletionSelectionCollapsed(null), false);
console.log('ok - composer completion closes for text and zero-length attachment selections');
