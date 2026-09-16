import assert from 'node:assert/strict';
import { composerContentText, composerContentAttachments, normalizeComposerContent } from './composerContent.js';
import { composerDraftSnapshot, composerDraftEditFingerprint, removeComposerAttachmentReference, mergeComposerAttachmentResources, completeDetachedComposerUpload } from './composerDraft.js';
import { updateHomeComposerDrafts, homeComposerDraft, clearHomeComposerDraftIfMatch } from './homeComposerDrafts.js';
import { buildComposerHistoryEntries } from './inputHistoryNavigation.js';
import { buildQueueCardItem } from './queueCardItem.js';
import { createChatInputQueueState, enqueueQueuedInput, queuedInputRequestPayload, updateQueuedInputContent, markQueuedInputFailed, retryQueuedInput } from './chatInputQueue.js';

const content = {
  version: 1,
  parts: [
    { type: 'text', text: 'Please use ' },
    { type: 'skill', name: 'review', token: '$review' },
    { type: 'text', text: ' with ' },
    { type: 'attachment', key: 'local-doc', id: 'doc-id', name: 'notes.pdf', kind: 'file' },
    { type: 'text', text: ' and ' },
    { type: 'path', path: 'src/main.cpp', token: '@src/main.cpp' },
  ],
};
const text = composerContentText(content);
const resources = [{ local_id: 'local-doc', id: 'doc-id', name: 'notes.pdf', kind: 'file', blob_url: '/verified-blob' }];
const snapshot = composerDraftSnapshot(text, content, resources);
let drafts = updateHomeComposerDrafts({}, 'workspace', snapshot);
assert.deepEqual(homeComposerDraft(drafts, 'workspace').composer_content, content);
assert.equal(homeComposerDraft(drafts, 'workspace').attachments[0].blob_url, '/verified-blob');
const moved = { ...content, parts: [content.parts[3], ...content.parts.filter((_, index) => index !== 3)] };
drafts = updateHomeComposerDrafts(drafts, 'workspace', composerDraftSnapshot(text, moved, resources));
assert.equal(clearHomeComposerDraftIfMatch(drafts, 'workspace', snapshot), drafts, 'same text with moved references is a different draft');
const onlyAttachment = { version: 1, parts: [content.parts[3]] };
assert.equal(homeComposerDraft(updateHomeComposerDrafts({}, '', composerDraftSnapshot('', onlyAttachment, resources)), '').composer_content.parts.length, 1);
console.log('[pass] home draft restoration preserves order, resources and attachment-only drafts');

const removed = removeComposerAttachmentReference(content, 'local-doc');
assert.equal(composerContentAttachments(removed, resources).length, 0);
assert.equal(mergeComposerAttachmentResources(resources, []), resources);
assert.equal(composerContentAttachments(content, resources)[0].id, 'doc-id', 'undo can reuse retained upload resource');
const uploading = { ...content, parts: content.parts.map((part) => part.type === 'attachment' ? { ...part, id: '' } : part) };
assert.equal(composerDraftEditFingerprint(text, uploading), composerDraftEditFingerprint(text, content));
assert.notEqual(composerDraftEditFingerprint(text, content), composerDraftEditFingerprint(text, moved));
console.log('[pass] removal retains undo resources while upload metadata does not count as a new user edit');

let queue = enqueueQueuedInput(createChatInputQueueState(), { sessionId: 'session', payload: { text, composer_content: content, attachments: [{ id: 'doc-id' }] } });
const queueId = queue.items[0].queued.id;
queue = markQueuedInputFailed(queue, queueId, 'offline');
queue = retryQueuedInput(queue, queueId);
assert.deepEqual(queuedInputRequestPayload(queue.items[0]).composer_content, content);
queue = updateQueuedInputContent(queue, queueId, text, { composerContent: moved });
assert.deepEqual(queuedInputRequestPayload(queue.items[0]).composer_content, normalizeComposerContent(moved));
queue = updateQueuedInputContent(queue, queueId, text, { composerContent: removed });
assert.deepEqual(queuedInputRequestPayload(queue.items[0]).attachments, []);
queue = updateQueuedInputContent(queue, queueId, 'legacy caller edited the text');
assert.equal(queuedInputRequestPayload(queue.items[0]).composer_content, undefined,
  'a text-only edit must not resend the previous canonical text');
console.log('[pass] queue retry and editing preserve order and remove only deleted attachment references');

let legacyQueue = enqueueQueuedInput(createChatInputQueueState(), { sessionId: 'session', payload: { text: 'old input', attachments: [{ id: 'old-id', name: 'old.pdf' }] } });
const legacyCard = buildQueueCardItem(legacyQueue.items[0]);
const editedLegacy = { ...legacyCard.composerContent, parts: legacyCard.composerContent.parts.map((part) => part.type === 'text' ? { ...part, text: 'edited input' } : part) };
legacyQueue = updateQueuedInputContent(legacyQueue, legacyCard.queuedId, 'edited input', { composerContent: editedLegacy });
assert.deepEqual(queuedInputRequestPayload(legacyQueue.items[0]).attachments, [{ id: 'old-id' }]);
console.log('[pass] editing a legacy queued message retains its uploaded attachment');

const history = buildComposerHistoryEntries({ cwdHistory: [text], transcriptItems: [
  { kind: 'msg', role: 'user', content: 'expanded skill instructions', metadata: { composer_content: content } },
  { kind: 'msg', role: 'user', content: '', composerContent: onlyAttachment },
] });
assert.equal(history.length, 2);
assert.equal(history[0].text, text);
assert.deepEqual(history[0].composer_content, content);
assert.deepEqual(history[1].composer_content, onlyAttachment);
console.log('[pass] history recalls structured user input instead of expanded model instructions');

let saved;
const api = {
  getSessionDraft: async () => ({ text, composer_content: uploading }),
  setSessionDraft: async (...args) => { saved = args; },
};
await completeDetachedComposerUpload(api, 'session', resources[0]);
assert.equal(saved[3].parts[3].id, 'doc-id');
saved = null;
api.getSessionDraft = async () => ({ text, composer_content: removed });
assert.equal(await completeDetachedComposerUpload(api, 'session', resources[0]), false);
assert.equal(saved, null, 'late upload completion must not resurrect a removed reference');
console.log('[pass] upload completion updates a detached draft without restoring removed references');
