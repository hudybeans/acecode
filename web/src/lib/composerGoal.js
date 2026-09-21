import { composerContentFromText, normalizeComposerContent } from './composerContent.js';

// The stored draft keeps the existing command protocol. Only the editor's
// projection removes the confirmed prefix, so goal selection follows drafts.
export function projectComposerGoal(text, content) {
  const value = String(text || '');
  const normalized = normalizeComposerContent(content);
  const prefix = /^\/goal(?:\s)/i.exec(value)?.[0] || '';
  if (!prefix) return { goalMode: false, text: value, content: normalized, prefixLength: 0 };
  let remaining = prefix.length;
  const parts = [];
  for (const part of normalized?.parts || []) {
    if (part.type === 'attachment' || !remaining) {
      parts.push(part);
      continue;
    }
    const partText = part.type === 'text' ? part.text : part.token;
    if (remaining >= partText.length) remaining -= partText.length;
    else {
      parts.push({ type: 'text', text: partText.slice(remaining) });
      remaining = 0;
    }
  }
  return {
    goalMode: true,
    text: value.slice(prefix.length),
    content: normalized ? normalizeComposerContent({ ...normalized, parts }) : null,
    prefixLength: prefix.length,
  };
}

export function serializeComposerGoal(text, content, goalMode) {
  const value = String(text || '');
  const normalized = normalizeComposerContent(content) || composerContentFromText(value);
  return {
    text: goalMode ? `/goal ${value}` : value,
    content: goalMode ? normalizeComposerContent({
      ...normalized,
      parts: [{ type: 'text', text: '/goal ' }, ...normalized.parts],
    }) : normalized,
  };
}
