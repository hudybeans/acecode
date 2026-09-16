import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import makeWASocket, { fetchLatestWaWebVersion, useMultiFileAuthState, DisconnectReason, downloadMediaMessage,
  jidNormalizedUser, normalizeMessageContent, generateMessageIDV2 } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Frames, BoundedMap, messageKey, liveUpsert, contentText, mediaInfo,
  validateTarget, utf8Prefix, incomingText, MAX_MEDIA_BYTES, MAX_FRAME_BYTES } from './protocol.mjs';

process.umask(0o077);
console.log = console.info = (...args) => console.error(...args);
const index = process.argv.indexOf('--state-dir');
if (index < 0 || !process.argv[index + 1]) throw new Error('--state-dir required');
const directory = path.resolve(process.argv[index + 1]);
const setupOnly = process.argv.includes('--setup-only');
const mediaDirectory = path.join(directory, 'media');
await fs.mkdir(mediaDirectory, { recursive: true, mode: 0o700 });
const logger = pino({ level: 'silent' });
const messages = new BoundedMap(256);
const sent = new BoundedMap(4096);
const sentPath = path.join(directory, 'sent.json');
try {
  if ((await fs.stat(sentPath)).size > 256 * 1024) throw new Error('Invalid outbound receipt cache');
  const ids = JSON.parse(await fs.readFile(sentPath, 'utf8'));
  if (!Array.isArray(ids) || ids.length > 4096 || ids.some(id => typeof id !== 'string' || id.length > 100)) {
    throw new Error('Invalid outbound receipt cache');
  }
  for (const id of ids) sent.set(id, true);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let socket, account = '', state = 'disconnected', qr = '', qrText = '';
let stopping = false, reconnectTimer, reconnectAttempt = 0, generation = 0;
let sendQueue = Promise.resolve(), credentialQueue = Promise.resolve();
let credentialError;

function emit(frame) {
  const data = JSON.stringify(frame) + '\n';
  if (Buffer.byteLength(data) > MAX_FRAME_BYTES || process.stdout.writableLength > 4 * MAX_FRAME_BYTES) {
    process.exit(2);
  }
  process.stdout.write(data);
}
function status() { return { state, account, qr, qr_text: qrText }; }
function changed() { emit({ event: 'status', ...status() }); }
async function peer(sock, jid, alternative) {
  const primary = jidNormalizedUser(alternative || jid || '');
  if (primary.endsWith('@lid')) {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(primary);
    if (pn) return jidNormalizedUser(pn);
  }
  return primary;
}
async function connect() {
  if (socket || stopping) return status();
  const current = ++generation;
  const auth = await useMultiFileAuthState(path.join(directory, 'auth'));
  if (stopping || current !== generation) return status();
  const sock = makeWASocket({ auth: auth.state, logger, version: (await fetchLatestWaWebVersion()).version,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, markOnlineOnConnect: false,
    getMessage: async key => messages.get(messageKey(key.remoteJid, key.id))?.message || { conversation: '' } });
  socket = sock; state = 'connecting'; changed();
  sock.ev.on('creds.update', () => {
    credentialQueue = credentialQueue.then(() => auth.saveCreds()).catch(() => {
      credentialError = new Error('Cannot persist WhatsApp credentials');
      emit({ event: 'error', error: 'Cannot persist WhatsApp credentials' });
      void disconnect();
    });
  });
  sock.ev.on('connection.update', update => {
    if (current !== generation || stopping) return;
    if (update.qr) {
      qr = update.qr; state = 'pairing';
      qrcode.generate(qr, { small: true }, value => { qrText = value; changed(); });
    }
    if (update.connection === 'open') {
      const nextAccount = jidNormalizedUser(sock.user?.id || '');
      if (account !== nextAccount) messages.clear();
      account = nextAccount;
      qr = ''; qrText = ''; state = 'connected'; reconnectAttempt = 0; changed();
    }
    if (update.connection === 'close') {
      socket = undefined; qr = ''; qrText = '';
      const code = update.lastDisconnect?.error?.output?.statusCode;
      state = code === DisconnectReason.loggedOut ? 'logged_out' : 'reconnecting'; changed();
      if (state !== 'logged_out') {
        reconnectTimer = setTimeout(() => void connect().catch(failed), Math.min(30000, 1000 * 2 ** reconnectAttempt++));
      }
    }
  });
  sock.ev.on('messages.upsert', update => {
    if (setupOnly || current !== generation || state !== 'connected' || !liveUpsert(update)) return;
    for (const raw of update.messages) void receive(raw, sock, current).catch(error => {
      emit({ event: 'error', error: `Incoming WhatsApp message failed: ${error.message}` });
    });
  });
  return status();
}
function failed(error) { state = 'error'; emit({ event: 'error', error: error.message }); changed(); }
async function disconnect() {
  ++generation; clearTimeout(reconnectTimer);
  const old = socket; socket = undefined;
  old?.end(new Error('ACECode disconnected'));
  state = 'disconnected'; qr = ''; qrText = ''; changed();
  await credentialQueue;
}
async function receive(raw, sock, current) {
  const receivingAccount = account;
  const key = raw.key;
  if (!key?.id || !key.remoteJid || key.remoteJid === 'status@broadcast' || key.remoteJid.endsWith('@newsletter')) return;
  const group = key.remoteJid.endsWith('@g.us');
  const chat = group ? key.remoteJid : await peer(sock, key.remoteJid, key.remoteJidAlt);
  if (key.fromMe && (chat !== receivingAccount || sent.has(key.id))) return;
  const sender = group ? await peer(sock, key.participant, key.participantAlt) : chat;
  if (current !== generation || socket !== sock || state !== 'connected' || account !== receivingAccount) return;
  if (!sender) return;
  const content = normalizeMessageContent(raw.message);
  if (!content || content.protocolMessage || content.reactionMessage) return;
  const body = content.extendedTextMessage || content.imageMessage || content.documentMessage;
  const context = body?.contextInfo;
  const ownJids = [receivingAccount, jidNormalizedUser(sock.user?.lid || '')];
  const mentioned = (context?.mentionedJid || []).some(jid => ownJids.includes(jidNormalizedUser(jid)));
  let text = contentText(content);
  if (group && mentioned) for (const own of ownJids.filter(Boolean)) {
    text = text.replaceAll('@' + own.split('@')[0], '').trim();
  }
  let media;
  try { media = mediaInfo(content); }
  catch (error) { media = { kind: 'rejected', error: error.message }; }
  const unsupported = content.audioMessage || content.videoMessage || content.stickerMessage;
  if (!text && !media && !unsupported) return;
  messages.set(messageKey(chat, key.id), raw);
  const quoted = normalizeMessageContent(context?.quotedMessage);
  emit({ event: 'message', account: receivingAccount, chat, sender, group, mentioned, id: key.id,
    ...incomingText(text), media: unsupported ? { kind: 'unsupported' } : media,
    quote: context?.stanzaId ? { id: context.stanzaId, text: utf8Prefix(contentText(quoted), 8000) } : undefined });
}

async function execute(method, params) {
  if (method === 'status') return status();
  if (method === 'connect') return connect();
  if (method === 'disconnect') {
    await disconnect();
    if (credentialError) throw credentialError;
    return status();
  }
  if (setupOnly) throw new Error('Configuration mode cannot send or download messages');
  if (state !== 'connected' || !socket) throw new Error('WhatsApp is not connected');
  const connected = socket;
  validateTarget(params, account);
  if (method === 'download') {
    const raw = messages.get(messageKey(params.chat, params.id));
    if (!raw) throw new Error('Attachment expired; please resend');
    const stream = await downloadMediaMessage(raw, 'stream', {}, { logger, reuploadRequest: connected.updateMediaMessage });
    const chunks = []; let length = 0;
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > MAX_MEDIA_BYTES) { stream.destroy(); throw new Error('Attachment exceeds 25 MiB'); }
      chunks.push(chunk);
    }
    const filename = path.join(mediaDirectory, crypto.randomUUID());
    await fs.writeFile(filename, Buffer.concat(chunks), { mode: 0o600, flag: 'wx' });
    return { path: filename, size: length };
  }
  let content;
  if (method === 'send') {
    if (typeof params.text !== 'string' || !params.text || Buffer.byteLength(params.text) > 65536) throw new Error('Invalid text');
    content = { text: params.text };
  } else if (method === 'send_file') {
    const stat = await fs.stat(params.path);
    if (!stat.isFile() || stat.size > MAX_MEDIA_BYTES) throw new Error('File missing or larger than 25 MiB');
    const bytes = await fs.readFile(params.path);
    if (bytes.length > MAX_MEDIA_BYTES) throw new Error('File exceeds 25 MiB');
    const mime = String(params.mime_type || 'application/octet-stream');
    content = /^image\/(png|jpeg|webp)$/.test(mime)
      ? { image: bytes, mimetype: mime }
      : { document: bytes, mimetype: mime, fileName: String(params.name || 'attachment') };
  } else throw new Error('Unknown method');
  const messageId = generateMessageIDV2(connected.user?.id);
  sent.set(messageId, true);
  // Persist before sending, including ambiguous outcomes, so self-chat echoes
  // never become user prompts after a bridge restart.
  await fs.writeFile(sentPath + '.tmp', JSON.stringify([...sent.keys()]), { mode: 0o600 });
  await fs.rename(sentPath + '.tmp', sentPath);
  validateTarget(params, account);
  if (socket !== connected || state !== 'connected') throw new Error('Connection changed before sending');
  const quoted = params.quote_id ? messages.get(messageKey(params.chat, params.quote_id)) : undefined;
  const result = await connected.sendMessage(params.chat, content, { messageId, ...(quoted ? { quoted } : {}) });
  if (result) messages.set(messageKey(params.chat, result.key.id), result);
  return { message_id: result?.key?.id || messageId };
}

const frames = new Frames();
let pending = 0;
process.stdin.on('data', chunk => {
  try {
    for (const frame of frames.push(chunk)) {
      if (++pending > 64) throw new Error('Request queue full');
      const run = () => execute(frame.method, frame.params);
      const promise = ['send', 'send_file'].includes(frame.method)
        ? (sendQueue = sendQueue.catch(() => {}).then(run)) : Promise.resolve().then(run);
      promise.then(result => emit({ id: frame.id, ok: true, result }),
        error => emit({ id: frame.id, ok: false, error: error.message })).finally(() => --pending);
    }
  } catch { process.exit(2); }
});
async function close() {
  stopping = true;
  await disconnect(); await credentialQueue;
  process.exit(0);
}
process.stdin.on('end', () => void close());
process.on('SIGTERM', () => void close());
process.stdout.on('error', () => process.exit(0));
emit({ event: 'ready', protocol: 1 });
