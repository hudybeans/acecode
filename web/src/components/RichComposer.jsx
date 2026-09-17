import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createEditor,
  Editor,
  Range,
  Transforms,
} from 'slate';
import {
  Editable,
  ReactEditor,
  Slate,
  useFocused,
  useSelected,
  withReact,
} from 'slate-react';
import {
  HistoryEditor,
  withHistory,
} from 'slate-history';
import { clsx } from '../lib/format.js';
import { isDesktopShell } from '../lib/desktopShellMode.js';
import {
  clipboardHasTextFormat,
  COMPOSER_EXTERNAL_SYNC_ACTIONS,
  appendComposerLocalEcho,
  classifyComposerExternalSync,
  composerAdjacentAttachmentPath,
  composerAdjacentTagDeletionRange,
  composerAttachmentItemsSignature,
  composerAttachmentTag,
  composerContentFromDocument,
  composerDocumentFromContent,
  composerSkillTag,
  composerDocumentFromText,
  composerDocumentWithSynchronizedLeadingCommand,
  composerLeadingCommandSignature,
  composerInlineTagRanges,
  composerPlainTextRangeFromSelection,
  composerSelectionFromPlainTextRange,
  composerSelectionForTextReplacement,
  composerTextFromDocument,
  isComposerAttachmentTag,
  isComposerCommandTag,
  isComposerSkillTag,
  isComposerInlineTag,
  isComposerPathTag,
  isComposerSessionTag,
  normalizeComposerPlainText,
  plainTextFromClipboardData,
} from '../lib/richComposerModel.js';
import {
  normalizeComposerContent,
  composerContentSignature,
  composerContentText,
  composerContentClipboardText,
} from '../lib/composerContent.js';
import { filesFromTransfer } from '../lib/composerFileTransfer.js';
import {
  RICH_COMPOSER_CONTEXT_PASTE_ACTIONS,
  RICH_COMPOSER_CONTEXT_PASTE_EVENT,
} from '../lib/richComposerContextPaste.js';
import { slashCommandKindPresentation } from '../lib/slashCommands.js';
import { CommandGlyph, FileTypeIcon, VsIcon } from './Icon.jsx';

function withComposerInlineTags(editor) {
  const { isInline, isVoid, markableVoid } = editor;
  editor.isInline = (element) => (
    isComposerInlineTag(element) ? true : isInline(element)
  );
  editor.isVoid = (element) => (
    isComposerInlineTag(element) ? true : isVoid(element)
  );
  editor.markableVoid = (element) => (
    isComposerInlineTag(element) ? false : markableVoid?.(element) || false
  );
  return editor;
}

function commandTagTitle(command) {
  const presentation = slashCommandKindPresentation(command);
  return command?.description || presentation.label || command?.name || command?.token || '';
}

function CommandTagElement({ attributes, children, element, selected }) {
  const displayName = String(element?.name || element?.token || '').replace(/^\/+/, '');
  return (
    <span
      {...attributes}
      contentEditable={false}
      draggable={false}
      data-composer-inline-tag={isComposerSkillTag(element) ? 'skill' : 'command'}
      data-composer-selected={selected || undefined}
      data-slash-chip-kind={element?.kind || 'skill'}
      className="ace-cmd-token ace-slate-inline-tag"
      title={commandTagTitle(element)}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      <CommandGlyph kind={element?.kind || 'skill'} size={12} className="ace-cmd-token-glyph" />
      <span className="ace-cmd-token-name">{displayName}</span>
    </span>
  );
}

function PathTagElement({ attributes, children, element, selected }) {
  const path = String(element?.path || element?.token || '').replace(/^@(?:"(.*)"|(.*))$/, '$1$2');
  return (
    <span
      {...attributes}
      contentEditable={false}
      draggable={false}
      data-composer-inline-tag="path"
      data-composer-selected={selected || undefined}
      className="ace-cmd-token ace-slate-inline-tag ace-slate-path-tag"
      title={element?.token || path}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      {element?.directory
        ? <VsIcon name="folder" size={12} className="ace-cmd-token-glyph" />
        : <FileTypeIcon path={path} size={12} className="ace-cmd-token-glyph" />}
      <span className="ace-cmd-token-name">{path}</span>
    </span>
  );
}

function SessionTagElement({ attributes, children, element, selected }) {
  const title = String(element?.title || element?.sessionId || '');
  const workspaceName = String(element?.workspaceName || '');
  return (
    <span
      {...attributes}
      contentEditable={false}
      draggable={false}
      data-composer-inline-tag="session"
      data-composer-selected={selected || undefined}
      className="ace-cmd-token ace-slate-inline-tag ace-slate-session-tag"
      title={workspaceName ? `${title} · ${workspaceName}` : title}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      <VsIcon name="newSession" size={12} className="ace-cmd-token-glyph" />
      <span className="ace-cmd-token-name">{title}</span>
    </span>
  );
}

