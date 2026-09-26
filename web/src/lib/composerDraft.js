import {
  composerAttachmentKey,
  composerContentAttachments,
  composerContentSignature,
  composerContentText,
  normalizeComposerContent,
  reconcileComposerContentAttachments,
} from './composerContent.js';

export function composerDraftSnapshot(text, content, resources = []) {
  const composer_content = reconcileComposerContentAttachments(content, resources);
  return {
    text: String(text || ''),
    ...(composer_content ? { composer_content } : {}),
    attachments: composer_content ? composerContentAttachments(composer_content, resources) : [],
  };
}

export function composerDraftFingerprint(text, content) {
  return JSON.stringify([String(text || ''), composerContentSignature(content)]);
}

export function composerDraftEditFingerprint(text, content) {
  let offset = 0;
  const references = [];
  for (const part of normalizeComposerContent(content)?.parts || []) {
    if (part.type === 'attachment') references.push([offset, part.key]);
    // Inline pasted blocks are not editor text: record them by key without
    // advancing the offset (editing a block replaces its key).
    else if (part.type === 'pasted_text') references.push([offset, 'pasted_text', part.key || '']);
    else offset += (part.type === 'text' ? part.text : part.token).length;
  }
  // Tokenizing existing text or completing an upload is not a new user edit.
  return JSON.stringify([String(text || ''), references]);
}

export function mergeComposerAttachmentResources(current = [], restored = []) {
  const next = [...current];
  for (const record of restored) {
    const key = composerAttachmentKey(record);
    const index = next.findIndex((item) => composerAttachmentKey(item) === key || (record.id && item.id === record.id));
    if (index < 0) next.push(record);
    // A serialized part never overwrites a live upload or File resource.
  }
  return next.length === current.length ? current : next;
}

export function removeComposerAttachmentReference(content, key) {
  const normalized = normalizeComposerContent(content);
  if (!normalized) return null;
  return { ...normalized, parts: normalized.parts.filter((part) => (
    part.type !== 'attachment' || (part.key !== key && part.id !== key)
  )) };
}

export function composerContentForGuidance(content) {
  const normalized = normalizeComposerContent(content);
  if (!normalized) return null;
  const text = composerContentText(normalized);
  const prefix = /^\/turn(?:\s+|$)/.exec(text)?.[0] || '';
  if (!prefix) return normalized;
  let remaining = prefix.length;
  const parts = [];
  for (const part of normalized.parts) {
    // Attachments and both kinds of paste blocks are not part of the /turn prefix.
    if (part.type === 'attachment' || part.type === 'pasted_text') { parts.push(part); continue; }
    if (!remaining) { parts.push(part); continue; }
    const value = part.type === 'text' ? part.text : part.token;
    if (remaining >= value.length) { remaining -= value.length; continue; }
    parts.push({ type: 'text', text: value.slice(remaining) });
    remaining = 0;
  }
  return normalizeComposerContent({ ...normalized, parts });
}

export async function completeDetachedComposerUpload(api, sessionId, attachment, pendingSaves = []) {
  await Promise.all(pendingSaves.map((save) => Promise.resolve(save).catch(() => null)));
  const draft = await api.getSessionDraft(sessionId);
  const content = normalizeComposerContent(draft?.composer_content);
  if (!content?.parts.some((part) => part.type === 'attachment' && part.key === attachment.local_id)) return false;
  const updated = reconcileComposerContentAttachments(content, [attachment]);
  if (composerContentSignature(updated) === composerContentSignature(content)) return false;
  await api.setSessionDraft(sessionId, String(draft.text || ''), '', updated);
  return true;
}
