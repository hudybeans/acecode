import assert from 'node:assert/strict';
import { createSideChatController, SIDE_CHAT_HISTORY_MAX_BYTES } from './sideChatController.js';

function run(name, fn) {
  try { fn(); console.log(`[pass] side chat controller: ${name}`); }
  catch (error) { console.error(`[fail] side chat controller: ${name}`); throw error; }
}

function setup() {
  const requests = [];
  const controller = createSideChatController({
    startStream(options) {
      const request = { ...options, stops: 0, disposals: 0 };
      requests.push(request);
      return {
        stop() { request.stops++; },
        dispose() { request.disposals++; },
      };
    },
  });
  return { controller, requests, state: () => controller.getSnapshot() };
}

run('follow-ups include detached complete pairs and use the authoritative final answer', () => {
  const { controller, requests, state } = setup();
  controller.open();
  controller.setDraft('first question');
  assert.equal(controller.submit(), true);
  assert.deepEqual(requests[0].history, []);
  assert.equal(state().draft, '');
  assert.equal(state().turns[0].status, 'loading');
  requests[0].onDelta('first');
  assert.equal(state().turns[0].status, 'streaming');
  requests[0].onDone({ answer: 'first answer', cancelled: false });
  controller.submit('follow-up');
  assert.deepEqual(requests[1].history, [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
  ]);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
});

run('waiting, streaming and stop acknowledgement reject edits and duplicate submissions', () => {
  const { controller, requests, state } = setup();
  controller.submit('question');
  assert.equal(controller.submit('duplicate'), false);
  assert.equal(controller.setDraft('cannot edit while loading'), false);
  requests[0].onDelta('partial');
  assert.equal(controller.setDraft('cannot edit while streaming'), false);
  assert.equal(controller.stop(), true);
  assert.equal(controller.stop(), false);
  assert.equal(requests[0].stops, 1);
  assert.equal(state().busy, true);
  assert.equal(state().stopping, true);
  assert.equal(controller.submit('before ack'), false);
  requests[0].onDone({ answer: 'partial', cancelled: true });
  assert.equal(state().busy, false);
  assert.equal(state().stopping, false);
  assert.equal(state().turns[0].status, 'stopped');
  assert.equal(controller.setDraft('after ack'), true);
  assert.equal(controller.submit(), true);
  assert.deepEqual(requests[1].history, [
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'partial' },
  ]);
});

run('failed partial and empty cancelled turns stay visible but never enter history', () => {
  const { controller, requests, state } = setup();
  controller.submit('failed question');
  requests[0].onDelta('failed partial');
  requests[0].onError({ code: 'MODEL_ERROR', message: 'provider failed' });
  assert.equal(state().turns[0].answer, 'failed partial');
  assert.equal(state().turns[0].error, 'provider failed');
  assert.equal(state().turns[0].errorCode, 'MODEL_ERROR');
  assert.equal(state().busy, false);
  controller.submit('cancelled question');
  requests[1].onDone({ answer: ' \n ', cancelled: true });
  controller.submit('third question');
  assert.deepEqual(requests[2].history, []);
  assert.equal(state().turns.length, 3);
});

run('retry reset discards provisional output before the next attempt', () => {
  const { controller, requests, state } = setup();
  controller.submit('question');
  requests[0].onDelta('discarded attempt');
  requests[0].onReset();
  assert.equal(state().turns[0].answer, '');
  assert.equal(state().turns[0].status, 'loading');
  assert.equal(state().busy, true);
  requests[0].onDelta('second attempt');
  requests[0].onDone({ answer: 'second attempt' });
  assert.equal(state().turns[0].answer, 'second attempt');
});

run('whitespace-only completion is a visible failure and never becomes follow-up context', () => {
  const { controller, requests, state } = setup();
  controller.submit('question');
  requests[0].onDone({ answer: ' \n ' });
  assert.equal(state().turns[0].status, 'error');
  assert.equal(state().turns[0].errorCode, 'SIDE_CHAT_EMPTY_RESPONSE');
  assert.equal(state().busy, false);
  controller.submit('retry');
  assert.deepEqual(requests[1].history, []);
});

run('cancel acknowledgement cannot discard text already received', () => {
  const { controller, requests, state } = setup();
  controller.submit('question');
  requests[0].onDelta('partial answer');
  controller.stop();
  requests[0].onDone({ answer: '', cancelled: true });
  assert.equal(state().turns[0].answer, 'partial answer');
  assert.equal(state().turns[0].status, 'stopped');
});

