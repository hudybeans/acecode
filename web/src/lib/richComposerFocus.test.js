import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseSync, traverse } from '@babel/core';

const source = fs.readFileSync(new URL('../components/RichComposer.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
let method;
traverse(ast, {
  ObjectMethod({ node }) {
    if (node.key.name === 'focus') method = source.slice(node.start, node.end);
  },
});
assert.ok(method, 'The production composer must expose imperative focus');

function fixture({ pending = false, selection = true, domFailure = false } = {}) {
  const state = { focused: 0, repairs: 0, frames: [] };
  const editor = { children: [], selection: selection ? {} : null, operations: pending ? [{}] : [] };
  const editableRef = { current: { isConnected: true } };
  const scope = {
    editor, editableRef, latestTextRef: { current: '' },
    composerSelectionFromPlainTextRange: () => ({}),
    Transforms: { select: (target, value) => {
      target.selection = value;
      target.operations.push({ type: 'set_selection' });
    } },
    ReactEditor: { focus: () => {
      state.focused += 1;
      if (domFailure) { domFailure = false; throw new Error('DOM mapping pending'); }
    } },
    ensureLegalEditorDocument: () => { state.repairs += 1; },
    window: { requestAnimationFrame: (callback) => { state.frames.push(callback); } },
  };
  const focus = vm.runInNewContext(`({ ${method} }).focus`, scope);
  return { state, editor, editableRef, focus,
    flush() {
      editor.operations = [];
      const frames = state.frames.splice(0);
      frames.forEach((callback) => callback());
    },
  };
}

function run(name, check) {
  check();
  console.log(`[pass] ${name}`);
}

run('focus waits for pending Slate operations without starting an unmanaged native retry', () => {
  const test = fixture({ pending: true });
  test.focus();
  assert.equal(test.state.focused, 0);
  assert.equal(test.state.frames.length, 1);
  test.flush();
  assert.equal(test.state.focused, 1);
  assert.equal(test.state.frames.length, 0);
});

run('an empty selection is committed before attempting DOM focus', () => {
  const test = fixture({ selection: false });
  test.focus();
  assert.ok(test.editor.selection);
  assert.equal(test.state.focused, 0);
  test.flush();
  assert.equal(test.state.focused, 1);
});

run('unmounting the input cancels the effect of an already scheduled focus retry', () => {
  const test = fixture({ pending: true });
  test.focus();
  test.editableRef.current = null;
  test.flush();
  assert.equal(test.state.focused, 0);
});

run('a disconnected editor is never focused', () => {
  const test = fixture();
  test.editableRef.current.isConnected = false;
  test.focus();
  assert.equal(test.state.focused, 0);
  assert.equal(test.state.frames.length, 0);
});

run('a missing DOM mapping gets one guarded retry after a frame', () => {
  const test = fixture({ domFailure: true });
  test.focus();
  assert.equal(test.state.repairs, 1);
  test.flush();
  assert.equal(test.state.focused, 2);
});

run('an already synchronized editor focuses immediately', () => {
  const test = fixture();
  test.focus();
  assert.equal(test.state.focused, 1);
  assert.equal(test.state.frames.length, 0);
});
