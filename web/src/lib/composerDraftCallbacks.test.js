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
    if (node.id.name === 'stillSubmittedDraft') {
      callbacks.set('homeGuard', source.slice(node.init.start, node.init.end));
    }
  },
  CallExpression({ node }) {
    const previous = node.callee?.object;
    if (node.callee?.property?.name === 'then'
      && previous?.type === 'CallExpression'
      && previous.callee?.object?.name === 'api'
      && previous.callee?.property?.name === 'interruptTurn') {
      const callback = node.arguments[0];
      callbacks.set('turnReceipt', source.slice(callback.start, callback.end));
    }
  },
});
for (const name of ['clear', 'homeGuard', 'turnReceipt']) assert.ok(callbacks.has(name), `Missing production callback: ${name}`);

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

run('a home-send receipt cannot clear a different promoted task with identical content', () => {
  const test = fixture({ activeKey: 'workspace:task-b' });
  assert.equal(vm.runInContext(`(${callbacks.get('homeGuard')})`, test.context), false);
  test.context.sidRef.current = 'task-a';
  assert.equal(vm.runInContext(`(${callbacks.get('homeGuard')})`, test.context), true);
  test.context.composerContentRef.current = content({ leading: true });
  assert.equal(vm.runInContext(`(${callbacks.get('homeGuard')})`, test.context), false);
});
