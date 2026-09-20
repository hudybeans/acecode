import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseSync, traverse } from '@babel/core';
import { createEditor, Editor, Point, Range, Transforms } from 'slate';
import { HistoryEditor, withHistory } from 'slate-history';
import { composerSelectedTag, composerTagSelection } from './composerSelection.js';
import {
  composerContentFromDocument,
  composerDocumentFromContent,
  isComposerInlineTag,
} from './richComposerModel.js';

const parts = [
  { type: 'path', path: 'a.js', token: '@a.js', directory: false },
  { type: 'attachment', key: 'file', id: 'file-1', name: 'notes.md', kind: 'file' },
  { type: 'skill', name: 'review', token: '$review' },
];

function fixture() {
  const editor = withHistory(createEditor());
  editor.isInline = isComposerInlineTag;
  editor.isVoid = isComposerInlineTag;
  editor.children = composerDocumentFromContent({ version: 1, parts });
  Transforms.select(editor, Editor.start(editor, []));
  return editor;
}

function run(name, check) {
  check();
  console.log(`[pass] ${name}`);
}

for (const [index, part] of parts.entries()) {
  run(`atomic selection includes only the ${part.type} among adjacent tags`, () => {
    const editor = fixture();
    const range = composerTagSelection(editor, [0, index * 2 + 1]);
    Transforms.select(editor, range);
    assert.deepEqual(composerContentFromDocument(Editor.fragment(editor, range)).parts, [part]);
    Transforms.delete(editor);
    assert.deepEqual(composerContentFromDocument(editor.children).parts, parts.filter((_, position) => position !== index));
    HistoryEditor.undo(editor);
    assert.deepEqual(composerContentFromDocument(editor.children).parts, parts);
  });
}

run('collapsed empty text between tags is a caret while an inline void child is selected', () => {
  const editor = fixture();
  Transforms.select(editor, { path: [0, 2], offset: 0 });
  assert.equal(composerSelectedTag(editor), null);
  Transforms.select(editor, { path: [0, 3, 0], offset: 0 });
  assert.deepEqual(composerSelectedTag(editor)[1], [0, 3]);
  Transforms.select(editor, composerTagSelection(editor, [0, 3]));
  assert.equal(composerSelectedTag(editor), null);
  assert.equal(Range.isExpanded(editor.selection), true);
});

