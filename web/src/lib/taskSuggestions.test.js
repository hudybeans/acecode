import assert from 'node:assert/strict';
import {
  createTaskSuggestionsController,
  normalizeTaskSuggestion,
  suggestionTargetRef,
  SUGGESTION_POLL_INTERVAL_MS,
  SUGGESTION_DISMISS_DELAY_MS,
} from './taskSuggestions.js';

const suggestion = (patch = {}) => ({
  id: 'suggestion-1', source_session_id: 'source', kind: 'side_task', status: 'pending',
  title: 'Repair event dispatch', description: 'The listener has no sender.', ...patch,
});
const response = (...suggestions) => ({ suggestions, worktree_available: true });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let n = 0; n < 10; n += 1) await Promise.resolve(); };

function harness(overrides = {}, options = {}) {
  const timers = new Map();
  const changes = [];
  const started = [];
  let nextTimer = 0;
  let time = 0;
  const api = {
    listTaskSuggestions: async () => response(suggestion()),
    acceptTaskSuggestion: async () => ({ suggestion: suggestion({ status: 'queued', location: 'current_branch' }) }),
    dismissTaskSuggestion: async () => ({ suggestion: suggestion({ status: 'dismissed' }) }),
    ...overrides,
  };
  const controller = createTaskSuggestionsController({
    api, sessionId: 'source', onChange: (state) => changes.push(state),
    onStarted: (...args) => started.push(args),
    now: () => time,
    setTimer: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay, due: time + delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    ...options,
  });
  const next = () => [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0] || [];
  return { controller, timers, changes, started, async tick() {
    const [id, timer] = next();
    assert.ok(timer, 'expected a scheduled timer');
    timers.delete(id);
    time = Math.max(time, timer.due);
    timer.fn();
    await settle();
  }, async advance(ms) {
    const target = time + ms;
    while (next()[1]?.due <= target) {
      const [id, timer] = next();
      timers.delete(id);
      time = timer.due;
      timer.fn();
      await settle();
    }
    time = target;
  }, jump(ms) {
    time += ms;
  } };
}

async function run(name, test) {
  await test();
  console.log(`[pass] ${name}`);
}

await run('suggestions reject another source and unknown states without inventing pending work', () => {
  assert.equal(normalizeTaskSuggestion(suggestion({ source_session_id: 'other' }), 'source'), null);
  assert.equal(normalizeTaskSuggestion(suggestion({ status: 'surprise' }), 'source'), null);
  assert.equal(normalizeTaskSuggestion(suggestion({ kind: 'surprise' }), 'source'), null);
});

await run('list alone never starts a task and idle suggestions do not poll', async () => {
  let accepted = 0;
  const h = harness({ acceptTaskSuggestion: () => { accepted += 1; } });
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().suggestions.length, 1);
  assert.equal(accepted, 0);
  assert.deepEqual([...h.timers.values()].map((timer) => timer.delay), [SUGGESTION_DISMISS_DELAY_MS]);
  h.controller.dispose();
});

await run('busy polling is single flight and bounded by the refresh interval', async () => {
  const pending = deferred();
  let calls = 0;
  const h = harness({ listTaskSuggestions: async () => { calls += 1; return pending.promise; } }, { busy: true });
  const first = h.controller.refresh();
  await h.controller.refresh();
  assert.equal(calls, 1);
  pending.resolve(response(suggestion()));
  await first;
  await h.tick();
  assert.equal(calls, 2);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === SUGGESTION_POLL_INTERVAL_MS));
  h.controller.dispose();
  assert.equal(h.timers.size, 0);
});

await run('session disposal aborts reads and ignores late response and navigation', async () => {
  const pending = deferred();
  let signal;
  const h = harness({ listTaskSuggestions: (_id, options) => { signal = options.signal; return pending.promise; } });
  const read = h.controller.refresh();
  h.controller.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(response(suggestion({ status: 'started' })));
  await read;
  assert.equal(h.changes.length, 0);
  assert.equal(h.started.length, 0);
  assert.equal(h.timers.size, 0);
});

