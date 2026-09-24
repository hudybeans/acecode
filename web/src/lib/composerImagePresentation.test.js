import assert from 'node:assert/strict';
import {
  appendComposerImageAttachments, appendPasteFileAttachments, composerContentWithoutImages,
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

// 触发场景:输入框同时有图片、内联粘贴块、文件粘贴块。
// 期望:编辑器投影剥掉图片与两种粘贴块(粘贴块显示为卡片,不进 Slate);把投影与原文档再合并回来
// 与原文档深度相等(图片在前、编辑器内容居中、粘贴块按原顺序在后);编辑后的投影合并仍保留块。
{
  const pastedInline = { type: 'pasted_text', key: 'paste-a', text: 'L1\nL2' };
  const pastedFile = {
    type: 'attachment', key: 'paste-f', id: 'pf', name: 'pasted-text.txt', kind: 'file',
    mime_type: 'text/plain', paste: { title: 'log', chars: 3, lines: 1 },
  };
  const x = reconcileComposerContentAttachments({ version: 1, parts: [
    ...appendComposerImageAttachments(original, [image]).parts, pastedInline, pastedFile,
  ] }, []);
  assert.deepEqual(composerContentWithoutImages(x), original);
  assert.deepEqual(withComposerImageAttachments(composerContentWithoutImages(x), x), x);
  const editedWithBlocks = withComposerImageAttachments(composerContentFromText('changed', [file]), x);
  assert.deepEqual(editedWithBlocks.parts.map((part) => part.key || part.text),
    ['image-1', 'file-1', 'changed', 'paste-a', 'paste-f']);
  console.log('[pass] paste blocks stay out of the editor projection and merge back in their original order');
}

// 触发场景:落文件的粘贴块暂存为资源(带 paste 描述)后追加进 composer。
// 期望:只追加带 paste 的资源、追加在末尾、kind 为 file,同一资源不重复追加。
{
  const pasteResource = {
    local_id: 'paste-r', name: 'pasted-text-1.txt', mime_type: 'text/plain',
    paste: { title: 't', chars: 1, lines: 1 }, pending_upload: true,
  };
  const appended = appendPasteFileAttachments(original, [pasteResource, file]);
  assert.equal(appended.parts.length, original.parts.length + 1);
  assert.equal(appended.parts.at(-1).key, 'paste-r');
  assert.equal(appended.parts.at(-1).kind, 'file');
  assert.deepEqual(appended.parts.at(-1).paste, pasteResource.paste);
  assert.deepEqual(appendPasteFileAttachments(appended, [pasteResource]), appended);
  console.log('[pass] staged pasted-text files append as trailing attachment parts once');
}
