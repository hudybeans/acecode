import {
  composerContentFromText, normalizeComposerContent,
} from './composerContent.js';
import { isComposerImageAttachment } from './richComposerModel.js';

// Local raster references remain file resources in the transport, but have the
// same thumbnail presentation as clipboard image snapshots.
export function isComposerThumbnailAttachment(item) {
  return isComposerImageAttachment(item)
    || /^image\/(?:png|jpe?g|webp|gif|bmp|tiff|avif|heic|heif)$/i.test(item?.mime_type || item?.mimeType || '');
}

const isImagePart = (part) => part.type === 'attachment' && isComposerThumbnailAttachment(part);

export function composerContentWithoutImages(value) {
  const content = normalizeComposerContent(value);
  return content ? normalizeComposerContent({ ...content, parts: content.parts.filter((part) => !isImagePart(part)) }) : null;
}

export function withComposerImageAttachments(editorContent, imageContent) {
  const content = composerContentWithoutImages(editorContent) || composerContentFromText('');
  const seen = new Set();
  const images = (normalizeComposerContent(imageContent)?.parts || []).filter((part) => {
    if (!isImagePart(part)) return false;
    const identity = part.id || part.key;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return normalizeComposerContent({ ...content, parts: [...images, ...content.parts] });
}

export function appendComposerImageAttachments(content, resources) {
  const current = normalizeComposerContent(content) || composerContentFromText('');
  const images = resources.filter(isComposerThumbnailAttachment).flatMap((item) => (
    composerContentFromText('', [item]).parts.map((part) => (
      // Do not turn a trusted path reference into a snapshot/image upload.
      item.kind === 'file' ? { ...part, kind: 'file' } : part
    ))
  ));
  return withComposerImageAttachments(current, { ...current, parts: [...current.parts, ...images] });
}
