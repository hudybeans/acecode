// 具体进度提示(openspec add-tool-preamble;设置 > 常规 > 工作模式 > 适合日常工作)的
// 纯逻辑:REST 往返的字段映射、tool_start / agent_progress 里文案字段的归一化、历史里
// 残留的 <text_preamble> 标签的渲染层剥离。工作模式与开关的映射在 workMode.js。
// 文案全部由 daemon 生成(推理加粗标题 > 工具现在进行时模板 > 场景文案),不再要求
// 模型额外输出任何东西。

export const DEFAULT_TOOL_PREAMBLE_STATE = Object.freeze({ enabled: false });

// GET /api/config/tool-preamble 的响应 → 状态。字段缺失 / 类型不对按关闭处理;
// 旧版本还会带 mode / modes / sidecar_*,一律丢弃。
export function normalizeToolPreambleState(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return { enabled: source.enabled === true };
}

// 草稿 → PUT body(patch 语义:只带出现的键)。
export function buildToolPreambleUpdate(patch = {}) {
  const body = {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
    body.enabled = patch.enabled === true;
  }
  return body;
}

// tool_start.preamble(+ preamble_source / preamble_kind)与 agent_progress.preamble
// 的归一化结构:{title, source, kind};没有标题返回 null。source 是 reasoning /
// template / context;kind 只透传(read / write / ''),界面上的读放大镜 / 写笔触效果
// 留给以后接。
export function normalizeToolPreamble(title, source = '', kind = '') {
  const text = String(title || '').trim();
  if (!text) return null;
  const kindText = String(kind || '').trim().toLowerCase();
  return {
    title: text,
    source: String(source || '').trim(),
    kind: kindText === 'read' || kindText === 'write' ? kindText : '',
  };
}

export function preambleFromToolStart(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return normalizeToolPreamble(source.preamble, source.preamble_source, source.preamble_kind);
}

export function preambleFromProgress(payload) {
  const entry = payload && typeof payload === 'object' ? payload.preamble : null;
  if (!entry || typeof entry !== 'object') return null;
  return normalizeToolPreamble(entry.title, entry.source, entry.kind);
}

const OPEN_TAG_RE = /<text_preamble(?=[\s>/])[^>]*>/i;
const CLOSE_TAG_RE = /<\/text_preamble>/i;
const STRAY_CLOSE_RE = /^\s*<\/text_preamble>/i;

// 渲染层剥标签(与 daemon 的 tool_preamble::strip_text_preamble_tags 同款规则):
//   - <text_preamble …>…</text_preamble> 整段去掉;
//   - 没写 type 也认;闭合标签缺失时正文到行尾为止;`<text_preamble/>` 空标签
//     直接跳过;标签名大小写不敏感;标签外孤立的 </text_preamble> 丢掉;
//   - 文本开头与每个标签之后紧跟的空白(通常是 "\n\n")一并吞掉,免得为一段
//     空白建一条空气泡。
// 前一版要求模型打这个标签,历史消息与 message 事件里的 assistant 正文可能还带着,
// 都要过这一遍;token 流由 daemon 剥过,不必再剥。
export function stripTextPreambleTags(text) {
  const source = typeof text === 'string' ? text : (text == null ? '' : String(text));
  if (!source) return '';
  if (!/<\/?text_preamble/i.test(source)) return source;
  let rest = source;
  let out = '';
  let swallow = true;
  const emit = (chunk) => {
    if (!chunk) return;
    if (swallow) {
      const trimmed = chunk.replace(/^\s+/, '');
      if (!trimmed) return;
      swallow = false;
      out += trimmed;
      return;
    }
    out += chunk;
  };
  while (rest) {
    const stray = STRAY_CLOSE_RE.exec(rest);
    if (stray) {
      rest = rest.slice(stray[0].length);
      swallow = true;
      continue;
    }
    const open = OPEN_TAG_RE.exec(rest);
    if (!open) {
      emit(rest);
      break;
    }
    emit(rest.slice(0, open.index));
    const body = rest.slice(open.index + open[0].length);
    swallow = true;
    if (open[0].endsWith('/>')) {
      rest = body;
      continue;
    }
    const close = CLOSE_TAG_RE.exec(body);
    if (close) {
      rest = body.slice(close.index + close[0].length);
      continue;
    }
    const firstVisible = body.search(/\S/);
    const newline = firstVisible >= 0 ? body.indexOf('\n', firstVisible) : -1;
    if (newline >= 0) {
      rest = body.slice(newline + 1);
      continue;
    }
    rest = '';
  }
  return out;
}
