import { Editor, Path, Point, Range, Transforms } from 'slate';
import { HistoryEditor } from 'slate-history';
import {
  composerDocumentWithSynchronizedLeadingCommand,
  composerLeadingCommandSignature,
  composerTextFromDocument,
  isComposerCommandTag,
} from './richComposerModel.js';

function preserveSelection(editor, range, affinity, change) {
  const reference = range && Editor.rangeRef(editor, range, { affinity });
  try {
    Editor.withoutNormalizing(editor, change);
    const restored = reference?.current;
    if (restored) Transforms.select(editor, restored);
  } finally {
    reference?.unref();
  }
}

// Tokenization changes Slate paths, so its operations must share the edit's
// undo batch. Replacing the root without saving leaves history on stale paths.
export function synchronizeComposerLeadingCommand(editor, commands = []) {
  const currentSignature = composerLeadingCommandSignature(editor.children);
  const synchronized = composerDocumentWithSynchronizedLeadingCommand(
    editor.children, composerTextFromDocument(editor.children), commands,
  );
  const nextSignature = composerLeadingCommandSignature(synchronized);
  if (currentSignature === nextSignature) return false;

  const children = editor.children[0].children;
  const currentIndex = currentSignature ? children.findIndex(isComposerCommandTag) : -1;
  const nextTag = nextSignature ? synchronized[0].children.find(isComposerCommandTag) : null;
  if (currentIndex >= 0 && nextTag) {
    const { children: ignoredChildren, ...metadata } = nextTag;
    HistoryEditor.withoutSaving(editor, () => {
      Transforms.setNodes(editor, metadata, { at: [0, currentIndex] });
    });
    return true;
  }

  HistoryEditor.withMerging(editor, () => {
    if (nextTag) {
      const index = children.findIndex((node) => typeof node.text === 'string' && node.text.startsWith(nextTag.token));
      const start = { path: [0, index], offset: 0 };
      const range = { anchor: start, focus: { path: start.path, offset: nextTag.token.length } };
      const selection = editor.selection;
      const affinity = selection && Range.isCollapsed(selection)
        ? (Point.equals(selection.anchor, start) ? 'backward' : 'forward')
        : 'outward';
      preserveSelection(editor, selection, affinity, () => {
        Transforms.delete(editor, { at: range });
        Transforms.insertNodes(editor, nextTag, { at: start, select: false });
      });
      // Inserting an inline at offset zero inserts before the old text node.
      // Point refs follow that text, so explicitly retain the token's left
      // boundary instead of silently excluding it from a backward selection.
      if (selection && editor.selection) {
        const [, tagPath] = [...Editor.nodes(editor, { at: [0], match: isComposerCommandTag })][0];
        const before = Editor.before(editor, tagPath);
        const after = Editor.after(editor, tagPath);
        const restoreEndpoint = (point, edge) => {
          if (!Path.equals(point.path, start.path) || point.offset > nextTag.token.length) {
            return editor.selection[edge];
          }
          if (point.offset === 0) return before;
          if (point.offset === nextTag.token.length || Range.isCollapsed(selection)) return after;
          return Point.equals(point, Range.start(selection)) ? before : after;
        };
        Transforms.select(editor, {
          anchor: restoreEndpoint(selection.anchor, 'anchor'),
          focus: restoreEndpoint(selection.focus, 'focus'),
        });
      }
      return;
    }

    const path = [0, currentIndex];
    const before = Editor.before(editor, path);
    const token = children[currentIndex].token || '';
    const selection = editor.selection;
    const touchesTag = (point) => point && Path.isAncestor(path, point.path);
    const trackingRange = selection && {
      anchor: touchesTag(selection.anchor) ? before : selection.anchor,
      focus: touchesTag(selection.focus) ? before : selection.focus,
    };
    const affinity = selection && Range.isCollapsed(selection) && !touchesTag(selection.anchor)
      ? (Point.equals(selection.anchor, before) ? 'backward' : 'forward')
      : 'outward';
    preserveSelection(editor, trackingRange, affinity, () => {
      Transforms.insertText(editor, token, { at: before });
      Transforms.removeNodes(editor, { at: path });
    });
  });
  return true;
}
