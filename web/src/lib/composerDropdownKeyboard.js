// Completion menus own only unmodified keys. Modified keys belong to the
// composer (selection, word/document navigation, and inserting a line break).
export function shouldHandleComposerDropdownKey(event) {
  if (!event || event.defaultPrevented) return false;
  const nativeEvent = event.nativeEvent || event;
  return !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.isComposing
    && !nativeEvent.isComposing
    && event.keyCode !== 229
    && event.which !== 229
    && nativeEvent.keyCode !== 229
    && nativeEvent.which !== 229;
}

export function isComposerCompletionSelectionCollapsed(selection) {
  if (!selection) return false;
  // Attachments have zero plain-text length, so equal offsets alone cannot
  // distinguish an attachment selection from a caret next to the attachment.
  if (typeof selection.collapsed === 'boolean') return selection.collapsed;
  return Number.isFinite(selection.start) && selection.start === selection.end;
}
