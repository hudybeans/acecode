// 把 queue item 翻译成 QueueCardList 卡片要展示的结构。
// 抽出来是为了让 Node 单测能不依赖 DOM 验证状态/标签的映射。
//
// 输入是 chatInputQueue.js::buildQueuedMessageItems 返回的 item:
//   { kind:'msg', id, content, ts, queued: { id, sessionId, state, error, ... } }
// 输出是给 QueueCardList.jsx 一个稳定的 props 形状。

import { QUEUED_INPUT_STATE, QUEUE_PAUSE_REASON } from './chatInputQueue.js';
import {
  composerContentFromText, composerContentText, isPasteBlockPart, normalizeComposerContent,
} from './composerContent.js';
import { composerContentDisplayText } from './pastedText.js';

// 卡片只显示一行(CSS 截断 + title 悬浮提示)。普通文本保留前 4096 字符(日常消息
// 等于全文);旧版本排进来的消息可能有几 MB(f300 那条 2400 万字符),整段放进 DOM
// 属性会拖慢渲染。带粘贴块时块显示为「[粘贴的文本]」,概览最多 1000 字符。
const QUEUE_CARD_TEXT_MAX_CHARS = 4096;
const QUEUE_CARD_PASTE_SUMMARY_MAX_CHARS = 1000;

// 卡片栈顶部的「队列已暂停」横幅。输入是 chatInputQueue.js::queuedInputPause
// 返回的 { reason, pausedAt } 或 null;null 时不渲染横幅。
export function buildQueuePausedBanner(paused) {
  if (!paused || typeof paused !== 'object') return null;
  const reason = String(paused.reason || QUEUE_PAUSE_REASON.INTERRUPTED);
  return {
    reason,
    message: reason === QUEUE_PAUSE_REASON.INTERRUPTED
      ? '由于你中断了当前响应，队列已暂停'
      : '队列已暂停',
    resumeLabel: '继续',
    resumeTitle: '继续发送排队的消息',
  };
}

export function buildQueueCardItem(item) {
  const queued = item?.queued || {};
  const payload = queued.payload || {};
  const attachmentCount = Array.isArray(payload.attachments) ? payload.attachments.length : 0;
  const contextCount = Array.isArray(payload.contexts) ? payload.contexts.length : 0;
  const fallbackContent = [
    attachmentCount ? `${attachmentCount} 个附件` : '',
    contextCount ? `${contextCount} 个上下文` : '',
  ].filter(Boolean).join(' + ');
  const state = queued.state || QUEUED_INPUT_STATE.QUEUED;
  let statusLabel = '排队中';
  let statusKind = 'queued';
  let dimmed = false;
  let showRetry = false;
  if (state === QUEUED_INPUT_STATE.SENDING) {
    statusLabel = '发送中…';
    statusKind = 'sending';
    dimmed = true;
  } else if (state === QUEUED_INPUT_STATE.FAILED) {
    statusLabel = String(queued.error || '发送失败');
    statusKind = 'failed';
    showRetry = true;
  } else if (state === QUEUED_INPUT_STATE.GUIDING) {
    statusLabel = queued.acceptedAt ? '正在打断当前回合…' : '正在提交插话…';
    statusKind = 'guiding';
    dimmed = true;
  }
  const rawContent = String(item?.content || '');
  const composerContent = normalizeComposerContent(payload.composer_content);
  const hasPasteBlocks = !!composerContent?.parts.some(isPasteBlockPart);
  // 带粘贴块时:卡片文字把块显示成「[粘贴的文本]」,编辑框只拿编辑器文本(块在编辑框
  // 上方以卡片呈现),不对正文全文 trim。没有块时 /\S/ 找到第一个非空白字符即停。
  const displayText = hasPasteBlocks
    ? composerContentDisplayText(composerContent, '粘贴的文本', { maxChars: QUEUE_CARD_PASTE_SUMMARY_MAX_CHARS })
    : rawContent.slice(0, QUEUE_CARD_TEXT_MAX_CHARS);
  const editText = hasPasteBlocks ? composerContentText(composerContent) : rawContent;
  const hasText = hasPasteBlocks || /\S/.test(rawContent);
  const hasExtras = attachmentCount > 0 || contextCount > 0;
  const canEdit = (hasText || hasExtras) &&
    (state === QUEUED_INPUT_STATE.QUEUED || state === QUEUED_INPUT_STATE.FAILED);
  const canGuide = canEdit;
  return {
    queuedId: queued.id || '',
    content: String(displayText || fallbackContent || ''),
    editText,
    composerContent: payload.composer_content || (attachmentCount ? composerContentFromText(rawContent, payload.attachments) : null),
    hasExtras,
    hasContexts: contextCount > 0,
    state,
    statusLabel,
    statusKind,
    dimmed,
    showRetry,
    canEdit,
    canGuide,
  };
}

export function buildQueueCardItems(items) {
  return (Array.isArray(items) ? items : []).map(buildQueueCardItem);
}
