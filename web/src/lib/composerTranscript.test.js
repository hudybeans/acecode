import assert from 'node:assert/strict';
import { createTranscriptState, loadTranscriptHistory, reduceTranscriptEvent } from './sessionTranscript.js';
import { composerContentSignature } from './composerContent.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }
const composerContent = { version: 1, parts: [
  { type: 'text', text: 'before ' },
  { type: 'attachment', key: 'key-1', id: 'a1', name: 'a.png', kind: 'image' },
  { type: 'text', text: ' after ' },
  { type: 'skill', name: 'review', token: '$review' },
] };
const signature = composerContentSignature(composerContent);
const payload = { id: 'u1', role: 'user', content: 'before  after $review',
  metadata: { composer_content: composerContent, client_message_id: 'client-1' },
  content_parts: [{ type: 'image', attachment: { id: 'a1', name: 'a.png', blob_url: '/blob' } }],
};
const reduce = (state, payload, seq = 1, type = 'message') => reduceTranscriptEvent(state, { type, payload, seq }).state;

run('ordered user content has identical live and reloaded transcript projections', () => {
  const live = reduce(createTranscriptState(), payload);
  const loaded = loadTranscriptHistory(createTranscriptState(), { messages: [payload], events: [] }).state;
  assert.equal(composerContentSignature(live.items[0].composerContent), signature);
  assert.equal(composerContentSignature(loaded.items[0].composerContent), signature);
  assert.notEqual(live.items[0].composerContent, composerContent);
  assert.deepEqual(live.items[0].contentParts, loaded.items[0].contentParts);
});

run('repeated events update inline content in place and text-only echoes preserve it', () => {
  let state = reduce(createTranscriptState(), { id: 'u1', role: 'user', content: payload.content });
  state = reduce(state, payload, 2);
  assert.equal(state.items.length, 1);
  assert.equal(composerContentSignature(state.items[0].composerContent), signature);
  state = reduce(state, { id: 'u1', role: 'user', content: payload.content }, 3);
  assert.equal(composerContentSignature(state.items[0].composerContent), signature);
});

run('queued optimistic acceptance retains references when replaced by the persisted message', () => {
  let state = reduce(createTranscriptState(), { client_message_id: 'client-1', content: payload.content,
    composer_content: composerContent, content_parts: payload.content_parts }, 1, 'queued_input_accepted');
  assert.equal(composerContentSignature(state.items[0].composerContent), signature);
  assert.equal(state.items[0].contentParts.length, 1);
  state = reduce(state, payload, 2);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].messageId, 'u1');
  assert.equal(composerContentSignature(state.items[0].composerContent), signature);
});

run('legacy transcript messages do not acquire structured content or change their text', () => {
  const state = reduce(createTranscriptState(), { id: 'old', role: 'user', content: '/review hello' });
  assert.equal(state.items[0].content, '/review hello');
  assert.equal(state.items[0].composerContent, undefined);
});
