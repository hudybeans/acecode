import assert from 'node:assert/strict';
import {
  appendComposerImageAttachments, composerContentWithoutImages,
  isComposerThumbnailAttachment, withComposerImageAttachments,
} from './composerImagePresentation.js';
import { composerContentAttachments, composerContentFromText, composerContentText, reconcileComposerContentAttachments } from './composerContent.js';
import { removeComposerAttachmentReference } from './composerDraft.js';

const image = { local_id: 'image-1', name: 'pasted.png', kind: 'image', mime_type: 'image/png' };
const file = { local_id: 'file-1', id: 'pdf-1', name: 'notes.pdf', kind: 'file' };
const original = composerContentFromText('before after', [file]);
const withImage = appendComposerImageAttachments(original, [image]);
assert.equal(composerContentText(withImage), 'before after');
assert.deepEqual(composerContentWithoutImages(withImage), original);
assert.equal(composerContentAttachments(withImage, [image, file]).length, 2);

const edited = withComposerImageAttachments(composerContentFromText('edited', [file]), withImage);
assert.equal(composerContentText(edited), 'edited');
assert.deepEqual(composerContentAttachments(edited, [image, file]).map((item) => item.local_id), ['image-1', 'file-1']);
assert.deepEqual(appendComposerImageAttachments(withImage, [image]), withImage);
console.log('[pass] thumbnail images stay in the payload without entering the text editor or duplicating references');

const readyImage = { ...image, id: 'uploaded', blob_url: '/image/blob' };
const ready = reconcileComposerContentAttachments(withImage, [readyImage, file]);
assert.deepEqual(composerContentWithoutImages(ready), original);
assert.equal(composerContentAttachments(ready, [readyImage, file])[0].id, 'uploaded');
const removed = removeComposerAttachmentReference(withImage, 'image-1');
const lateUpload = reconcileComposerContentAttachments(removed, [readyImage, file]);
assert.deepEqual(withComposerImageAttachments(original, lateUpload), original);
assert.equal(composerContentAttachments(lateUpload, [readyImage, file]).some((item) => item.id === 'uploaded'), false);
console.log('[pass] upload hydration preserves editor text and cannot resurrect a removed image');

const restored = JSON.parse(JSON.stringify(ready));
assert.deepEqual(withComposerImageAttachments(composerContentWithoutImages(restored), restored), restored);
assert.equal(withComposerImageAttachments(composerContentFromText('next session'), null).parts.length, 1);
const reference = { local_id: 'path-image', kind: 'file', mime_type: 'image/jpeg', name: 'local.jpg', path: 'C:/local.jpg' };
const pathContent = appendComposerImageAttachments(original, [reference]);
assert.equal(isComposerThumbnailAttachment(reference), true);
assert.equal(pathContent.parts[0].kind, 'file');
assert.deepEqual(composerContentWithoutImages(pathContent), original);
assert.equal(isComposerThumbnailAttachment({ kind: 'file', mime_type: 'image/svg+xml' }), false);
console.log('[pass] restored drafts and trusted raster references keep attachment identity without inline filenames');