// Exercise the production click callback with real Slate ranges; the small DOM
// adapter only identifies the tag that Chromium reports as the pointer target.
const source = fs.readFileSync(new URL('../components/RichComposer.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
let clickSource;
let pluginSource;
let mouseDownSource;
let moveSource;
traverse(ast, {
  FunctionDeclaration({ node }) {
    if (node.id.name === 'withComposerInlineTags') pluginSource = source.slice(node.start, node.end);
  },
  VariableDeclarator({ node }) {
    if (node.id.name === 'handleClick') {
      const callback = node.init.arguments[0];
      clickSource = source.slice(callback.start, callback.end);
    }
    if (node.id.name === 'handleMouseDown') {
      const callback = node.init.arguments[0];
      mouseDownSource = source.slice(callback.start, callback.end);
    }
    if (node.id.name === 'move' && node.init?.type === 'ArrowFunctionExpression') {
      moveSource = source.slice(node.init.start, node.init.end);
    }
  },
});
assert.ok(clickSource, 'Missing production handleClick');

function clickFixture(editor, tagPath, priorSelection = editor.selection) {
  const target = { closest: (selector) => selector === '[data-composer-inline-tag]' ? target : null };
  const pointerSelectionRef = { current: { x: 10, y: 10, selection: priorSelection } };
  const editableRef = { current: { contains: () => true, focus() {} } };
  const context = vm.createContext({
    editor, Point, Transforms, composerTagSelection, disabled: false,
    pointerSelectionRef, editableRef,
    ReactEditor: {
      toSlateNode: () => editor.children[tagPath[0]].children[tagPath[1]],
      findPath: () => tagPath,
    },
  });
  const callback = vm.runInContext(`(${clickSource})`, context);
  const event = {
    button: 0, clientX: 10, clientY: 10, target, shiftKey: false,
    preventDefault() {},
  };
  return { callback, event, context, pointerSelectionRef };
}

run('clicking a tag selects only that tag without adjacent zero-text attachments', () => {
  const editor = fixture();
  const test = clickFixture(editor, [0, 1]);
  test.callback(test.event);
  assert.deepEqual(composerContentFromDocument(Editor.fragment(editor, editor.selection)).parts, [parts[0]]);
});

run('Shift clicking from the exact left tag boundary selects the whole tag', () => {
  const editor = fixture();
  const expected = composerTagSelection(editor, [0, 1]);
  Transforms.select(editor, expected.anchor);
  const test = clickFixture(editor, [0, 1]);
  test.event.shiftKey = true;
  test.callback(test.event);
  assert.deepEqual(editor.selection, expected);
});

run('Shift clicking a leftward tag keeps the original anchor and selects across tags', () => {
  const editor = fixture();
  const anchor = Editor.end(editor, []);
  Transforms.select(editor, anchor);
  const test = clickFixture(editor, [0, 1]);
  test.event.shiftKey = true;
  test.callback(test.event);
  assert.deepEqual(editor.selection, { anchor, focus: Editor.start(editor, []) });
  assert.deepEqual(composerContentFromDocument(Editor.fragment(editor, editor.selection)).parts, parts);
});

run('a drag ending over a tag preserves its backward native selection', () => {
  const editor = fixture();
  const test = clickFixture(editor, [0, 1]);
  const selection = { anchor: Editor.end(editor, []), focus: Editor.start(editor, []) };
  Transforms.select(editor, selection);
  test.event.clientX = 40;
  assert.equal(test.callback(test.event), true);
  assert.deepEqual(editor.selection, selection);
});

run('tag pointer down starts an atomic selection and Shift preserves its original anchor', () => {
  const editor = fixture();
  const anchor = Editor.end(editor, []);
  Transforms.select(editor, anchor);
  const test = clickFixture(editor, [0, 1]);
  test.event.shiftKey = true;
  const mouseDown = vm.runInContext(`(${mouseDownSource})`, test.context);
  mouseDown(test.event);
  assert.deepEqual(editor.selection, { anchor, focus: Editor.start(editor, []) });
  assert.equal(test.pointerSelectionRef.current.active, true);
  assert.equal(test.pointerSelectionRef.current.shift, true);
  const selection = structuredClone(editor.selection);
  assert.equal(test.callback(test.event), true);
  assert.deepEqual(editor.selection, selection);
});

run('dragging left to the starting tag boundary keeps the whole starting tag selected', () => {
  const editor = fixture();
  const range = composerTagSelection(editor, [0, 3]);
  Transforms.select(editor, range);
  const hit = { closest: () => hit, matches: () => false };
  const pointerSelectionRef = { current: {
    x: 100, y: 10, active: true, tagRange: range, shift: false,
  } };
  const context = vm.createContext({
    editor, Point, Transforms, pointerSelectionRef,
    document: { elementFromPoint: () => hit },
    editable: {
      getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 100 }),
      contains: () => true, scrollTop: 0,
    },
    ReactEditor: { findEventRange: () => ({ anchor: range.anchor, focus: range.anchor }) },
  });
  const move = vm.runInContext(`(${moveSource})`, context);
  move({ buttons: 1, clientX: 90, clientY: 10, preventDefault() {} });
  assert.deepEqual(editor.selection, { anchor: range.focus, focus: range.anchor });
  assert.deepEqual(composerContentFromDocument(Editor.fragment(editor, editor.selection)).parts, [parts[1]]);
});

for (const operation of ['insertText', 'insertFragment', 'insertBreak', 'insertSoftBreak']) {
  run(`${operation} replaces a keyboard-selected inline void and supports undo`, () => {
    assert.ok(pluginSource, 'Missing production withComposerInlineTags');
    const context = vm.createContext({
      Editor, Range, Transforms, HistoryEditor, isComposerInlineTag,
      composerSelectedTag, composerTagSelection,
    });
    const plugin = vm.runInContext(`(${pluginSource})`, context);
    const editor = withHistory(plugin(createEditor()));
    editor.children = composerDocumentFromContent({ version: 1, parts });
    Transforms.select(editor, { path: [0, 3, 0], offset: 0 });
    const replacement = operation === 'insertText' || operation === 'insertFragment' ? 'replacement' : '\n';
    if (operation === 'insertText') editor.insertText(replacement);
    else if (operation === 'insertFragment') {
      editor.insertFragment(composerDocumentFromContent({ version: 1, parts: [{ type: 'text', text: replacement }] }));
    } else editor[operation]();
    assert.deepEqual(composerContentFromDocument(editor.children).parts, [
      parts[0], { type: 'text', text: replacement }, parts[2],
    ]);
    HistoryEditor.undo(editor);
    assert.deepEqual(composerContentFromDocument(editor.children).parts, parts);
    HistoryEditor.redo(editor);
    assert.deepEqual(composerContentFromDocument(editor.children).parts, [
      parts[0], { type: 'text', text: replacement }, parts[2],
    ]);
  });
}