function AttachmentTagElement({
  attributes,
  children,
  element,
  selected,
  onPreviewAttachment,
  onRemoveAttachment,
}) {
  const name = String(element?.name || 'attachment');
  const label = element?.uploading ? `${name} 上传中` : name;
  const previewable = element?.kind === 'image' && !!element?.url;
  const attachmentKey = String(element?.attachmentKey || '');
  return (
    <span
      {...attributes}
      contentEditable={false}
      draggable={false}
      data-composer-inline-tag="attachment"
      data-composer-selected={selected || undefined}
      data-desktop-attachment-id={`composer:${attachmentKey}`}
      data-desktop-attachment-name={name}
      data-desktop-attachment-url={element?.url || undefined}
      data-desktop-attachment-path={element?.path || undefined}
      data-desktop-attachment-preview-url={element?.url || undefined}
      data-desktop-attachment-mutable="true"
      className={clsx(
        'group ace-cmd-token ace-slate-inline-tag ace-slate-attachment-tag',
        element?.uploading && 'is-uploading',
        previewable && 'is-previewable',
      )}
      title={element?.sourcePath || name}
      onMouseDown={(event) => {
        if (event.button === 0) event.preventDefault();
      }}
      onClick={previewable ? () => onPreviewAttachment?.(element) : undefined}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      <FileTypeIcon path={name} size={12} className="ace-cmd-token-glyph" />
      <span className="ace-cmd-token-name ace-slate-attachment-name">{label}</span>
      <button
        type="button"
        contentEditable={false}
        className="ace-slate-attachment-remove"
        aria-label="移除附件"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemoveAttachment?.(attachmentKey, element);
        }}
      >
        <VsIcon name="close" size={9} />
      </button>
    </span>
  );
}

function ComposerElement({ onPreviewAttachment, onRemoveAttachment, ...props }) {
  const selected = useSelected();
  const focused = useFocused();
  const tagProps = { ...props, selected: selected && focused };
  if (isComposerAttachmentTag(props.element)) {
    return (
      <AttachmentTagElement
        {...tagProps}
        onPreviewAttachment={onPreviewAttachment}
        onRemoveAttachment={onRemoveAttachment}
      />
    );
  }
  if (isComposerCommandTag(props.element) || isComposerSkillTag(props.element)) return <CommandTagElement {...tagProps} />;
  if (isComposerPathTag(props.element)) return <PathTagElement {...tagProps} />;
  if (isComposerSessionTag(props.element)) return <SessionTagElement {...tagProps} />;
  return (
    <div {...props.attributes} className="ace-slate-composer-paragraph">
      {props.children}
    </div>
  );
}

function currentPlainSelection(document, selection) {
  if (!selection) {
    const end = composerTextFromDocument(document).length;
    return { start: end, end, direction: 'none' };
  }
  return composerPlainTextRangeFromSelection(document, selection);
}

function legalComposerDocument(document) {
  return Array.isArray(document) && document.length > 0
    ? document
    : composerDocumentFromText('');
}

function safeDeselectEditor(editor) {
  if (!editor.selection) return;
  try {
    Transforms.deselect(editor);
  } catch {
    // A broken root can leave a stale [0, 0] selection. Clear it before
    // applying recovery operations so the invalid point cannot escape.
    editor.selection = null;
  }
}

function ensureLegalEditorDocument(editor, { selectEnd = true } = {}) {
  const fallbackDocument = composerDocumentFromText('');
  try {
    HistoryEditor.withoutSaving(editor, () => {
      Editor.withoutNormalizing(editor, () => {
        safeDeselectEditor(editor);
        if (!Array.isArray(editor.children) || editor.children.length === 0) {
          Transforms.insertNodes(editor, fallbackDocument, { at: [0] });
        }
        const recoveryDocument = legalComposerDocument(editor.children);
        const recoveryText = composerTextFromDocument(recoveryDocument);
        const offset = selectEnd ? recoveryText.length : 0;
        Transforms.select(editor, composerSelectionFromPlainTextRange(
          recoveryDocument,
          offset,
          offset,
        ));
      });
    });
  } catch {
    // Last-resort state repair. This branch is only reachable after Slate
    // transforms themselves failed; keeping a legal root prevents a React
    // white screen and lets the next semantic sync rebuild the real draft.
    editor.children = fallbackDocument;
    editor.selection = composerSelectionFromPlainTextRange(fallbackDocument, 0, 0);
    try { editor.onChange(); } catch {}
  }
}

function replaceEditorDocument(editor, nextDocument, {
  selection = null,
  selectEnd = true,
  clearHistory = false,
} = {}) {
  const replacementDocument = legalComposerDocument(nextDocument);
  const nextText = composerTextFromDocument(replacementDocument);
  const plainSelection = selection || {
    start: selectEnd ? nextText.length : 0,
    end: selectEnd ? nextText.length : 0,
    direction: 'none',
  };
  const slateSelection = composerSelectionFromPlainTextRange(
    replacementDocument,
    plainSelection.start,
    plainSelection.end,
    plainSelection.direction,
  );

  let replaced = false;
  try {
    HistoryEditor.withoutSaving(editor, () => {
      Editor.withoutNormalizing(editor, () => {
        safeDeselectEditor(editor);
        const previousRootCount = Array.isArray(editor.children) ? editor.children.length : 0;
        // Insert first so the Slate root is never empty, even while switching
        // from a corrupted or empty draft.
        Transforms.insertNodes(editor, replacementDocument, { at: [previousRootCount] });
        for (let index = previousRootCount - 1; index >= 0; index -= 1) {
          Transforms.removeNodes(editor, { at: [index] });
        }
        Transforms.select(editor, slateSelection);
      });
    });
    replaced = true;
  } catch {
    ensureLegalEditorDocument(editor, { selectEnd });
  }

  if (clearHistory && HistoryEditor.isHistoryEditor(editor)) {
    editor.history.undos.splice(0);
    editor.history.redos.splice(0);
  }
  return replaced;
}

