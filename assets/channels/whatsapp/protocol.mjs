import { StringDecoder } from 'node:string_decoder';

export const MAX_FRAME_BYTES = 256 * 1024;
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export function utf8Prefix(text, limit) {
  return new StringDecoder('utf8').write(Buffer.from(String(text)).subarray(0, limit));
}
export function incomingText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536 ||
      Buffer.byteLength(JSON.stringify(text)) > MAX_FRAME_BYTES / 2) {
    return { text: '', error: 'Message is too large; send a shorter message' };
  }
  return { text };
}

export class Frames {
  #buffer = Buffer.alloc(0);
  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames = [];
    for (;;) {
      const end = this.#buffer.indexOf(10);
      if (end < 0) break;
      if (end > MAX_FRAME_BYTES) throw new Error('Frame too large');
      const frame = JSON.parse(this.#buffer.subarray(0, end).toString('utf8'));
      this.#buffer = this.#buffer.subarray(end + 1);
      if (!frame || !Number.isSafeInteger(frame.id) || frame.id < 1 ||
          typeof frame.method !== 'string' || !frame.params || typeof frame.params !== 'object' || Array.isArray(frame.params)) {
        throw new Error('Invalid request');
      }
      frames.push(frame);
    }
    if (this.#buffer.length > MAX_FRAME_BYTES) throw new Error('Frame too large');
    return frames;
  }
}

export class BoundedMap extends Map {
  constructor(limit) { super(); this.limit = limit; }
  set(key, value) {
    this.delete(key);
    super.set(key, value);
    while (this.size > this.limit) this.delete(this.keys().next().value);
    return this;
  }
}

export function messageKey(chat, id) { return JSON.stringify([chat, id]); }
export function liveUpsert(update) {
  return update?.type === 'notify' && !Object.hasOwn(update, 'requestId') && Array.isArray(update.messages);
}
export function contentText(content) {
  return content?.conversation ?? content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ?? content?.documentMessage?.caption ?? '';
}
export function mediaInfo(content) {
  const kind = content?.imageMessage ? 'image' : content?.documentMessage ? 'document' : null;
  if (!kind) return null;
  const media = kind === 'image' ? content.imageMessage : content.documentMessage;
  const size = Number(media.fileLength ?? 0);
  if (!Number.isFinite(size) || size < 0 || size > MAX_MEDIA_BYTES) throw new Error('Attachment exceeds 25 MiB');
  return { kind, name: utf8Prefix(media.fileName || (kind === 'image' ? 'image.jpg' : 'document'), 255),
    mime_type: utf8Prefix(media.mimetype || 'application/octet-stream', 128), size };
}
export function validateTarget(params, account) {
  if (!account || params.account !== account) throw new Error('WhatsApp account changed or disconnected');
  if (typeof params.chat !== 'string' || !/^\d+(?:-\d+)?@(s\.whatsapp\.net|lid|g\.us)$/.test(params.chat)) {
    throw new Error('Invalid chat');
  }
}
