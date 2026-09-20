import assert from 'node:assert/strict';
import { createEditor, Editor, Transforms } from 'slate';
import { HistoryEditor, withHistory } from 'slate-history';
import { synchronizeComposerLeadingCommand } from './composerCommandSync.js';
import {
  composerContentFromDocument,
  composerDocumentFromContent,
  composerDocumentFromText,
  composerLeadingCommandSignature,
  composerTextFromDocument,
  isComposerInlineTag,
} from './richComposerModel.js';

const commands = [{ name: 'init', token: '/init', kind: 'builtin', description: 'Initialize' }];

function fixture(document = composerDocumentFromText('')) {
  const editor = withHistory(createEditor());
  editor.isInline = isComposerInlineTag;
  editor.isVoid = isComposerInlineTag;
  editor.children = document;
  Transforms.select(editor, Editor.end(editor, []));
  return editor;
}

function run(name, check) {
  check();
  console.log(`[pass] ${name}`);
}

run('automatic command tagging belongs to the typed command undo and redo batch', () => {
  const editor = fixture();
  editor.insertText('/init');
  assert.equal(synchronizeComposerLeadingCommand(editor, commands), false);
  editor.insertText(' ');
  assert.equal(synchronizeComposerLeadingCommand(editor, commands), true);
  assert.ok(composerLeadingCommandSignature(editor.children));
  assert.equal(composerTextFromDocument(editor.children), '/init ');
  assert.equal(editor.history.undos.length, 1);
  const committed = structuredClone(editor.children);
  HistoryEditor.undo(editor);
  assert.equal(composerTextFromDocument(editor.children), '');
  assert.equal(composerLeadingCommandSignature(editor.children), '');
  HistoryEditor.redo(editor);
  assert.deepEqual(editor.children, committed);
  assert.deepEqual(editor.selection.anchor, Editor.end(editor, []));
});

run('undoing only the committing space restores editable command text', () => {
  const editor = fixture(composerDocumentFromText('/init'));
  HistoryEditor.withNewBatch(editor, () => editor.insertText(' '));
  synchronizeComposerLeadingCommand(editor, commands);
  HistoryEditor.undo(editor);
  assert.equal(composerTextFromDocument(editor.children), '/init');
  assert.equal(composerLeadingCommandSignature(editor.children), '');
  assert.deepEqual(editor.selection.anchor, Editor.end(editor, []));
  HistoryEditor.redo(editor);
  assert.ok(composerLeadingCommandSignature(editor.children));
  assert.equal(composerTextFromDocument(editor.children), '/init ');
});

run('command synchronization preserves adjacent zero-text attachment occurrences and caret', () => {
  const attachment = { type: 'attachment', key: 'file', id: 'file-1', name: 'notes.md', kind: 'file' };
  const document = composerDocumentFromContent({ version: 1, parts: [
    attachment, { type: 'text', text: '/init' }, attachment, { type: 'text', text: ' tail' },
  ] });
  const editor = fixture(document);
  Transforms.select(editor, { path: [0, 2], offset: 5 });
  HistoryEditor.withNewBatch(editor, () => editor.insertText(' '));
  synchronizeComposerLeadingCommand(editor, commands);
  assert.deepEqual(composerContentFromDocument(editor.children).parts, [
    attachment, { type: 'text', text: '/init ' }, attachment, { type: 'text', text: ' tail' },
  ]);
  assert.deepEqual(editor.selection.anchor, { path: [0, 4], offset: 1 });
  HistoryEditor.undo(editor);
  assert.deepEqual(editor.children, document);
  assert.deepEqual(editor.selection.anchor, { path: [0, 2], offset: 5 });
  HistoryEditor.redo(editor);
  assert.deepEqual(editor.selection.anchor, { path: [0, 4], offset: 1 });
});

