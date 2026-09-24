const DEFAULT_PREVIEW_LIMIT = 180;

function textFromValue(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// 归一化最多只看这么多个码元(且不少于 limit 的 8 倍,给大段空白折叠留余量)。
// 回合滚动条对每条用户消息都调一次;f300 那条 2400 万字符的消息曾在这里被
// split / Array.from 成 2400 万元素的数组,切进会话即卡死。
const PREVIEW_SCAN_MIN_CHARS = 4096;

export function compactOneLinePreview(value, limit = DEFAULT_PREVIEW_LIMIT) {
  const whole = textFromValue(value);
  const max = Math.max(8, Number(limit) || DEFAULT_PREVIEW_LIMIT);
  const scan = Math.max(PREVIEW_SCAN_MIN_CHARS, max * 8);
  const start = whole.search(/\S/);
  if (start < 0) return '空内容';
  const sourceTruncated = whole.length - start > scan;
  let text = whole;
  if (sourceTruncated) {
    text = whole.slice(start, start + scan);
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) text = text.slice(0, -1);
  }
  const normalized = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '空内容';
  const chars = Array.from(normalized);
  // 源文本被截断时结果一定以 ... 结尾,即使扫描窗口里的内容恰好不超过 limit。
  if (chars.length <= max) return sourceTruncated ? `${normalized}...` : normalized;
  return chars.slice(0, max).join('') + '...';
}

export function compactLineCount(value) {
  const text = textFromValue(value);
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

export function isInterjectionAbortNotice(content = '', metadata = null) {
  if (metadata && typeof metadata === 'object' && metadata.turn_interrupt === true) {
    return true;
  }
  return String(content || '').trim() === '[Interjected]';
}

export function labelForNonAssistantRole(role, content = '', metadata = null) {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'tool_call') return '工具调用';
  if (normalized === 'tool_result' || normalized === 'tool') return '工具返回';
  if (normalized === 'error') return '错误信息';
  if (isInterjectionAbortNotice(content, metadata)) return '插话中断';
  return '系统信息';
}

export function buildCompactMessagePreview({
  role = '',
  content = '',
  label = '',
  metadata = null,
} = {}) {
  const text = textFromValue(content);
  return {
    label: label || labelForNonAssistantRole(role, content, metadata),
    text,
    preview: compactOneLinePreview(text),
    lineCount: compactLineCount(text),
    charCount: Array.from(text).length,
  };
}
