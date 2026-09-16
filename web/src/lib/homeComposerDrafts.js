import { composerContentSignature, normalizeComposerContent } from './composerContent.js';

export const NO_WORKSPACE_HOME_DRAFT_KEY = '__no_workspace__';

export function homeComposerDraftKey(workspaceHash = '') {
  const normalized = String(workspaceHash || '');
  return normalized || NO_WORKSPACE_HOME_DRAFT_KEY;
}

export function homeComposerDraftText(drafts, workspaceHash = '') {
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) return '';
  const value = drafts[homeComposerDraftKey(workspaceHash)];
  return typeof value === 'string' ? value : String(value?.text || '');
}

export function homeComposerDraft(drafts, workspaceHash = '') {
  const value = drafts?.[homeComposerDraftKey(workspaceHash)];
  return value && typeof value === 'object' ? value : { text: homeComposerDraftText(drafts, workspaceHash) };
}

function draftSignature(value) {
  if (typeof value === 'string') return JSON.stringify([value, '', []]);
  return JSON.stringify([
    String(value?.text || ''),
    composerContentSignature(value?.composer_content),
    Array.from(value?.attachments || []).map((item) => [item.local_id, item.id, item.uploading, item.pending_upload, item.upload_error]),
  ]);
}

export function updateHomeComposerDrafts(drafts, workspaceHash = '', text = '') {
  const current = drafts && typeof drafts === 'object' && !Array.isArray(drafts)
    ? drafts
    : {};
  const key = homeComposerDraftKey(workspaceHash);
  const structured = text && typeof text === 'object';
  const nextText = structured ? String(text.text || '') : String(text || '');
  const content = structured ? normalizeComposerContent(text.composer_content) : null;
  const nextValue = structured ? { ...text, text: nextText, composer_content: content } : nextText;

  if (!nextText && !content?.parts?.length) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) return current;
    const next = { ...current };
    delete next[key];
    return next;
  }

  if (draftSignature(current[key]) === draftSignature(nextValue)) return current;
  return { ...current, [key]: nextValue };
}

export function clearHomeComposerDraftIfMatch(drafts, workspaceHash = '', expectedText = '') {
  if (expectedText && typeof expectedText === 'object') {
    if (draftSignature(homeComposerDraft(drafts, workspaceHash)) !== draftSignature(expectedText)) return drafts;
    return updateHomeComposerDrafts(drafts, workspaceHash, '');
  }
  const normalizedExpected = typeof expectedText === 'string'
    ? expectedText
    : String(expectedText || '');
  if (homeComposerDraftText(drafts, workspaceHash) !== normalizedExpected) return drafts;
  return updateHomeComposerDrafts(drafts, workspaceHash, '');
}