await run('duplicate acceptance returns one request and keeps source and location exact', async () => {
  const pending = deferred();
  const calls = [];
  const h = harness({ acceptTaskSuggestion: (...args) => { calls.push(args); return pending.promise; } });
  await h.controller.refresh();
  const first = h.controller.accept('suggestion-1', 'current_branch');
  const second = h.controller.accept('suggestion-1', 'current_branch');
  assert.equal(first, second);
  await settle();
  assert.deepEqual(calls, [['source', 'suggestion-1', 'current_branch']]);
  pending.resolve({ suggestion: suggestion({ status: 'queued', location: 'current_branch' }) });
  await first;
  h.controller.dispose();
});

await run('a pre-accept GET cannot overwrite accepted queued state', async () => {
  const oldRead = deferred();
  let reads = 0;
  const h = harness({ listTaskSuggestions: async () => {
    reads += 1;
    return reads === 2 ? oldRead.promise : response(suggestion({ status: reads > 2 ? 'queued' : 'pending' }));
  } });
  await h.controller.refresh();
  const stale = h.controller.refresh();
  await h.controller.accept('suggestion-1', 'current_branch');
  oldRead.resolve(response(suggestion()));
  await stale;
  assert.equal(h.controller.getSnapshot().suggestions[0].status, 'queued');
  await h.tick();
  assert.equal(reads, 3);
  h.controller.dispose();
});

await run('dismiss failure leaves the card and allows another dismissal', async () => {
  let attempts = 0;
  const h = harness({ dismissTaskSuggestion: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('network unavailable');
    return { suggestion: suggestion({ status: 'dismissed' }) };
  } });
  await h.controller.refresh();
  await h.controller.dismiss('suggestion-1');
  assert.equal(h.controller.getSnapshot().suggestions.length, 1);
  assert.match(h.controller.getSnapshot().errors['suggestion-1'], /network/);
  assert.equal(h.controller.getSnapshot().errorActions['suggestion-1'], 'dismiss');
  await h.controller.dismiss('suggestion-1');
  assert.equal(attempts, 2);
  h.controller.dispose();
});

await run('initial historical handoff does not navigate but a newly accepted queued handoff does once', async () => {
  const historical = harness({ listTaskSuggestions: async () => response(suggestion({ kind: 'context_handoff', status: 'started' })) });
  await historical.controller.refresh();
  assert.equal(historical.started[0][1].continueInTarget, false);
  historical.controller.dispose();

  let current = suggestion({ kind: 'context_handoff' });
  const h = harness({
    listTaskSuggestions: async () => response(current),
    acceptTaskSuggestion: async () => {
      current = { ...current, status: 'queued', location: 'current_branch' };
      return { suggestion: current };
    },
  });
  await h.controller.refresh();
  await h.controller.accept(current.id, 'current_branch');
  await settle();
  assert.equal(h.started.length, 0);
  current = { ...current, status: 'started', target_session_id: 'next' };
  await h.tick();
  await h.controller.refresh();
  assert.equal(h.started.length, 1);
  assert.equal(h.started[0][1].continueInTarget, true);
  h.controller.dispose();
});

await run('queued cancellation is a dismissal and starting work cannot be cancelled locally', async () => {
  let dismissed = 0;
  const h = harness({
    listTaskSuggestions: async () => response(suggestion({ status: 'starting' })),
    dismissTaskSuggestion: async () => { dismissed += 1; },
  });
  await h.controller.refresh();
  await h.controller.dismiss('suggestion-1');
  assert.equal(dismissed, 0);
  h.controller.dispose();
});

await run('unsupported old backends stop optional polling without touching the conversation', async () => {
  for (const status of [404, 405]) {
    let calls = 0;
    const h = harness({ listTaskSuggestions: async () => { calls += 1; throw { status }; } }, { busy: true });
    await h.controller.refresh();
    await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().unsupported, true);
    assert.equal(calls, 1);
    assert.equal(h.timers.size, 0);
    h.controller.dispose();
  }
});

