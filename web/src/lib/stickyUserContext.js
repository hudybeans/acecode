const DEFAULT_TOP_OFFSET = 44;
const DEFAULT_SOURCE_VISIBLE_OFFSET = 8;
const DEFAULT_BOTTOM_THRESHOLD = 80;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function metricMapFrom(rowMetrics) {
  const map = new Map();
  if (!Array.isArray(rowMetrics)) return map;
  rowMetrics.forEach((metric) => {
    if (!metric || metric.id == null) return;
    const top = finiteNumber(metric.top, NaN);
    const bottom = finiteNumber(metric.bottom, NaN);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    map.set(String(metric.id), { top, bottom });
  });
  return map;
}

// 吸顶条只显示一两行,内容(连同 title / aria-label)最多取这么多字符。f300 那条
// 2400 万字符的消息曾被整段塞进吸顶条的 title 与 aria-label。
export const STICKY_USER_CONTEXT_MAX_CHARS = 600;

function boundedStickyContent(value) {
  const raw = String(value || '');
  const start = raw.search(/\S/);
  if (start < 0) return '';
  let text = raw.slice(start, start + STICKY_USER_CONTEXT_MAX_CHARS);
  const last = text.charCodeAt(text.length - 1);
  if (text.length === STICKY_USER_CONTEXT_MAX_CHARS && last >= 0xD800 && last <= 0xDBFF) text = text.slice(0, -1);
  return text.trimEnd();
}

export function sameStickyUserContext(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a.itemId || '') === String(b.itemId || '')
    && String(a.messageId || '') === String(b.messageId || '')
    && String(a.content || '') === String(b.content || '');
}

export function scrollTopForStickySourceRow({
  scrollTop = 0,
  containerTop = 0,
  rowTop = 0,
  topInset = 12,
} = {}) {
  return Math.max(
    0,
    finiteNumber(scrollTop)
      + finiteNumber(rowTop)
      - finiteNumber(containerTop)
      - Math.max(0, finiteNumber(topInset, 12)),
  );
}

export function findStickyUserContext({
  items = [],
  rowMetrics = [],
  scrollTop = 0,
  clientHeight = 0,
  scrollHeight = 0,
  topOffset = DEFAULT_TOP_OFFSET,
  sourceVisibleOffset = DEFAULT_SOURCE_VISIBLE_OFFSET,
  bottomThreshold = DEFAULT_BOTTOM_THRESHOLD,
} = {}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const viewportTop = Math.max(0, finiteNumber(scrollTop));
  const viewportHeight = Math.max(0, finiteNumber(clientHeight));
  const totalHeight = Math.max(0, finiteNumber(scrollHeight));
  const viewportBottom = viewportTop + viewportHeight;

  if (viewportHeight > 0 && totalHeight > 0 && totalHeight - viewportBottom <= bottomThreshold) {
    return null;
  }

  const metricsById = metricMapFrom(rowMetrics);
  const probeY = viewportTop + Math.max(0, finiteNumber(topOffset, DEFAULT_TOP_OFFSET));
  let active = null;

  for (const item of items) {
    if (!item || item.kind !== 'msg' || item.role !== 'user') continue;
    const metric = metricsById.get(String(item.id));
    if (!metric) continue;
    if (metric.top <= probeY) {
      active = { item, metric };
      continue;
    }
    break;
  }

  if (!active) return null;
  const content = boundedStickyContent(active.item.content);
  if (!content) return null;

  const sourceVisibleLine = viewportTop + Math.max(0, finiteNumber(sourceVisibleOffset, DEFAULT_SOURCE_VISIBLE_OFFSET));
  const sourceStillVisible = active.metric.bottom > sourceVisibleLine && active.metric.top < viewportBottom;
  if (sourceStillVisible) return null;

  return {
    itemId: active.item.id,
    messageId: active.item.messageId || '',
    content,
  };
}
