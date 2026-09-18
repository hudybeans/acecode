import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trailingUserMessageRetryId } from './trailingUserMessageRetry.js';
import { createTranscriptState, loadTranscriptHistory, reduceTranscriptEvent } from './sessionTranscript.js';

const user = { role: 'user', content: 'original', id: 'user-1' };
const loaded = (...messages) => loadTranscriptHistory(createTranscriptState(), { messages }).state;
const retryId = (state) => trailingUserMessageRetryId({ ...state, sessionId: 'session-1' });

assert.equal(retryId(loaded(user)), 'user-1');
assert.equal(retryId(loaded()), '');
assert.equal(retryId(loaded({ ...user, id: '' })), '');
for (const role of ['assistant', 'tool', 'system', 'error']) {
  for (const content of ['', 'later content']) {
    assert.equal(retryId(loaded(user, { role, content })), '', `${role} must block even when empty`);
  }
}
const history = [user, { role: 'assistant', content: 'done' }, { ...user, id: 'user-2' }];
assert.equal(retryId(loaded(...history)), 'user-2');
assert.equal(retryId(loaded(...history, { role: 'assistant', content: '', tool_calls: [
  { id: 'call-1', type: 'function', function: { name: 'bash', arguments: '{}' } },
] })), '');

for (const blocker of [
  { loadState: 'loading' }, { loadState: 'error' }, { busy: true },
  { status: 'running' }, { streamingId: 0 }, { disabled: true },
]) assert.equal(retryId({ ...loaded(user), ...blocker }), '');
assert.equal(trailingUserMessageRetryId(loaded(user)), '');
for (const extra of [{ queued: {} }, { streaming: true }, { messageId: '' }]) {
  assert.equal(retryId({ ...loaded(user), items: [{ ...loaded(user).items[0], ...extra }] }), '');
}
for (const event of [
  { type: 'token', payload: { text: 'answer' } },
  { type: 'reasoning', payload: { text: 'thinking' } },
  { type: 'tool_start', payload: { tool: 'bash', tool_call_id: 'call-1' } },
  { type: 'message', payload: { role: 'system', content: 'later notice' } },
]) {
  const next = reduceTranscriptEvent(loaded(user), event).state;
  assert.equal(retryId(next), '', `${event.type} must invalidate the previous tail`);
}

// The two UI actions must share a gate, and the send path must inspect the
// latest complete store rather than composer history or a rendered window.
const inputBar = fs.readFileSync(new URL('../components/InputBar.jsx', import.meta.url), 'utf8');
assert.match(inputBar, /const submit = \(\) => \{\s*if \(!actionState\.canSubmit\) return;/);
assert.match(inputBar, /onSubmit=\{submit\}/);
assert.match(inputBar, /onClick=\{submit\}/);
const chat = fs.readFileSync(new URL('../components/ChatView.jsx', import.meta.url), 'utf8');
assert.match(chat, /trailingUserMessageRetryId\(\{\s*sessionId: sid, items, loadState:/);
assert.match(chat, /const latest = transcript\.getState\(\);/);
assert.match(chat, /if \(latestRetryId !== retryUserMessageId\) return;/);
assert.match(chat, /api\.retryLastUserMessage\(sid, latestRetryId\)/);
console.log('[pass] trailing user message retry uses the complete transcript and rejects stale or non-user tails');
