import test from 'node:test';
import assert from 'node:assert/strict';
import { Frames, BoundedMap, messageKey, liveUpsert, mediaInfo, validateTarget,
  utf8Prefix, incomingText, MAX_FRAME_BYTES, MAX_MEDIA_BYTES } from './protocol.mjs';

test('fragmented UTF-8 and multiple frames are decoded without corruption', () => {
  const parser = new Frames();
  const frame = { id: 1, method: 'send', params: { text: '\u4e2d\u6587' } };
  const bytes = Buffer.from(JSON.stringify(frame) + '\n');
  const output = [];
  for (const byte of bytes) output.push(...parser.push(Buffer.from([byte])));
  assert.deepEqual(output, [frame]);
  assert.equal(parser.push(Buffer.concat([bytes, bytes])).length, 2);
});
test('malformed and oversized protocol data fails closed', () => {
  assert.throws(() => new Frames().push(Buffer.from('[]\n')));
  assert.throws(() => new Frames().push(Buffer.from('{"id":1,"method":"send","params":"x"}\n')));
  assert.throws(() => new Frames().push(Buffer.from('{broken}\n')));
  assert.throws(() => new Frames().push(Buffer.alloc(MAX_FRAME_BYTES + 1, 65)));
});
test('cache and compound keys cannot cross chat identities', () => {
  const cache = new BoundedMap(2);
  cache.set(messageKey('a', '1'), 1).set(messageKey('b', '1'), 2).set(messageKey('c', '1'), 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get(messageKey('a', '1')), undefined);
  assert.notEqual(messageKey('a|b', 'c'), messageKey('a', 'b|c'));
});
test('history and placeholder resend events do not execute turns', () => {
  assert.equal(liveUpsert({ type: 'append', messages: [] }), false);
  assert.equal(liveUpsert({ type: 'notify', requestId: 'spoof', messages: [] }), false);
  assert.equal(liveUpsert({ type: 'notify', requestId: '', messages: [] }), false);
  assert.equal(liveUpsert({ type: 'notify', messages: [] }), true);
});
test('media limit and account routing are enforced', () => {
  assert.throws(() => mediaInfo({ imageMessage: { fileLength: MAX_MEDIA_BYTES + 1 } }));
  assert.equal(mediaInfo({ documentMessage: { fileName: 'one.pdf', fileLength: 10 } }).kind, 'document');
  assert.throws(() => validateTarget({ account: '2@s.whatsapp.net', chat: '3@s.whatsapp.net' }, '1@s.whatsapp.net'));
  assert.throws(() => validateTarget({ account: '1@s.whatsapp.net', chat: 'status@broadcast' }, '1@s.whatsapp.net'));
  assert.doesNotThrow(() => validateTarget({ account: '1@s.whatsapp.net', chat: '2-3@g.us' }, '1@s.whatsapp.net'));
});

test('incoming text is never silently truncated and UTF-8 limits preserve characters', () => {
  assert.equal(utf8Prefix('\u4e2d\u6587', 5), '\u4e2d');
  assert.equal(utf8Prefix('test', 4), 'test');
  assert.deepEqual(incomingText('hello'), { text: 'hello' });
  assert.match(incomingText('\u4e2d'.repeat(22000)).error, /too large/);
  assert.match(incomingText('\u0000'.repeat(30000)).error, /too large/);
  assert.equal(incomingText('a'.repeat(65537)).text, '');
  assert.equal(mediaInfo({ documentMessage: { fileName: 'a'.repeat(1000) } }).name.length, 255);
});
