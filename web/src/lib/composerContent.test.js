import assert from 'node:assert/strict';
import {
  cloneComposerContent, composerAttachmentKey, composerContentAttachments,
  composerContentClipboardText, composerContentFromMessage, composerContentFromText,
  composerContentSignature, composerContentText, normalizeComposerContent,
  reconcileComposerContentAttachments,
} from './composerContent.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }
const mixed = {
  version: 1,
  parts: [
    { type: 'text', text: 'Use ' },
    { type: 'skill', name: 'review', token: '$review', path: '/skills/review/SKILL.md' },
    { type: 'text', text: ' on ' },
    { type: 'path', path: 'src/a.cpp', token: '@src/a.cpp', directory: false },
    { type: 'text', text: ' with ' },
    { type: 'attachment', key: 'upload-1', id: 'a1', name: 'diagram.png', kind: 'image' },
    { type: 'text', text: '\nthen explain.' },
  ],
};

run('ordered content round trips without editor objects or aliasing', () => {
  const copy = cloneComposerContent(JSON.parse(JSON.stringify(mixed)));
  assert.deepEqual(copy, mixed);
  assert.equal(composerContentText(copy), 'Use $review on @src/a.cpp with \nthen explain.');
  copy.parts[0].text = 'Changed';
  assert.equal(mixed.parts[0].text, 'Use ');
  assert.notEqual(composerContentSignature(copy), composerContentSignature(mixed));
});

run('canonical text coalescing preserves line breaks and empty documents', () => {
  assert.deepEqual(normalizeComposerContent({ version: 1, parts: [
    { type: 'text', text: 'a\r\n' }, { type: 'text', text: '' }, { type: 'text', text: 'b' },
  ] }), { version: 1, parts: [{ type: 'text', text: 'a\nb' }] });
  assert.deepEqual(composerContentFromText(''), { version: 1, parts: [] });
  assert.equal(composerContentSignature(null), '');
  assert.notEqual(composerContentSignature(composerContentFromText('')), '');
});

run('unsupported or malformed content is rejected without silently deleting references', () => {
  for (const value of [null, {}, { version: 2, parts: [] }, { version: 1, parts: [{}] },
    { version: 1, parts: [{ type: 'path', token: '@a' }] },
    { version: 1, parts: [{ type: 'skill', name: 'review' }] },
    { version: 1, parts: [{ type: 'attachment', name: 'lost.png' }] },
    { version: 1, parts: [{ type: 'text', text: 3 }] },
  ]) assert.equal(normalizeComposerContent(value), null);
});

run('legacy text and attachments get a deterministic fallback without parsing normal prose', () => {
  const fallback = composerContentFromText('Keep /unknown and $ordinary literal', [{ id: 'old', name: 'old.pdf' }]);
  assert.equal(fallback.parts[0].type, 'attachment');
  assert.equal(fallback.parts[0].key, 'old');
  assert.equal(fallback.parts[1].text, 'Keep /unknown and $ordinary literal');
  assert.equal(composerAttachmentKey({ local_id: 'local', id: 'uploaded' }), 'local');
});

run('upload hydration changes metadata in place and cannot resurrect deleted references', () => {
  const pending = composerContentFromText('tail', [{ local_id: 'upload-1', name: 'diagram.png', uploading: true }]);
  pending.parts.unshift({ type: 'text', text: 'head ' });
  const records = [{ local_id: 'upload-1', id: 'a1', name: 'diagram.png', kind: 'image', mime_type: 'image/png' }];
  const hydrated = reconcileComposerContentAttachments(pending, records);
  assert.deepEqual(hydrated.parts.map((part) => part.type), ['text', 'attachment', 'text']);
  assert.equal(hydrated.parts[1].key, 'upload-1');
  assert.equal(hydrated.parts[1].id, 'a1');
  assert.deepEqual(reconcileComposerContentAttachments(composerContentFromText('deleted'), records), composerContentFromText('deleted'));
});

run('draft attachment recovery and duplicate references retain resource identity', () => {
  const content = cloneComposerContent(mixed);
  content.parts.push({ ...mixed.parts[5], key: 'copied-reference' });
  const attachments = composerContentAttachments(content, [], { sessionId: 'session-1' });
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].local_id, 'upload-1');
  assert.equal(attachments[0].blob_url, '/api/sessions/session-1/attachments/a1/blob');
  const withRecord = composerContentAttachments(content, [{ id: 'a1', blob_url: '/actual/blob', metadata: { source_path: '/original.png' } }]);
  assert.equal(withRecord[0].blob_url, '/actual/blob');
  assert.equal(withRecord[0].metadata.source_path, '/original.png');
});

run('unfinished live uploads remain usable but restored missing resources cannot be sent silently', () => {
  const content = composerContentFromText('', [{ local_id: 'pending', name: 'a.png' }]);
  assert.ok(composerContentAttachments(content)[0].error);
  const pending = composerContentAttachments(content, [{ local_id: 'pending', uploading: true, pending_upload: true }])[0];
  assert.equal(pending.error, undefined);
  assert.equal(pending.uploading, true);
});

run('clipboard and transcript helpers preserve inline attachment labels and wire/frontend formats', () => {
  assert.equal(composerContentClipboardText(mixed), 'Use $review on @src/a.cpp with [diagram.png]\nthen explain.');
  for (const message of [{ composerContent: mixed }, { composer_content: mixed }, { metadata: { composer_content: mixed } }]) {
    assert.deepEqual(composerContentFromMessage(message), mixed);
  }
  assert.equal(composerContentFromMessage({ content: 'legacy' }), null);
});