run('tokenizing with a backward mixed selection preserves its attachment boundary', () => {
  const attachment = { type: 'attachment', key: 'file', name: 'notes.md', kind: 'file' };
  const editor = fixture(composerDocumentFromContent({ version: 1, parts: [
    { type: 'text', text: '/init ' }, attachment, { type: 'text', text: ' tail' },
  ] }));
  Transforms.select(editor, {
    anchor: { path: [0, 2], offset: 3 },
    focus: { path: [0, 0], offset: 0 },
  });
  synchronizeComposerLeadingCommand(editor, commands);
  assert.deepEqual(editor.selection, {
    anchor: { path: [0, 4], offset: 3 },
    focus: { path: [0, 0], offset: 0 },
  });
});

run('removing the command separator and undo restores the same command tag', () => {
  const editor = fixture(composerDocumentFromText('/init ', commands));
  const committed = structuredClone(editor.children);
  Transforms.select(editor, { path: [0, 2], offset: 0 });
  HistoryEditor.withNewBatch(editor, () => Transforms.delete(editor, {
    at: { anchor: { path: [0, 2], offset: 0 }, focus: { path: [0, 2], offset: 1 } },
  }));
  synchronizeComposerLeadingCommand(editor, commands);
  assert.equal(composerTextFromDocument(editor.children), '/init');
  assert.equal(composerLeadingCommandSignature(editor.children), '');
  assert.deepEqual(editor.selection.anchor, { path: [0, 0], offset: 5 });
  HistoryEditor.undo(editor);
  assert.deepEqual(editor.children, committed);
  HistoryEditor.redo(editor);
  assert.equal(composerTextFromDocument(editor.children), '/init');
  assert.equal(composerLeadingCommandSignature(editor.children), '');
});

run('command metadata updates retain history and do not move an attachment-only selection', () => {
  const editor = fixture(composerDocumentFromText('/init ', commands, [{ id: 'file', name: 'notes.md' }]));
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 2], offset: 0 },
  });
  const selection = structuredClone(editor.selection);
  synchronizeComposerLeadingCommand(editor, [{ ...commands[0], description: 'Updated' }]);
  assert.deepEqual(editor.selection, selection);
  assert.equal(editor.history.undos.length, 0);
  assert.equal(editor.children[0].children[3].description, 'Updated');
});

for (const offset of [0, 2, 5]) {
  run(`command tokenization preserves a caret at token offset ${offset}`, () => {
    const editor = fixture(composerDocumentFromContent({ version: 1, parts: [{ type: 'text', text: '/init ' }] }));
    Transforms.select(editor, { path: [0, 0], offset });
    synchronizeComposerLeadingCommand(editor, commands);
    const expected = { path: [0, offset === 0 ? 0 : 2], offset: 0 };
    assert.deepEqual(editor.selection, { anchor: expected, focus: expected });
  });
}

run('de-tokenizing a selected command preserves its full text selection', () => {
  const editor = fixture(composerDocumentFromText('/init ', commands));
  Transforms.select(editor, { path: [0, 1, 0], offset: 0 });
  synchronizeComposerLeadingCommand(editor, []);
  assert.equal(composerTextFromDocument(editor.children), '/init ');
  assert.deepEqual(editor.selection, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 5 },
  });
});

run('editing after a committed command leaves earlier command undo and redo valid', () => {
  const editor = fixture();
  editor.insertText('/init ');
  synchronizeComposerLeadingCommand(editor, commands);
  HistoryEditor.withNewBatch(editor, () => editor.insertText('next'));
  assert.equal(synchronizeComposerLeadingCommand(editor, commands), false);
  HistoryEditor.undo(editor);
  assert.equal(composerTextFromDocument(editor.children), '/init ');
  HistoryEditor.undo(editor);
  assert.equal(composerTextFromDocument(editor.children), '');
  HistoryEditor.redo(editor);
  HistoryEditor.redo(editor);
  assert.equal(composerTextFromDocument(editor.children), '/init next');
  assert.ok(composerLeadingCommandSignature(editor.children));
});
