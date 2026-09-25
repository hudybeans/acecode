// 工具前言(openspec add-tool-preamble)的纯逻辑:设置页的二选一定义与状态
// 规整、REST 往返的字段映射、<text_preamble> 标签的渲染层剥离、tool_start /
// agent_progress 里前言字段的归一化。组件(ToolPreambleSettings.jsx)与 reducer /
// 投影只做映射,不在这里之外再解释一遍字段含义。

export const TOOL_PREAMBLE_MODE_PROMPT = 'prompt';
export const TOOL_PREAMBLE_MODE_REASONING = 'reasoning';

// 二选一的顺序就是设置页的展示顺序,默认选第一项(提示驱动)。
export const TOOL_PREAMBLE_MODES = Object.freeze([
  Object.freeze({
    id: TOOL_PREAMBLE_MODE_PROMPT,
    label: '提示驱动',
    summary: '让模型在多步工具任务里用 <text_preamble> 标签写一句「正在做什么」。',
    help: '在系统提示里要求模型在第一次工具调用前、以及阶段或计划变化时，用 <text_preamble type="read|write">…</text_preamble> 标出一句话：一开始写下一步要做什么，之后写已核实的结果加下一步；最终回答不打标签。标签一闭合这句话就进入活动行的 loading 文案，直到下一句前言或普通正文出现；标签本身不显示为正文，完成后的记录里也看不到它。不依赖模型服务的特殊能力、不额外发请求，每个阶段只多一句话的 token。',
  }),
  Object.freeze({
    id: TOOL_PREAMBLE_MODE_REASONING,
    label: '推理服务内置摘要',
    summary: '从模型服务返回的推理摘要里取标题，不改提示词、不多发请求。',
    help: '不改提示词、不多发请求。模型服务流式返回的推理摘要若以加粗标题开头（OpenAI Responses、Codex、Gemini 的摘要都是这种格式），就抠出那行标题；在推理进行中标题就会出现在活动行上。没有加粗标题时取推理的第一句话兜底。只返回原始思维链或散文摘要的模型（如 DeepSeek、Claude）标题质量会差一些；完全不返回推理内容的模型不会出标题，活动行退回默认文案。',
  }),
]);

export function isToolPreambleMode(mode) {
  return TOOL_PREAMBLE_MODES.some((entry) => entry.id === mode);
}

export function toolPreambleModeLabel(mode) {
  const entry = TOOL_PREAMBLE_MODES.find((candidate) => candidate.id === mode);
  return entry ? entry.label : '';
}

export const DEFAULT_TOOL_PREAMBLE_STATE = Object.freeze({
  enabled: false,
  mode: TOOL_PREAMBLE_MODE_PROMPT,
});

// GET /api/config/tool-preamble 的响应 → 组件状态。字段缺失 / 类型不对一律
// 退回默认值,非法 mode(含旧的 sidecar)退回 prompt(与 daemon 的归一化口径一致)。
export function normalizeToolPreambleState(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    enabled: source.enabled === true,
    mode: isToolPreambleMode(source.mode) ? source.mode : TOOL_PREAMBLE_MODE_PROMPT,
  };
}

// 组件草稿 → PUT body(patch 语义:只带出现的键)。
export function buildToolPreambleUpdate(patch = {}) {
  const body = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) body.enabled = patch.enabled === true;
  if (Object.prototype.hasOwnProperty.call(patch, 'mode') && isToolPreambleMode(patch.mode)) {
    body.mode = patch.mode;
  }
  return body;
}

// 行卡片右侧的状态文案:关闭 → 「未启用」;开启 → 当前模式名。
export function toolPreambleStatusText(state) {
  if (!state || state.enabled !== true) return '未启用';
  return toolPreambleModeLabel(state.mode) || state.mode;
}

// tool_start.preamble(+ preamble_source / preamble_kind)与 agent_progress.preamble
// 的归一化结构:{title, source, kind};没有标题返回 null。kind 只透传(read /
// write / ''),界面上的读放大镜 / 写笔触效果留给以后接。
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
// 历史消息与 message 事件里的 assistant 正文都要过这一遍;token 流由 daemon
// 剥过,不必再剥。
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
