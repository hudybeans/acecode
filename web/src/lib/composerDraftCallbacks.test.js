import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseSync, traverse } from '@babel/core';
import { composerDraftEditFingerprint } from './composerDraft.js';

// Execute production receipt guards. A stale response must not modify the
// current editor or its attachment registry, even when its plain text matches.
const source = fs.readFileSync(new URL('../components/ChatView.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const callbacks = new Map();
traverse(ast, {
  VariableDeclarator({ node }) {
    if (node.id.name === 'clearCurrentSessionDraft') {
      const callback = node.init.arguments[0];
      callbacks.set('clear', source.slice(callback.start, callback.end));
    }
  },
  CallExpression({ node }) {
    if (node.callee?.name === 'useEffect' && source.slice(node.start, node.end).includes('acceptedHomeSubmission')) {
      callbacks.set('homeCleanup', source.slice(node.arguments[0].start, node.arguments[0].end));
      callbacks.set('homeCleanupDeps', source.slice(node.arguments[1].start, node.arguments[1].end));
    }
    const previous = node.callee?.object;
    if (node.callee?.property?.name === 'then' && previous?.callee?.name === 'createHomeComposerSession') {
      const callback = node.arguments[0];
      callbacks.set('homeReceipt', source.slice(callback.start, callback.end));
    }
    if (node.callee?.property?.name === 'then'
      && previous?.type === 'CallExpression'
      && previous.callee?.object?.name === 'api'
      && previous.callee?.property?.name === 'interruptTurn') {
      const callback = node.arguments[0];
      callbacks.set('turnReceipt', source.slice(callback.start, callback.end));
    }
  },
});
for (const name of ['clear', 'homeReceipt', 'turnReceipt']) assert.ok(callbacks.has(name), `Missing production callback: ${name}`);

function run(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

function content({ id = '', leading = false, repeated = false } = {}) {
  const file = { type: 'attachment', key: 'upload-key', id, name: 'notes.md', kind: 'file' };
  const parts = leading
    ? [file, { type: 'text', text: 'before after' }]
    : [{ type: 'text', text: 'before ' }, file, { type: 'text', text: 'after' }];
  if (repeated) parts.push({ ...file });
  return { version: 1, parts };
}

function fixture({ activeKey = 'workspace:task-a', current = content(), text = 'before after' } = {}) {
  const state = { sets: [], saves: [], extraClears: 0, history: [], notifications: [] };
  const context = vm.createContext({
    composerDraftEditFingerprint,
    sid: 'task-a', draftWorkspaceHash: 'workspace', draftSessionKey: 'workspace:task-a',
    draftSessionKeyRef: { current: activeKey }, composerValueRef: { current: text },
    composerContentRef: { current }, draftEditVersionRef: { current: 7 },
    setComposerValue: (value) => state.sets.push(value),
    persistDraftValue: (...args) => { state.saves.push(args); return Promise.resolve(); },
    clearComposerExtras: () => { state.extraClears += 1; },
    recordInputHistory: (value) => state.history.push(value),
    toast: (value) => state.notifications.push(value),
    route: { display_text: '/turn before after' },
    submittedComposerText: 'before after', submittedComposerContent: content(),
    sidRef: { current: activeKey.split(':').at(-1) }, id: 'task-a',
  });
  const clear = vm.runInContext(`(${callbacks.get('clear')})`, context);
  context.clearCurrentSessionDraft = clear;
  return { state, context, clear };
}

function assertUntouched(test) {
  assert.deepEqual(test.state.sets, []);
  assert.deepEqual(test.state.saves, []);
  assert.equal(test.context.draftEditVersionRef.current, 7);
  assert.equal(test.state.extraClears, 0);
}

run('a receipt for another scope preserves a matching current draft and its resources', () => {
  const test = fixture({ activeKey: 'workspace:task-b' });
  assert.equal(test.clear({ expectedText: 'before after', expectedContent: content() }), false);
  assertUntouched(test);
});

run('same-text drafts with a moved file survive the previous send receipt', () => {
  const test = fixture({ current: content({ leading: true }) });
  assert.equal(test.clear({ expectedText: 'before after', expectedContent: content() }), false);
  assertUntouched(test);
});

run('adding a second occurrence is a new draft even though its text and resource ID are unchanged', () => {
  const test = fixture({ current: content({ repeated: true }) });
  assert.equal(test.clear({ expectedText: 'before after', expectedContent: content() }), false);
  assertUntouched(test);
});

run('upload completion can change IDs without preventing the accepted draft from clearing', () => {
  const test = fixture({ current: content({ id: 'uploaded-id' }) });
  assert.equal(test.clear({ expectedText: 'before after', expectedContent: content() }), true);
  assert.deepEqual(test.state.sets, ['']);
  assert.deepEqual(test.state.saves, [['task-a', 'workspace', 'workspace:task-a', '']]);
  assert.equal(test.context.draftEditVersionRef.current, 8);
});

run('a new text edit prevents the earlier receipt from clearing a draft', () => {
  const test = fixture({ text: 'next message' });
  assert.equal(test.clear({ expectedText: 'before after', expectedContent: content() }), false);
  assertUntouched(test);
});

run('the actual turn-interruption receipt retains later edits and their attachment resources', () => {
  const test = fixture({ current: content({ leading: true }) });
  vm.runInContext(`(${callbacks.get('turnReceipt')})`, test.context)();
  assertUntouched(test);
  assert.deepEqual(test.state.history, ['/turn before after']);
});

run('the actual turn-interruption receipt only clears extras after its matching draft clears', () => {
  const test = fixture();
  vm.runInContext(`(${callbacks.get('turnReceipt')})`, test.context)();
  assert.deepEqual(test.state.sets, ['']);
  assert.equal(test.state.extraClears, 1);
});

function homeFixture({ workspace = 'workspace', attachments = false, failSend = false } = {}) {
  const submittedContent = attachments
    ? content() : { version: 1, parts: [{ type: 'text', text: 'before after' }] };
  const test = fixture({ activeKey: '', current: submittedContent });
  const { context, state } = test;
  let previousDeps;
  Object.assign(context, {
    api: {},
    sid: '', draftSessionKey: '', draftReadyKey: '', acceptedHomeSubmission: null,
    sessionCreated: false, createdSessionId: '', pendingAttachmentFiles: [],
    payload: { text: 'before after', composer_content: submittedContent },
    submittedComposerContent: submittedContent,
    payloadWithAttachmentIds: (payload) => payload,
    setPendingNewSessionFirstUserMessage() {}, applyEvent() {},
    isBuiltin: false, explicitHomeSend: true, worktreeIntent: null,
    hasExtras: attachments, hasSwarmMode: false,
    composerDirtyRef: { current: true },
    sendInputOrBuiltin: async () => {
      if (failSend) throw new Error('send failed');
    },
    submittedHomeDraftWorkspaceHash: workspace,
    submittedHomeDraftText: { text: 'before after', composer_content: submittedContent },
    onHomeComposerDraftAccepted: () => { state.homeAccepted += 1; },
    setComposerValue: (value) => {
      state.sets.push(value);
      context.composerValueRef.current = value;
      context.composerContentRef.current = null;
    },
    setAcceptedHomeSubmission: (value) => {
      context.acceptedHomeSubmission = typeof value === 'function'
        ? value(context.acceptedHomeSubmission) : value;
    },
  });
  state.homeAccepted = 0;
  const receipt = vm.runInContext(`(${callbacks.get('homeReceipt')})`, context);
  const render = () => {
    // Before the repair there is no replay effect: running the original receipt
    // and then committing navigation reproduces the nonempty composer.
    if (!callbacks.has('homeCleanup')) return;
    const deps = vm.runInContext(callbacks.get('homeCleanupDeps'), context);
    if (previousDeps && deps.every((dep, index) => Object.is(dep, previousDeps[index]))) return;
    previousDeps = deps;
    vm.runInContext(`(${callbacks.get('homeCleanup')})`, context)();
  };
  const activate = (sid = 'task-a', ready = true) => {
    context.sid = sid;
    context.sidRef.current = sid;
    context.draftWorkspaceHash = workspace;
    context.draftSessionKey = sid ? `${workspace}:${sid}` : '';
    context.draftSessionKeyRef.current = context.draftSessionKey;
    context.draftReadyKey = ready ? context.draftSessionKey : '';
    // useCallback creates a new session-scoped clear function after navigation.
    context.clearCurrentSessionDraft = vm.runInContext(`(${callbacks.get('clear')})`, context);
    render();
  };
  return {
    ...test, render, activate,
    async accept() { await receipt({ id: 'task-a' }); render(); },
    ready() { context.draftReadyKey = context.draftSessionKey; render(); },
  };
}

async function runHome(name, fn) {
  await fn();
  console.log(`[pass] ${name}`);
}

await runHome('home receipt before navigation clears the accepted text once the destination draft is ready', async () => {
  const test = homeFixture();
  await test.accept();
  test.activate('task-a', false);
  assert.deepEqual(test.state.sets, [], 'a not-yet-ready draft must not be consumed');
  test.ready();
  assert.equal(test.context.composerValueRef.current, '', 'accepted home text must not remain after promotion');
  assert.deepEqual(test.state.saves, [['task-a', 'workspace', 'workspace:task-a', '']]);
  assert.equal(test.state.homeAccepted, 1);
  test.render();
  assert.equal(test.state.sets.length, 1, 'acceptance is consumed once');
});

await runHome('navigation before a home receipt clears the accepted text, extras, and saved draft', async () => {
  const test = homeFixture({ attachments: true });
  test.activate();
  assert.deepEqual(test.state.sets, []);
  await test.accept();
  assert.equal(test.context.composerValueRef.current, '');
  assert.equal(test.state.extraClears, 1);
  assert.deepEqual(test.state.saves, [['task-a', 'workspace', 'workspace:task-a', '']]);
});

await runHome('no-workspace home submission also clears after deferred navigation', async () => {
  const test = homeFixture({ workspace: '' });
  await test.accept();
  test.activate();
  assert.equal(test.context.composerValueRef.current, '');
  assert.deepEqual(test.state.saves, [['task-a', '', ':task-a', '']]);
});

await runHome('newer text survives an accepted home receipt and is never cleared by a later render', async () => {
  const test = homeFixture({ attachments: true });
  await test.accept();
  test.context.composerValueRef.current = 'next message';
  test.activate();
  assertUntouched(test);
  assert.equal(test.context.acceptedHomeSubmission, null);
  test.context.composerValueRef.current = 'before after';
  test.render();
  assertUntouched(test);
});

await runHome('moving an inline file while sending preserves the edited draft and resources', async () => {
  const test = homeFixture({ attachments: true });
  test.activate();
  test.context.composerContentRef.current = content({ leading: true });
  await test.accept();
  assertUntouched(test);
});

await runHome('upload metadata completion does not prevent the accepted home draft from clearing', async () => {
  const test = homeFixture({ attachments: true });
  await test.accept();
  test.context.composerContentRef.current = content({ id: 'uploaded-id' });
  test.activate();
  assert.equal(test.context.composerValueRef.current, '');
  assert.equal(test.state.extraClears, 1);
});

await runHome('home receipt never clears an unrelated active task with identical text and files', async () => {
  const test = homeFixture({ attachments: true });
  test.activate('task-b');
  await test.accept();
  assertUntouched(test);
  test.activate();
  assert.equal(test.context.composerValueRef.current, '');
  assert.deepEqual(test.state.saves, [['task-a', 'workspace', 'workspace:task-a', '']]);
});

await runHome('a late destination draft load is cleared only after restoration finishes', async () => {
  const test = homeFixture();
  test.activate('task-a', false);
  test.context.composerValueRef.current = '';
  await test.accept();
  assert.deepEqual(test.state.sets, []);
  test.context.composerValueRef.current = 'before after';
  test.ready();
  assert.equal(test.context.composerValueRef.current, '');
  assert.equal(test.state.saves.length, 1);
});

await runHome('a failed home send preserves the submitted text, resources, and home draft', async () => {
  const test = homeFixture({ attachments: true, failSend: true });
  await assert.rejects(test.accept(), /send failed/);
  test.activate();
  assertUntouched(test);
  assert.equal(test.context.acceptedHomeSubmission, null);
  assert.equal(test.context.composerValueRef.current, 'before after');
  assert.equal(test.state.homeAccepted, 0);
});