function deleteAdjacentTag(editor, direction) {
  const range = composerAdjacentTagDeletionRange(editor.children, editor.selection, direction);
  if (!range) return false;
  const tag = composerInlineTagRanges(editor.children).find((item) => item.start === range.start);
  if (!tag) return false;
  // Plain offsets collapse every attachment to zero characters. Delete the
  // actual tag path so an adjacent file cannot be swept into the same range.
  HistoryEditor.withNewBatch(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      const [blockIndex, childIndex] = tag.path;
      const following = editor.children[blockIndex]?.children[childIndex + 1];
      if (typeof following?.text === 'string' && /^[ \t]/.test(following.text)) {
        const path = [blockIndex, childIndex + 1];
        Transforms.delete(editor, { at: {
          anchor: { path, offset: 0 }, focus: { path, offset: 1 },
        } });
      }
      Transforms.removeNodes(editor, { at: tag.path });
    });
  });
  return true;
}

function insertPlainText(editor, text) {
  const parts = normalizeComposerPlainText(text).split('\n');
  HistoryEditor.withNewBatch(editor, () => {
    parts.forEach((part, index) => {
      if (index > 0) editor.insertBreak();
      if (part) Transforms.insertText(editor, part);
    });
  });
}

function deleteSelectedPlainText(editor) {
  if (!editor.selection || Range.isCollapsed(editor.selection)) return false;
  // Slate ranges distinguish both sides of zero-text attachments. Converting
  // through character offsets here would omit files from mixed selections.
  Transforms.delete(editor);
  return true;
}

const COMPOSER_CLIPBOARD_TYPE = 'application/x-acecode-composer-content';

function writeSelectedPlainText(event, editor) {
  if (!editor.selection || Range.isCollapsed(editor.selection)) return false;
  const content = composerContentFromDocument(Editor.fragment(editor, editor.selection));
  try {
    event.clipboardData?.setData('text/plain', composerContentClipboardText(content));
    event.clipboardData?.setData(COMPOSER_CLIPBOARD_TYPE, JSON.stringify(content));
  } catch {
    return false;
  }
  event.preventDefault();
  return true;
}

function removeAttachmentReference(editor, attachmentKey, occurrencePath = null) {
  HistoryEditor.withNewBatch(editor, () => {
    Transforms.removeNodes(editor, {
      at: occurrencePath || [],
      match: (node) => isComposerAttachmentTag(node) && (!attachmentKey || node.attachmentKey === attachmentKey),
    });
  });
}

function insertComposerContent(editor, content, commands, attachments) {
  const normalized = normalizeComposerContent(content);
  if (!normalized) return false;
  // Clipboard references must resolve in this composer's resource registry.
  // A different session can still paste the readable text fallback.
  if (normalized.parts.some((part) => part.type === 'attachment' && !attachments.some((record, index) => (
    composerAttachmentTag(record, index).attachmentKey === part.key
    || (part.id && record.id === part.id)
  )))) return false;
  HistoryEditor.withNewBatch(editor, () => {
    Transforms.insertFragment(editor, composerDocumentFromContent(normalized, commands, attachments));
  });
  return true;
}

function replaceComposerTextPreservingReferences(editor, nextText, commands, replacementRange) {
  const previous = composerTextFromDocument(editor.children);
  if (previous === nextText) return composerContentFromDocument(editor.children);
  let start = 0;
  while (start < previous.length && start < nextText.length && previous[start] === nextText[start]) start += 1;
  let end = previous.length;
  let nextEnd = nextText.length;
  while (end > start && nextEnd > start && previous[end - 1] === nextText[nextEnd - 1]) {
    end -= 1;
    nextEnd -= 1;
  }
  // A completed @ query must be parsed with its prefix intact. A minimal text
  // diff would keep the old @ and parse only "session:..." or a path suffix.
  const rangeBegin = replacementRange?.begin;
  const rangeEnd = replacementRange?.end;
  const replacementEnd = rangeEnd + nextText.length - previous.length;
  if (Number.isInteger(rangeBegin) && Number.isInteger(rangeEnd)
    && rangeBegin >= 0 && rangeEnd >= rangeBegin && rangeEnd <= previous.length
    && replacementEnd >= rangeBegin && replacementEnd <= nextText.length
    && previous.slice(0, rangeBegin) === nextText.slice(0, rangeBegin)
    && previous.slice(rangeEnd) === nextText.slice(replacementEnd)) {
    start = rangeBegin;
    end = rangeEnd;
    nextEnd = replacementEnd;
  }
  const current = currentPlainSelection(editor.children, editor.selection);
  const preserveActualCaret = editor.selection && Range.isCollapsed(editor.selection)
    && start === end && current.start === start;
  HistoryEditor.withNewBatch(editor, () => {
    if (!preserveActualCaret) Transforms.select(editor, composerSelectionForTextReplacement(editor.children, start, end));
    const inserted = nextText.slice(start, nextEnd);
    if (inserted) Transforms.insertFragment(editor, replacementRange?.plainText
      ? composerDocumentFromContent({ version: 1, parts: [{ type: 'text', text: inserted }] }, commands)
      : composerDocumentFromText(inserted, commands));
    else Transforms.delete(editor);
  });
  return composerContentFromDocument(editor.children);
}