run('closing cancels immediately and reopening preserves transcript and unsent draft', () => {
  const { controller, requests, state } = setup();
  controller.submit('question');
  requests[0].onDelta('partial');
  controller.close();
  assert.equal(requests[0].stops, 1);
  assert.equal(requests[0].disposals, 1);
  assert.equal(state().open, false);
  assert.equal(state().busy, false);
  assert.equal(state().turns[0].status, 'stopped');
  requests[0].onDelta('stale after close');
  requests[0].onDone({ answer: 'stale final' });
  controller.open();
  assert.equal(state().turns[0].answer, 'partial');
  controller.setDraft('unsent draft');
  controller.close();
  controller.open();
  assert.equal(state().draft, 'unsent draft');
});

run('session reset and dispose invalidate all previous callbacks', () => {
  const { controller, requests, state } = setup();
  controller.submit('old session');
  controller.reset();
  assert.equal(requests[0].stops, 1);
  assert.deepEqual(state(), { open: false, turns: [], draft: '', busy: false, stopping: false });
  controller.submit('new session');
  requests[0].onDelta('stale');
  requests[0].onReset();
  requests[0].onError({ message: 'stale error' });
  requests[0].onDone({ answer: 'stale final' });
  assert.equal(state().turns.length, 1);
  assert.equal(state().turns[0].answer, '');
  assert.equal(state().busy, true);
  controller.dispose();
  requests[1].onDone({ answer: 'stale after dispose' });
  assert.equal(state().turns.length, 0);
  assert.equal(requests[1].disposals, 1);
});

run('completed callbacks cannot overwrite the next active turn', () => {
  const { controller, requests, state } = setup();
  controller.submit('first');
  requests[0].onDone({ answer: 'answer' });
  controller.submit('second');
  requests[0].onDelta('late first delta');
  requests[0].onReset();
  requests[0].onDone({ answer: 'late first done' });
  assert.equal(state().turns[0].answer, 'answer');
  assert.equal(state().turns[1].answer, '');
  assert.equal(state().busy, true);
});

run('synchronous transport failure unlocks input and disposes its returned handle', () => {
  let disposals = 0;
  const controller = createSideChatController({ startStream({ onError }) {
    onError({ code: 'CONNECT', message: 'cannot connect' });
    return { dispose() { disposals++; } };
  } });
  controller.submit('question');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().turns[0].error, 'cannot connect');
  assert.equal(disposals, 1);
});

run('construction exceptions become visible errors instead of leaving a busy turn', () => {
  const controller = createSideChatController({ startStream() { throw new Error('startup failed'); } });
  controller.submit('question');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().turns[0].status, 'error');
  assert.equal(controller.getSnapshot().turns[0].error, 'startup failed');
});

run('question size is bounded in UTF8 bytes and preserves an invalid draft for editing', () => {
  const { controller, requests, state } = setup();
  controller.setDraft('中'.repeat(5334));
  assert.equal(controller.submit(), false);
  assert.equal(requests.length, 0);
  assert.equal(state().turns[0].errorCode, 'SIDE_CHAT_QUESTION_TOO_LONG');
  assert.equal(state().draft, '中'.repeat(5334));
  controller.setDraft('中'.repeat(5333));
  assert.equal(controller.submit(), true);
});

run('history size errors neither truncate successful pairs nor start a model request', () => {
  const { controller, requests, state } = setup();
  controller.submit('q');
  requests[0].onDone({ answer: 'a'.repeat(SIDE_CHAT_HISTORY_MAX_BYTES) });
  assert.equal(controller.submit('follow-up'), false);
  assert.equal(requests.length, 1);
  assert.equal(state().turns[0].answer.length, SIDE_CHAT_HISTORY_MAX_BYTES);
  assert.equal(state().turns[1].errorCode, 'SIDE_CHAT_HISTORY_TOO_LONG');
  assert.equal(state().busy, false);
});

run('history accepts 200 messages and rejects the next complete pair', () => {
  const { controller, requests, state } = setup();
  for (let i = 0; i < 101; i++) {
    assert.equal(controller.submit(`question ${i}`), true);
    requests[i].onDone({ answer: 'answer' });
  }
  assert.equal(requests[100].history.length, 200);
  assert.equal(controller.submit('over limit'), false);
  assert.equal(state().turns.at(-1).errorCode, 'SIDE_CHAT_HISTORY_TOO_LONG');
});

run('subscribers observe immutable snapshots and unsubscribe cleanly', () => {
  const { controller, state } = setup();
  const before = state();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => notifications++);
  controller.open();
  assert.equal(notifications, 1);
  assert.notEqual(state(), before);
  assert.equal(before.open, false);
  unsubscribe();
  controller.setDraft('draft');
  assert.equal(notifications, 1);
});