await run('three read failures pause retries and explicit retry resumes them', async () => {
  let calls = 0;
  const h = harness({ listTaskSuggestions: async () => {
    calls += 1;
    if (calls <= 3) throw new Error('offline');
    return response(suggestion());
  } }, { busy: true });
  await h.controller.refresh();
  await h.tick();
  await h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.controller.getSnapshot().refreshError, 'offline');
  await h.controller.retryRefresh();
  assert.equal(calls, 4);
  assert.equal(h.controller.getSnapshot().refreshError, '');
  h.controller.dispose();
});

await run('a source awaiting restore does not disable the endpoint as an old backend', async () => {
  let calls = 0;
  const h = harness({ listTaskSuggestions: async () => {
    calls += 1;
    if (calls === 1) throw { status: 404, body: { error: 'unknown source session' } };
    return response(suggestion());
  } });
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().unsupported, false);
  await h.tick();
  assert.equal(h.controller.getSnapshot().suggestions.length, 1);
  assert.deepEqual([...h.timers.values()].map((timer) => timer.delay), [SUGGESTION_DISMISS_DELAY_MS]);
  h.controller.dispose();
});

await run('both suggestion kinds dismiss exactly once after 30 seconds without acceptance or resurrection', async () => {
  for (const kind of ['side_task', 'context_handoff']) {
    let current = suggestion({ kind });
    const calls = [];
    const h = harness({
      listTaskSuggestions: async () => response(current),
      acceptTaskSuggestion: () => assert.fail('countdown must never accept a task'),
      dismissTaskSuggestion: async (...args) => {
        calls.push(args);
        current = { ...current, status: 'dismissed' };
        return { suggestion: current };
      },
    });
    await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().dismissDeadlines[current.id], 30_000);
    await h.advance(29_999);
    assert.equal(calls.length, 0);
    await h.advance(1);
    assert.deepEqual(calls, [['source', current.id]]);
    assert.deepEqual(h.controller.getSnapshot().suggestions, []);
    await h.controller.refresh();
    await h.advance(60_000);
    assert.equal(calls.length, 1);
    assert.deepEqual(h.controller.getSnapshot().suggestions, []);
    h.controller.dispose();
  }
});

await run('polling keeps the original deadline and later cards receive their own 30 seconds', async () => {
  const first = suggestion();
  const second = suggestion({ id: 'later', kind: 'context_handoff' });
  let current = [first];
  const closed = [];
  const h = harness({
    listTaskSuggestions: async () => response(...current),
    dismissTaskSuggestion: async (_source, id) => {
      closed.push(id);
      const item = current.find((entry) => entry.id === id);
      current = current.filter((entry) => entry.id !== id);
      return { suggestion: { ...item, status: 'dismissed' } };
    },
  }, { busy: true });
  await h.controller.refresh();
  await h.advance(10_000);
  current.push(second);
  await h.controller.refresh();
  assert.deepEqual(h.controller.getSnapshot().dismissDeadlines, { 'suggestion-1': 30_000, later: 40_000 });
  await h.advance(20_000);
  assert.deepEqual(closed, ['suggestion-1']);
  await h.advance(10_000);
  assert.deepEqual(closed, ['suggestion-1', 'later']);
  h.controller.dispose();
});

await run('accepting at the deadline stops auto-close even while the accept request is in flight', async () => {
  const accepted = deferred();
  let current = suggestion();
  const h = harness({
    listTaskSuggestions: async () => response(current),
    acceptTaskSuggestion: () => accepted.promise,
    dismissTaskSuggestion: () => assert.fail('accepted tasks must not be cancelled by the timer'),
  });
  await h.controller.refresh();
  await h.advance(29_999);
  const request = h.controller.accept(current.id, 'current_branch');
  assert.deepEqual(h.controller.getSnapshot().dismissDeadlines, {});
  await h.advance(60_000);
  current = { ...current, status: 'queued' };
  accepted.resolve({ suggestion: current });
  await request;
  await h.advance(60_000);
  h.controller.dispose();
});