function RichComposerShell({
  value,
  composerContent = null,
  onComposerContentChange,
  syncKey = '',
  commands,
  attachments = [],
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  className,
  placeholderClassName,
  style,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onSubmit,
  submitOnEnter = true,
  onPasteFiles,
  onPasteFilesystemItems,
  onPreviewAttachment,
  onRemoveAttachment,
  allowNativeFilesystemDrop = false,
  isComposingKeyEvent,
  onSelectionChange,
}, ref) {
  const normalizedValue = normalizeComposerPlainText(value);
  const externalContent = normalizeComposerContent(composerContent);
  const hasExternalContent = !!externalContent && composerContentText(externalContent) === normalizedValue;
  const externalSignature = hasExternalContent ? composerContentSignature(externalContent) : normalizedValue;
  const contentPropRef = useRef(null);
  contentPropRef.current = hasExternalContent ? externalContent : null;
  const normalizedSyncKey = String(syncKey ?? '');
  const syncIdentityRef = useRef({ key: normalizedSyncKey, generation: 0 });
  if (syncIdentityRef.current.key !== normalizedSyncKey) {
    syncIdentityRef.current = {
      key: normalizedSyncKey,
      generation: syncIdentityRef.current.generation + 1,
    };
  }
  const activeSyncGeneration = syncIdentityRef.current.generation;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const initialValueRef = useRef(null);
  if (!initialValueRef.current) {
    initialValueRef.current = hasExternalContent
      ? composerDocumentFromContent(externalContent, commands, attachments)
      : composerDocumentFromText(normalizedValue, commands, attachments);
  }
  const editor = useMemo(
    () => withComposerInlineTags(withHistory(withReact(createEditor()))),
    [],
  );
  const editableRef = useRef(null);
  const seenAttachmentKeysRef = useRef(new Set(attachments.map((item, index) => composerAttachmentTag(item, index).attachmentKey)));
  const pendingAttachmentSelectionRef = useRef(null);
  const latestTextRef = useRef(composerTextFromDocument(initialValueRef.current));
  const documentSyncGenerationRef = useRef(activeSyncGeneration);
  const lastExternalStateRef = useRef({
    generation: activeSyncGeneration,
    text: externalSignature,
  });
  const localEchoStateRef = useRef({
    generation: activeSyncGeneration,
    values: [],
  });
  const compositionStateRef = useRef({ active: false, settling: false });
  const compositionSettleTimerRef = useRef(0);
  const handledPasteEventsRef = useRef(new WeakSet());
  const pasteBeforeInputGuardRef = useRef(0);
  const [syncRevision, setSyncRevision] = useState(0);
  const selectionRef = useRef({
    start: latestTextRef.current.length,
    end: latestTextRef.current.length,
    direction: 'none',
  });

  const commandSignature = useMemo(
    () => (Array.isArray(commands) ? commands : [])
      .map((command) => [
        command?.token || '',
        command?.name || '',
        command?.kind || '',
        command?.description || '',
      ].join(':'))
      .join('\n'),
    [commands],
  );
  const attachmentSignature = useMemo(
    () => composerAttachmentItemsSignature(attachments),
    [attachments],
  );

  const clearCompositionSettleTimer = useCallback(() => {
    if (!compositionSettleTimerRef.current) return;
    window.clearTimeout(compositionSettleTimerRef.current);
    compositionSettleTimerRef.current = 0;
  }, []);

  useEffect(() => () => {
    clearCompositionSettleTimer();
  }, [clearCompositionSettleTimer]);

  const handleCompositionStart = useCallback((event) => {
    clearCompositionSettleTimer();
    compositionStateRef.current.active = true;
    compositionStateRef.current.settling = false;
    return onCompositionStart?.(event);
  }, [clearCompositionSettleTimer, onCompositionStart]);

  const handleCompositionEnd = useCallback((event) => {
    compositionStateRef.current.active = false;
    compositionStateRef.current.settling = true;
    const handled = onCompositionEnd?.(event);
    clearCompositionSettleTimer();
    // Slate's Chrome composition handler inserts event.data after invoking
    // this callback and publishes onValueChange in a microtask. A zero-delay
    // task runs after both steps and re-evaluates only the latest props.
    compositionSettleTimerRef.current = window.setTimeout(() => {
      compositionStateRef.current.settling = false;
      compositionSettleTimerRef.current = 0;
      setSyncRevision((revision) => revision + 1);
    }, 0);
    return handled;
  }, [clearCompositionSettleTimer, onCompositionEnd]);

  const publishSelection = useCallback((selection = editor.selection) => {
    const next = currentPlainSelection(editor.children, selection);
    selectionRef.current = next;
    onSelectionChange?.(next);
  }, [editor, onSelectionChange]);

  const capturePasteSelection = useCallback(() => {
    const editable = editableRef.current;
    const domSelection = window.getSelection?.();
    const anchorNode = domSelection?.anchorNode;
    const focusNode = domSelection?.focusNode;
    const ownsSelection = editable
      && domSelection?.rangeCount > 0
      && anchorNode
      && focusNode
      && (anchorNode === editable || editable.contains(anchorNode))
      && (focusNode === editable || editable.contains(focusNode));
    if (ownsSelection) {
      try {
        const slateSelection = ReactEditor.toSlateRange(editor, domSelection, {
          exactMatch: false,
          suppressThrow: true,
        });
        if (slateSelection) return { ...currentPlainSelection(editor.children, slateSelection), slateRange: slateSelection };
      } catch {
        // Fall through to Slate's last synchronized selection. Browser engines
        // can briefly expose a DOM selection while Slate is reconciling it.
      }
    }
    try {
      return { ...currentPlainSelection(editor.children, editor.selection), slateRange: editor.selection };
    } catch {
      const fallback = selectionRef.current;
      const end = composerTextFromDocument(editor.children).length;
      return {
        start: Number.isFinite(fallback?.start) ? fallback.start : end,
        end: Number.isFinite(fallback?.end) ? fallback.end : end,
        direction: fallback?.direction || 'none',
      };
    }
  }, [editor]);

  const applyPlainTextPaste = useCallback((text, capturedSelection = null) => {
    const normalizedText = normalizeComposerPlainText(text);
    if (!normalizedText) return false;

    ensureLegalEditorDocument(editor);
    const currentText = composerTextFromDocument(editor.children);
    const fallbackEnd = currentText.length;
    const requestedSelection = capturedSelection || capturePasteSelection();
    const start = Number.isFinite(Number(requestedSelection?.start))
      ? Number(requestedSelection.start)
      : fallbackEnd;
    const end = Number.isFinite(Number(requestedSelection?.end))
      ? Number(requestedSelection.end)
      : start;
    const direction = requestedSelection?.direction || 'none';

    try {
      const exactRange = requestedSelection?.slateRange;
      const validRange = exactRange && Editor.hasPath(editor, exactRange.anchor.path) && Editor.hasPath(editor, exactRange.focus.path);
      Transforms.select(editor, validRange ? exactRange : composerSelectionFromPlainTextRange(
        editor.children, start, end, direction,
      ));
      insertPlainText(editor, normalizedText);
      publishSelection(editor.selection);
      return true;
    } catch {
      // Never let an obsolete browser selection leave the editor without a
      // legal root/selection. The paste safely fails instead of touching DOM.
      ensureLegalEditorDocument(editor);
      const safeEnd = composerTextFromDocument(editor.children).length;
      try {
        const safeSelection = composerSelectionFromPlainTextRange(
          editor.children,
          safeEnd,
          safeEnd,
        );
        Transforms.select(editor, safeSelection);
        publishSelection(safeSelection);
      } catch {}
      return false;
    }
  }, [capturePasteSelection, editor, publishSelection]);

  const handleContextPasteAction = useCallback((event) => {
    const detail = event?.detail;
    if (detail?.action === RICH_COMPOSER_CONTEXT_PASTE_ACTIONS.CAPTURE_SELECTION) {
      detail.selection = capturePasteSelection();
      detail.handled = true;
      return;
    }
    if (detail?.action !== RICH_COMPOSER_CONTEXT_PASTE_ACTIONS.INSERT_TEXT) return;

    // RichComposer owns this contenteditable. Consume the action even while
    // disabled so the generic context-menu fallback never mutates Slate's DOM.
    detail.handled = true;
    if (disabled) return;

    let focused = false;
    try {
      ReactEditor.focus(editor);
      focused = true;
    } catch {
      // The menu can close in the same frame as a Slate render. Retry after
      // React has reconciled the editable DOM rather than writing into it.
    }
    if (detail.text) applyPlainTextPaste(detail.text, detail.selection);
    if (!focused) {
      window.requestAnimationFrame(() => {
        try { ReactEditor.focus(editor); } catch {}
      });
    }
  }, [applyPlainTextPaste, capturePasteSelection, disabled, editor]);

  useEffect(() => {
    const editable = editableRef.current;
    if (!editable) return undefined;
    editable.addEventListener(RICH_COMPOSER_CONTEXT_PASTE_EVENT, handleContextPasteAction);
    return () => {
      editable.removeEventListener(RICH_COMPOSER_CONTEXT_PASTE_EVENT, handleContextPasteAction);
    };
  }, [handleContextPasteAction]);

  const publishDocument = useCallback(() => {
    const content = composerContentFromDocument(editor.children);
    const text = composerTextFromDocument(editor.children);
    latestTextRef.current = text;
    const activeGeneration = syncIdentityRef.current.generation;
    if (documentSyncGenerationRef.current !== activeGeneration) return;
    const localEchoState = localEchoStateRef.current;
    const localEchoes = localEchoState.generation === activeGeneration ? localEchoState.values : [];
    // Store both representations while a legacy parent adopts structured state.
    localEchoStateRef.current = {
      generation: activeGeneration,
      values: appendComposerLocalEcho(appendComposerLocalEcho(localEchoes, text), composerContentSignature(content)),
    };
    onChange?.(text, content);
    onComposerContentChange?.(content);
  }, [editor, onChange, onComposerContentChange]);

  useEffect(() => {
    const currentDocument = editor.children;
    const currentText = composerTextFromDocument(currentDocument);
    const currentSignature = hasExternalContent
      ? composerContentSignature(composerContentFromDocument(currentDocument)) : currentText;
    const generationChanged = documentSyncGenerationRef.current !== activeSyncGeneration;
    const localEchoState = localEchoStateRef.current;
    const localEchoes = localEchoState.generation === activeSyncGeneration ? localEchoState.values : [];
    const lastExternalState = lastExternalStateRef.current;
    let reactEditorComposing = false;
    try { reactEditorComposing = ReactEditor.isComposing(editor); } catch {}
    const decision = classifyComposerExternalSync({
      compositionProtected: compositionStateRef.current.active || compositionStateRef.current.settling || reactEditorComposing,
      generationChanged,
      currentText: currentSignature,
      nextText: externalSignature,
      lastExternalText: lastExternalState.generation === activeSyncGeneration ? lastExternalState.text : '',
      localEchoes,
    });
    if (decision.action === COMPOSER_EXTERNAL_SYNC_ACTIONS.DEFER) return;
    const replacesText = decision.action === COMPOSER_EXTERNAL_SYNC_ACTIONS.REPLACE;
    if (replacesText) {
      localEchoStateRef.current = { generation: activeSyncGeneration, values: [] };
      lastExternalStateRef.current = { generation: activeSyncGeneration, text: externalSignature };
      const document = contentPropRef.current
        ? composerDocumentFromContent(contentPropRef.current, commandsRef.current, attachmentsRef.current)
        : composerDocumentFromText(normalizedValue, commandsRef.current);
      replaceEditorDocument(editor, document, { selectEnd: true, clearHistory: true });
      documentSyncGenerationRef.current = activeSyncGeneration;
      if (generationChanged) {
        seenAttachmentKeysRef.current = new Set(attachmentsRef.current.map((item, index) => composerAttachmentTag(item, index).attachmentKey));
        pendingAttachmentSelectionRef.current?.unref();
        pendingAttachmentSelectionRef.current = null;
      }
    } else if (decision.acknowledgedEchoCount > 0) {
      localEchoStateRef.current = { generation: activeSyncGeneration, values: localEchoes.slice(decision.acknowledgedEchoCount) };
      lastExternalStateRef.current = { generation: activeSyncGeneration, text: externalSignature };
    } else if (decision.action === COMPOSER_EXTERNAL_SYNC_ACTIONS.ACCEPT) {
      lastExternalStateRef.current = { generation: activeSyncGeneration, text: externalSignature };
    }

    // Metadata changes never replace the document or its selection/history.
    const records = new Map(attachmentsRef.current.map((item, index) => {
      const tag = composerAttachmentTag(item, index);
      return [tag.attachmentKey, tag];
    }));
    const existing = [...Editor.nodes(editor, { at: [], match: isComposerAttachmentTag })];
    HistoryEditor.withoutSaving(editor, () => {
      for (const [node, path] of existing) {
        const tag = records.get(node.attachmentKey);
        if (tag && JSON.stringify(node) !== JSON.stringify(tag)) {
          const { children, ...metadata } = tag;
          Transforms.setNodes(editor, metadata, { at: path });
        }
      }
    });
    const present = new Set(existing.map(([node]) => node.attachmentKey));
    const unseen = [...records].filter(([key]) => !seenAttachmentKeysRef.current.has(key) && !present.has(key));
    for (const key of records.keys()) seenAttachmentKeysRef.current.add(key);
    if (unseen.length) {
      const saved = pendingAttachmentSelectionRef.current?.unref();
      pendingAttachmentSelectionRef.current = null;
      HistoryEditor.withNewBatch(editor, () => {
        if (saved) Transforms.select(editor, saved);
        if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
        for (const [, tag] of unseen) {
          Transforms.insertNodes(editor, tag);
          Transforms.move(editor);
        }
      });
    }
    const synchronized = composerDocumentWithSynchronizedLeadingCommand(
      editor.children, composerTextFromDocument(editor.children), commandsRef.current,
    );
    if (composerLeadingCommandSignature(synchronized) !== composerLeadingCommandSignature(editor.children)) {
      replaceEditorDocument(editor, synchronized, {
        selection: currentPlainSelection(editor.children, editor.selection), clearHistory: false,
      });
    }
    latestTextRef.current = composerTextFromDocument(editor.children);
    publishSelection(editor.selection);
  }, [
    activeSyncGeneration, attachmentSignature, commandSignature, editor,
    externalSignature, hasExternalContent, normalizedValue, publishSelection, syncRevision,
  ]);

  const handleValueChange = useCallback(() => {
    setSyncRevision((revision) => revision + 1);
    publishSelection(editor.selection);
    publishDocument();
  }, [editor, publishDocument, publishSelection]);

  const handleSlateSelectionChange = useCallback((selection) => {
    publishSelection(selection);
  }, [publishSelection]);

  useImperativeHandle(ref, () => ({
    focus() {
      const focusEditor = () => {
        if (!editor.selection) {
          const end = latestTextRef.current.length;
          Transforms.select(editor, composerSelectionFromPlainTextRange(editor.children, end, end));
        }
        ReactEditor.focus(editor);
      };
      try {
        focusEditor();
      } catch {
        // 外部草稿刚替换 Slate 文档时，React 树和 Slate DOM 映射可能相差一帧。
        // 延迟重试避免开场白回填成功却留下 Cannot resolve a DOM node 错误。
        ensureLegalEditorDocument(editor);
        window.requestAnimationFrame(() => {
          try { focusEditor(); } catch {}
        });
      }
    },
    setSelectionRange(start, end, direction) {
      const selection = composerSelectionFromPlainTextRange(
        editor.children,
        start,
        Number.isFinite(end) ? end : start,
        direction,
      );
      Transforms.select(editor, selection);
      publishSelection(selection);
    },
    get value() {
      return latestTextRef.current;
    },
    get selectionStart() {
      return selectionRef.current.start;
    },
    get selectionEnd() {
      return selectionRef.current.end;
    },
    get selectionDirection() {
      return selectionRef.current.direction || 'none';
    },
    getEditorStateText() {
      return latestTextRef.current;
    },
    getComposerContent() {
      return composerContentFromDocument(editor.children);
    },
    setComposerContent(content, { selectEnd = true } = {}) {
      const document = composerDocumentFromContent(content, commandsRef.current, attachmentsRef.current);
      replaceEditorDocument(editor, document, { selectEnd, clearHistory: true });
      publishDocument();
      publishSelection(editor.selection);
      return composerContentFromDocument(editor.children);
    },
    replaceTextPreservingReferences(next, replacementRange) {
      const content = replaceComposerTextPreservingReferences(editor, normalizeComposerPlainText(next), commandsRef.current, replacementRange);
      publishDocument();
      publishSelection(editor.selection);
      return content;
    },
    insertSkill(skill, start, end) {
      HistoryEditor.withNewBatch(editor, () => {
        Transforms.select(editor, composerSelectionForTextReplacement(editor.children, start, end));
        Transforms.insertFragment(editor, [{ type: 'paragraph', children: [
          { text: '' }, composerSkillTag(skill), { text: ' ' },
        ] }]);
      });
      publishDocument();
      publishSelection(editor.selection);
      return composerContentFromDocument(editor.children);
    },
    reserveAttachmentSelection() {
      pendingAttachmentSelectionRef.current?.unref();
      if (editor.selection) pendingAttachmentSelectionRef.current = Editor.rangeRef(editor, editor.selection, { affinity: 'forward' });
    },
    removeAttachment(key) {
      removeAttachmentReference(editor, key);
      publishDocument();
    },
    replaceText(next, { selectEnd = true } = {}) {
      const nextDocument = composerDocumentFromText(
        next,
        commandsRef.current,
        attachmentsRef.current,
      );
      replaceEditorDocument(editor, nextDocument, {
        selectEnd,
        clearHistory: true,
      });
      const activeGeneration = syncIdentityRef.current.generation;
      const actualText = composerTextFromDocument(editor.children);
      documentSyncGenerationRef.current = activeGeneration;
      localEchoStateRef.current = { generation: activeGeneration, values: [] };
      lastExternalStateRef.current = { generation: activeGeneration, text: actualText };
      latestTextRef.current = actualText;
      publishSelection(editor.selection);
    },
  }), [editor, publishDocument, publishSelection]);

  const removeAttachment = useCallback((key, element) => {
    let occurrencePath = null;
    if (element) {
      try { occurrencePath = ReactEditor.findPath(editor, element); } catch { return; }
    }
    removeAttachmentReference(editor, key, occurrencePath);
    publishDocument();
  }, [editor, publishDocument]);

  const renderElement = useCallback((props) => (
    <ComposerElement
      {...props}
      onPreviewAttachment={onPreviewAttachment}
      onRemoveAttachment={removeAttachment}
    />
  ), [onPreviewAttachment, removeAttachment]);
  const renderPlaceholder = useCallback(({ attributes, children }) => (
    <span
      {...attributes}
      className={clsx(
        'ace-rich-composer-placeholder pointer-events-none font-sans text-fg-mute',
        placeholderClassName,
      )}
    >
      {children}
    </span>
  ), [placeholderClassName]);

  const handleKeyDown = useCallback((event) => {
    if (
      compositionStateRef.current.active
      || compositionStateRef.current.settling
      || isComposingKeyEvent?.(event)
      || event.isComposing
      || event.nativeEvent?.isComposing
      || event.keyCode === 229
      || event.which === 229
      || event.nativeEvent?.keyCode === 229
      || event.nativeEvent?.which === 229
      || ReactEditor.isComposing(editor)
    ) {
      // Uncommitted IME text is not reflected in Slate's selection yet.
      // Skip parent/Slate shortcuts without preventing native IME editing.
      return true;
    }

    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (disabled) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && submitOnEnter) {
      if (event.ctrlKey && isDesktopShell()) {
        event.preventDefault();
        editor.insertBreak();
        return;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        onSubmit?.();
        return;
      }
    }

    if (
      (event.key === 'Backspace' || event.key === 'Delete')
      && editor.selection
      && !Range.isCollapsed(editor.selection)
      && deleteSelectedPlainText(editor)
    ) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Backspace') {
      const attachmentPath = composerAdjacentAttachmentPath(
        editor.children,
        editor.selection,
        'backward',
      );
      if (attachmentPath) {
        event.preventDefault();
        removeAttachmentReference(editor, null, attachmentPath);
        return;
      }
    }
    if (event.key === 'Delete') {
      const attachmentPath = composerAdjacentAttachmentPath(
        editor.children,
        editor.selection,
        'forward',
      );
      if (attachmentPath) {
        event.preventDefault();
        removeAttachmentReference(editor, null, attachmentPath);
        return;
      }
    }

    if (event.key === 'Backspace' && deleteAdjacentTag(editor, 'backward')) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' && deleteAdjacentTag(editor, 'forward')) {
      event.preventDefault();
    }
  }, [disabled, editor, isComposingKeyEvent, onKeyDown, onSubmit, submitOnEnter]);

  const requestClipboardTextFallback = useCallback((capturedSelection) => {
    const clipboard = window.navigator?.clipboard;
    if (!clipboard || typeof clipboard.readText !== 'function') return;
    const generation = syncIdentityRef.current.generation;
    let request;
    try {
      request = clipboard.readText();
    } catch {
      return;
    }
    Promise.resolve(request)
      .then((text) => {
        if (disabled || syncIdentityRef.current.generation !== generation) return;
        applyPlainTextPaste(text, capturedSelection);
      })
      .catch(() => {});
  }, [applyPlainTextPaste, disabled]);

  const handleClipboardPaste = useCallback((event, clipboardData) => {
    const consume = () => {
      event.preventDefault?.();
      event.stopPropagation?.();
    };
    if (disabled) {
      consume();
      return true;
    }

    let copiedContent = null;
    try { copiedContent = normalizeComposerContent(JSON.parse(clipboardData?.getData?.(COMPOSER_CLIPBOARD_TYPE) || 'null')); } catch {}
    if (copiedContent && insertComposerContent(editor, copiedContent, commandsRef.current, attachmentsRef.current)) {
      consume();
      publishDocument();
      return true;
    }

    const files = filesFromTransfer(clipboardData, { source: 'paste' });
    const text = plainTextFromClipboardData(clipboardData);
    const hasTextFormat = clipboardHasTextFormat(clipboardData);
    const handlesFilesystemItems = typeof onPasteFilesystemItems === 'function';
    if (files.length === 0 && !text && !hasTextFormat && !handlesFilesystemItems) return false;

    const capturedSelection = capturePasteSelection();
    consume();
    if (handlesFilesystemItems) {
      let uriList = '';
      try { uriList = clipboardData?.getData?.('text/uri-list') || ''; } catch { /* ignored */ }
      onPasteFilesystemItems({ files, uriList });
    } else if (files.length > 0) {
      onPasteFiles?.(files);
    }
    if (text) {
      applyPlainTextPaste(text, capturedSelection);
    } else if (files.length === 0 && hasTextFormat) {
      requestClipboardTextFallback(capturedSelection);
    }
    return true;
  }, [
    applyPlainTextPaste,
    capturePasteSelection,
    disabled,
    editor,
    publishDocument,
    onPasteFiles,
    onPasteFilesystemItems,
    requestClipboardTextFallback,
  ]);

  const markPasteHandled = useCallback(() => {
    const token = pasteBeforeInputGuardRef.current + 1;
    pasteBeforeInputGuardRef.current = token;
    window.setTimeout(() => {
      if (pasteBeforeInputGuardRef.current === token) pasteBeforeInputGuardRef.current = 0;
    }, 0);
  }, []);

  const handlePaste = useCallback((event) => {
    const nativeEvent = event.nativeEvent || event;
    if (nativeEvent && handledPasteEventsRef.current.has(nativeEvent)) return;
    const clipboardData = event.clipboardData || nativeEvent?.clipboardData;
    if (!handleClipboardPaste(event, clipboardData)) return;
    if (nativeEvent) handledPasteEventsRef.current.add(nativeEvent);
    markPasteHandled();
  }, [handleClipboardPaste, markPasteHandled]);

  const handleNativePaste = useCallback((event) => {
    if (handledPasteEventsRef.current.has(event)) return;
    if (!handleClipboardPaste(event, event.clipboardData)) return;
    handledPasteEventsRef.current.add(event);
    markPasteHandled();
  }, [handleClipboardPaste, markPasteHandled]);

  const handleDOMBeforeInput = useCallback((event) => {
    if (event.inputType !== 'insertFromPaste') return;
    if (pasteBeforeInputGuardRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.dataTransfer && handleClipboardPaste(event, event.dataTransfer)) return;

    const capturedSelection = capturePasteSelection();
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (typeof event.data === 'string' && event.data) {
      applyPlainTextPaste(event.data, capturedSelection);
      return;
    }
    requestClipboardTextFallback(capturedSelection);
  }, [
    applyPlainTextPaste,
    capturePasteSelection,
    disabled,
    handleClipboardPaste,
    requestClipboardTextFallback,
  ]);

  useEffect(() => {
    const editable = editableRef.current;
    if (!editable) return undefined;
    editable.addEventListener('paste', handleNativePaste, true);
    return () => editable.removeEventListener('paste', handleNativePaste, true);
  }, [handleNativePaste]);

  const handleCopy = useCallback((event) => {
    writeSelectedPlainText(event, editor);
  }, [editor]);

  const handleCut = useCallback((event) => {
    if (disabled || !writeSelectedPlainText(event, editor)) return;
    deleteSelectedPlainText(editor);
  }, [disabled, editor]);

  const handleDrop = useCallback((event) => {
    const files = filesFromTransfer(event.dataTransfer);
    const types = Array.from(event.dataTransfer?.types || []);
    if (
      types.includes('application/x-slate-fragment')
      || (files.length > 0 && !allowNativeFilesystemDrop)
    ) {
      event.preventDefault();
    }
  }, [allowNativeFilesystemDrop]);

  return (
    <Slate
      editor={editor}
      initialValue={initialValueRef.current}
      onValueChange={handleValueChange}
      onSelectionChange={handleSlateSelectionChange}
    >
      <Editable
        ref={editableRef}
        data-ace-rich-composer="true"
        aria-label={ariaLabel || placeholder}
        aria-disabled={disabled ? 'true' : undefined}
        readOnly={disabled}
        placeholder={placeholder}
        className={className}
        style={style}
        renderElement={renderElement}
        renderPlaceholder={renderPlaceholder}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDOMBeforeInput={handleDOMBeforeInput}
        onCopy={handleCopy}
        onCut={handleCut}
        onDrop={handleDrop}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck
      />
    </Slate>
  );
}

export const RichComposer = forwardRef(RichComposerShell);
