import {
  composerContentAttachments,
  composerContentFromMessage,
  composerContentFromText,
  composerContentText,
  normalizeComposerContent,
  reconcileComposerContentAttachments,
} from './composerContent.js';
import { composerDraftEditFingerprint } from './composerDraft.js';
import { attachmentsFromContentParts } from './messageAttachments.js';

const OPTIMISTIC_METADATA_KEY = 'optimistic_new_session_input';

function normalizedText(value) {
  return String(value ?? '').trim();
}

function displayedUserText(item) {
  const displayText = item?.metadata?.display_text;
  if (typeof displayText === 'string' && displayText.trim()) return displayText;
  return item?.content || '';
}

function isMatchingCanonicalUserMessage(item, pending) {
  if (item?.kind !== 'msg' || item.role !== 'user') return false;
  const metadata = item.metadata && typeof item.metadata === 'object'
    ? item.metadata
    : {};
  if (
    metadata[OPTIMISTIC_METADATA_KEY] === true
    || metadata.synthetic_user_prompt === true
    || metadata.hidden_goal_context === true
  ) {
    return false;
  }
  const canonicalContent = composerContentFromMessage(item);
  if (canonicalContent && pending.item.composerContent) {
    return composerDraftEditFingerprint(composerContentText(canonicalContent), canonicalContent)
      === pending.contentFingerprint;
  }
  if (pending.normalizedText) return normalizedText(displayedUserText(item)) === pending.normalizedText;
  // Older canonical projections may not have ordered metadata. Attachment-only
  // messages still reconcile once the optimistic upload identities are known.
  const expectedIds = attachmentsFromContentParts(pending.item.contentParts).map((item) => item.id).filter(Boolean).sort();
  const actualIds = attachmentsFromContentParts(item.contentParts).map((item) => item.id).filter(Boolean).sort();
  return expectedIds.length > 0 && JSON.stringify(expectedIds) === JSON.stringify(actualIds);
}

export function createPendingNewSessionFirstUserMessage({
  sessionId,
  text,
  composerContent = null,
  attachments = [],
  timestampMs = Date.now(),
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  const resourceItems = Array.isArray(attachments) ? attachments : [];
  const suppliedContent = normalizeComposerContent(composerContent);
  const orderedContent = reconcileComposerContentAttachments(
    suppliedContent || (resourceItems.length ? composerContentFromText(text, resourceItems) : null),
    resourceItems,
  );
  const content = String(text ?? composerContentText(orderedContent));
  const comparableText = normalizedText(content);
  const resources = orderedContent ? composerContentAttachments(orderedContent, resourceItems, { sessionId: normalizedSessionId }) : [];
  if (!normalizedSessionId || (!comparableText && !resources.length && !normalizedText(composerContentText(orderedContent)))) return null;

  const parsedTimestamp = Number(timestampMs);
  const ts = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  return {
    sessionId: normalizedSessionId,
    normalizedText: comparableText,
    contentFingerprint: orderedContent
      ? composerDraftEditFingerprint(composerContentText(orderedContent), orderedContent) : '',
    item: {
      kind: 'msg',
      id: `optimistic-new-session-user:${normalizedSessionId}`,
      messageId: '',
      role: 'user',
      content,
      contentParts: resources.map((attachment) => ({
        type: attachment.kind === 'image' ? 'image' : 'file', attachment,
      })),
      ...(orderedContent ? { composerContent: orderedContent } : {}),
      metadata: {
        display_text: content,
        [OPTIMISTIC_METADATA_KEY]: true,
      },
      ts,
      streaming: false,
    },
  };
}

export function withPendingNewSessionFirstUserMessage(
  items,
  pending,
  currentSessionId,
) {
  const source = Array.isArray(items) ? items : [];
  if (
    !pending
    || !pending.item
    || (!pending.normalizedText && !pending.item.composerContent?.parts?.length)
    || pending.sessionId !== String(currentSessionId || '').trim()
  ) {
    return source;
  }
  if (source.some((item) => isMatchingCanonicalUserMessage(item, pending))) {
    return source;
  }
  return [pending.item, ...source];
}

export const __test__ = {
  displayedUserText,
  isMatchingCanonicalUserMessage,
  normalizedText,
};
