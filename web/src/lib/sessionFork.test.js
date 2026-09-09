import assert from 'node:assert/strict';
import { forkRestoredPrompt } from './sessionFork.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('restores the prompt when the fork target was a user message', () => {
  assert.equal(forkRestoredPrompt({ restored_prompt: 'reword me' }), 'reword me');
});

run('restores nothing when the fork target was not a user message', () => {
  assert.equal(forkRestoredPrompt({}), '');
  assert.equal(forkRestoredPrompt({ restored_prompt: '' }), '');
  assert.equal(forkRestoredPrompt({ restored_prompt: 42 }), '');
  assert.equal(forkRestoredPrompt(null), '');
  assert.equal(forkRestoredPrompt(undefined), '');
});
