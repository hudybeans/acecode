import { Editor, Range } from 'slate';
import { isComposerInlineTag } from './richComposerModel.js';

// A caret inside an inline void is Slate's representation of an atomic tag
// selection. It is not an empty text selection for clipboard/edit operations.
export function composerSelectedTag(editor) {
  if (!editor.selection || !Range.isCollapsed(editor.selection)) return null;
  return Editor.above(editor, {
    at: editor.selection.anchor,
    match: isComposerInlineTag,
    voids: true,
  }) || null;
}

export function composerTagSelection(editor, path) {
  const anchor = Editor.before(editor, path);
  const focus = Editor.after(editor, path);
  return anchor && focus ? { anchor, focus } : Editor.range(editor, path);
}
