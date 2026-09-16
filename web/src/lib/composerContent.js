import { normalizeAttachmentList, isImageAttachment } from './messageAttachments.js';

export const COMPOSER_CONTENT_VERSION = 1;

const plainText = (value) => String(value ?? '').replace(/\r\n?/g, '\n');
const string = (value) => typeof value === 'string' ? value : '';

// This contract deliberately contains no editor nodes, object URLs or upload state.
// Reject the whole unknown/malformed document: dropping a part loses user intent.
export function normalizeComposerContent(value) {
  if (!value || value.version !== COMPOSER_CONTENT_VERSION || !Array.isArray(value.parts)) return null;
  const parts = [];
  for (const part of value.parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
    let next;
    if (part.type === 'text') {
      if (typeof part.text !== 'string') return null;
      const text = plainText(part.text);
      if (!text) continue;
      if (parts.at(-1)?.type === 'text') {
        parts.at(-1).text += text;
        continue;
      }
      next = { type: 'text', text };
    } else if (part.type === 'path') {
      if (!string(part.path) || !string(part.token)) return null;
      next = { type: 'path', path: part.path, token: plainText(part.token) };
      if (typeof part.directory === 'boolean') next.directory = part.directory;
    } else if (part.type === 'skill') {
      if (!string(part.name) || !string(part.token)) return null;
      next = { type: 'skill', name: part.name, token: plainText(part.token) };
      if (string(part.path)) next.path = part.path;
    } else if (part.type === 'attachment') {
      if (!string(part.key) && !string(part.id)) return null;
      next = {
        type: 'attachment', key: string(part.key) || part.id,
        id: string(part.id), name: string(part.name) || 'attachment',
        kind: part.kind === 'image' ? 'image' : 'file',
      };
      if (string(part.mime_type)) next.mime_type = part.mime_type;
      if (string(part.path)) next.path = part.path;
    } else return null;
    parts.push(next);
  }
  return { version: COMPOSER_CONTENT_VERSION, parts };
}

export function cloneComposerContent(value) {
  return normalizeComposerContent(value);
}

export function composerContentText(value) {
  return (normalizeComposerContent(value)?.parts || []).map((part) => (
    part.type === 'text' ? part.text : part.type === 'attachment' ? '' : part.token
  )).join('');
}

export function composerContentSignature(value) {
  const content = normalizeComposerContent(value);
  return content ? JSON.stringify(content) : '';
}

export function composerAttachmentKey(attachment, index = 0) {
  return String(attachment?.local_id || attachment?.key || attachment?.id || attachment?.name || index);
}

function attachmentPart(attachment, index = 0) {
  return {
    type: 'attachment', key: composerAttachmentKey(attachment, index),
    id: string(attachment?.id), name: string(attachment?.name) || 'attachment',
    kind: isImageAttachment(attachment) ? 'image' : 'file',
    ...(attachment?.mime_type ? { mime_type: attachment.mime_type } : {}),
    ...(attachment?.path ? { path: attachment.path } : {}),
  };
}

export function composerContentFromText(text = '', attachments = []) {
  return normalizeComposerContent({
    version: COMPOSER_CONTENT_VERSION,
    parts: [...normalizeAttachmentList(attachments).map(attachmentPart), { type: 'text', text: plainText(text) }],
  });
}

function matchingAttachment(part, records) {
  return records.find((record, index) => (
    (part.id && record.id === part.id) || composerAttachmentKey(record, index) === part.key
  ));
}

export function reconcileComposerContentAttachments(value, resources = []) {
  const content = normalizeComposerContent(value);
  if (!content) return null;
  const records = normalizeAttachmentList(resources);
  return normalizeComposerContent({
    ...content,
    parts: content.parts.map((part) => {
      if (part.type !== 'attachment') return part;
      const record = matchingAttachment(part, records);
      if (!record) return part;
      return { ...part, ...attachmentPart({ ...part, ...record }), key: part.key };
    }),
  });
}

export function composerContentAttachments(value, resources = [], { sessionId = '' } = {}) {
  const content = normalizeComposerContent(value);
  if (!content) return [];
  const records = normalizeAttachmentList(resources);
  const seen = new Set();
  const attachments = [];
  for (const part of content.parts) {
    if (part.type !== 'attachment') continue;
    const record = matchingAttachment(part, records);
    const id = string(record?.id) || part.id;
    const identity = id || part.key;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const attachment = { ...part, ...record, id, local_id: part.key, type: part.kind };
    delete attachment.key;
    if (!attachment.blob_url && id && sessionId) {
      attachment.blob_url = `/api/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(id)}/blob`;
    }
    // An unfinished upload can only resume while its in-memory File is alive.
    if (!id && !record) attachment.error = 'Attachment upload is unavailable';
    attachments.push(attachment);
  }
  return attachments;
}

export function composerContentFromMessage(message) {
  return normalizeComposerContent(
    message?.composerContent ?? message?.composer_content ?? message?.metadata?.composer_content,
  );
}

export function composerContentClipboardText(value) {
  return (normalizeComposerContent(value)?.parts || []).map((part) => {
    if (part.type === 'text') return part.text;
    if (part.type === 'attachment') return `[${part.name}]`;
    return part.token;
  }).join('');
}