await run('automatic close failure stays visible and never loops but manual retry remains available', async () => {
  let attempts = 0;
  let current = suggestion();
  const h = harness({
    listTaskSuggestions: async () => response(current),
    dismissTaskSuggestion: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      current = { ...current, status: 'dismissed' };
      return { suggestion: current };
    },
  });
  await h.controller.refresh();
  await h.advance(30_000);
  assert.equal(h.controller.getSnapshot().errors[current.id], 'offline');
  assert.equal(h.controller.getSnapshot().suggestions.length, 1);
  assert.deepEqual(h.controller.getSnapshot().dismissDeadlines, {});
  await h.controller.refresh();
  await h.advance(60_000);
  assert.equal(attempts, 1);
  await h.controller.dismiss(current.id);
  assert.equal(attempts, 2);
  assert.equal(h.controller.getSnapshot().suggestions.length, 0);
  h.controller.dispose();
});

await run('remote state changes and errors stop countdowns without silently cancelling queued work', async () => {
  for (const patch of [{ status: 'queued' }, { status: 'starting' }, { status: 'started' }, { status: 'failed' }, { error: 'recoverable failure' }]) {
    let current = suggestion();
    const h = harness({
      listTaskSuggestions: async () => response(current),
      dismissTaskSuggestion: () => assert.fail('non-pending or failed cards must remain visible'),
    });
    await h.controller.refresh();
    await h.advance(10_000);
    current = { ...current, ...patch };
    await h.controller.refresh();
    assert.deepEqual(h.controller.getSnapshot().dismissDeadlines, {});
    await h.advance(60_000);
    h.controller.dispose();
  }
});

await run('manual close and a pending expiry share one request', async () => {
  const dismissed = deferred();
  let calls = 0;
  const h = harness({ dismissTaskSuggestion: () => { calls += 1; return dismissed.promise; } });
  await h.controller.refresh();
  await h.advance(30_000);
  const request = h.controller.dismiss('suggestion-1');
  await settle();
  assert.equal(calls, 1);
  dismissed.resolve({ suggestion: suggestion({ status: 'dismissed' }) });
  await request;
  h.controller.dispose();
});

await run('delayed timers use the absolute deadline and disposal clears expiry callbacks', async () => {
  let calls = 0;
  const h = harness({ dismissTaskSuggestion: async () => {
    calls += 1;
    return { suggestion: suggestion({ status: 'dismissed' }) };
  } });
  await h.controller.refresh();
  h.jump(45_000);
  await h.tick();
  assert.equal(calls, 1);
  h.controller.dispose();

  const other = harness({ dismissTaskSuggestion: () => assert.fail('old source countdown must be disposed') });
  await other.controller.refresh();
  const stale = [...other.timers.values()][0].fn;
  other.controller.dispose();
  assert.equal(other.timers.size, 0);
  stale();
  await settle();
});

await run('target navigation preserves real worktree path and excludes source-only state', () => {
  const source = {
    sessionId: 'source', workspaceHash: 'workspace', cwd: 'C:/repo', workingCwd: 'C:/repo/wt',
    port: 28080, token: 'test', initialDraft: 'old draft', searchMatch: { messageOrdinal: 9 },
    remote_control_bound: true,
  };
  const target = suggestionTargetRef(suggestion({ target_session: {
    id: 'target', cwd: 'C:/repo', working_cwd: 'C:/repo/new-wt', workspace_hash: 'workspace',
  } }), source);
  assert.equal(target.sessionId, 'target');
  assert.equal(target.workingCwd, 'C:/repo/new-wt');
  assert.equal(target.token, 'test');
  assert.equal(target.initialDraft, undefined);
  assert.equal(target.searchMatch, undefined);
  assert.equal(target.remote_control_bound, undefined);
  assert.equal(suggestionTargetRef(suggestion({ target_session_id: 'target' }), source).workingCwd, 'C:/repo/wt');
  assert.equal(suggestionTargetRef(suggestion({ target_session_id: 'target', target_working_cwd: 'C:/repo/next-wt' }), source).workingCwd, 'C:/repo/next-wt');
});
