// 对话记录里用户消息正文的有界预览(第 2 条反馈 f300)。
//
// f300 的会话里有一条 2400 多万字符的 user 消息,切进会话时整段进 pre-wrap 气泡
// 排版,页面直接卡死。气泡只渲染前 LONG_USER_MESSAGE_PREVIEW_CHARS 字符 /
// LONG_USER_MESSAGE_PREVIEW_LINES 行(先到先算),其余经「查看全文」只读打开。
// 这里的扫描都先 slice 再数,输入再长也只看前 max+1 个码元。
import { normalizeComposerContent } from './composerContent.js';
import { LONG_USER_MESSAGE_PREVIEW_CHARS, LONG_USER_MESSAGE_PREVIEW_LINES } from './pastedText.js';

const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF;

// 在 maxChars 个码元与 maxNewlines 个换行之内截取前缀。截在第 maxNewlines+1 个换行
// 之前;那个换行若正好是全文最后一个字符(末尾换行),不算截断。
function boundedPrefix(text, maxChars, maxNewlines) {
  const value = String(text ?? '');
  const charLimit = Math.max(0, maxChars);
  const head = value.length > charLimit ? value.slice(0, charLimit + 1) : value;
  let end = Math.min(value.length, charLimit);
  let newlines = 0;
  let cutAtNewline = false;
  for (let index = head.indexOf('\n'); index >= 0 && index < end; index = head.indexOf('\n', index + 1)) {
    if (newlines >= maxNewlines) {
      end = index;
      cutAtNewline = true;
      break;
    }
    newlines += 1;
  }
  if (end >= value.length || (cutAtNewline && end === value.length - 1)) {
    return { preview: value, truncated: false, newlines };
  }
  // 截断点落在代理对中间时退一位,不产生半个字符。
  if (!cutAtNewline && end > 0 && isHighSurrogate(value.charCodeAt(end - 1))) end -= 1;
  return { preview: value.slice(0, end), truncated: true, newlines };
}

function limits(options = {}) {
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : LONG_USER_MESSAGE_PREVIEW_CHARS;
  const maxLines = Number.isFinite(options.maxLines) ? options.maxLines : LONG_USER_MESSAGE_PREVIEW_LINES;
  return { maxChars, maxNewlines: Math.max(0, maxLines - 1) };
}

// 纯文本消息(没有 composer_content 的旧消息)的预览。
export function userMessageTextPreview(text, options = {}) {
  const { maxChars, maxNewlines } = limits(options);
  const { preview, truncated } = boundedPrefix(text, maxChars, maxNewlines);
  return { preview, truncated };
}

// 结构化消息的预览:所有 text 部件共用同一份字符 / 行预算,预算用完后丢掉剩余的
// text 部件;path / skill / attachment / 粘贴块等紧凑部件原样保留(粘贴块渲染成
// 卡片,不占预算)。没有截断时原样返回同一个对象。
export function composerContentMessagePreview(value, options = {}) {
  const content = normalizeComposerContent(value);
  if (!content) return { content: null, truncated: false };
  const { maxChars, maxNewlines } = limits(options);
  let chars = maxChars;
  let newlines = maxNewlines;
  let truncated = false;
  const parts = [];
  for (const part of content.parts) {
    if (part.type !== 'text') {
      parts.push(part);
      continue;
    }
    if (truncated || chars <= 0) {
      truncated = true;
      continue;
    }
    const slice = boundedPrefix(part.text, chars, newlines);
    if (slice.preview) parts.push(slice.truncated ? { ...part, text: slice.preview } : part);
    chars -= slice.preview.length;
    newlines -= slice.newlines;
    if (slice.truncated) truncated = true;
  }
  if (!truncated) return { content, truncated: false };
  return { content: { ...content, parts }, truncated: true };
}
