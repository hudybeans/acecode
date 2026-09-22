// 工具前言(openspec add-tool-preamble)的纯逻辑:设置页的三选一定义与状态
// 规整、REST 往返的字段映射、tool_preamble 事件 / 消息 metadata 的归一化。
// 组件(ToolPreambleSettings.jsx)与 reducer / 投影只做映射,不在这里之外
// 再解释一遍字段含义。

export const TOOL_PREAMBLE_MODE_PROMPT = 'prompt';
export const TOOL_PREAMBLE_MODE_REASONING = 'reasoning';
export const TOOL_PREAMBLE_MODE_SIDECAR = 'sidecar';

export const TOOL_PREAMBLE_SIDECAR_WAIT_MIN_MS = 0;
export const TOOL_PREAMBLE_SIDECAR_WAIT_MAX_MS = 15000;
export const TOOL_PREAMBLE_SIDECAR_WAIT_DEFAULT_MS = 2000;

// 三选一的顺序就是设置页的展示顺序,默认选第一项(提示驱动)。
export const TOOL_PREAMBLE_MODES = Object.freeze([
  Object.freeze({
    id: TOOL_PREAMBLE_MODE_PROMPT,
    label: '提示驱动',
    summary: '让模型在每批工具调用前先写一句前言，作为该批次的标题。',
    help: '在系统提示里要求模型：每条包含工具调用的消息都先写一句 8～12 个词的前言（例如「正在读取注册表段落」），再发出工具调用。这句话直接作为该批次的标题显示，不再以普通气泡出现。不依赖模型服务的特殊能力，也不额外发请求，每批只多几十个输出 token；效果取决于模型遵循指令的能力，较弱的模型可能写得啰嗦或漏写，此时该批次退回按工具统计的默认汇总。',
  }),
  Object.freeze({
    id: TOOL_PREAMBLE_MODE_REASONING,
    label: '推理服务内置摘要',
    summary: '从模型服务返回的推理摘要里取标题，不改提示词、不多发请求。',
    help: '不改提示词、不多发请求。模型服务流式返回的推理摘要若以加粗标题开头（OpenAI Responses、Codex、Gemini 的摘要都是这种格式），就抠出那行标题；在推理进行中标题就会出现在活动行上。没有加粗标题时取推理的第一句话兜底。只返回原始思维链或散文摘要的模型（如 DeepSeek、Claude）标题质量会差一些；完全不返回推理内容的模型不会出标题，该批次退回默认汇总。',
  }),
  Object.freeze({
    id: TOOL_PREAMBLE_MODE_SIDECAR,
    label: '旁路模型摘要',
    summary: '另发一次小请求，让旁路模型为每批工具调用起 3～8 个词的标题。',
    help: '每批工具调用开始时，把用户请求、模型当前正文和即将执行的工具调用另发一次小请求给旁路模型（默认沿用会话模型，也可以指定更便宜的模型），让它给出 3～8 个词的标签。任何模型都能用、标题最贴切；代价是每个批次多一次小请求的费用，并且落盘前最多等待设定的毫秒数，超时才到的标题只在当前页面显示、不写入会话记录。',
  }),
]);

export function isToolPreambleMode(mode) {
  return TOOL_PREAMBLE_MODES.some((entry) => entry.id === mode);
}

export function toolPreambleModeLabel(mode) {
  const entry = TOOL_PREAMBLE_MODES.find((candidate) => candidate.id === mode);
  return entry ? entry.label : '';
}

export function clampSidecarWaitMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return TOOL_PREAMBLE_SIDECAR_WAIT_DEFAULT_MS;
  return Math.min(TOOL_PREAMBLE_SIDECAR_WAIT_MAX_MS,
    Math.max(TOOL_PREAMBLE_SIDECAR_WAIT_MIN_MS, Math.round(n)));
}

export const DEFAULT_TOOL_PREAMBLE_STATE = Object.freeze({
  enabled: false,
  mode: TOOL_PREAMBLE_MODE_PROMPT,
  sidecarModel: '',
  sidecarWaitMs: TOOL_PREAMBLE_SIDECAR_WAIT_DEFAULT_MS,
  savedModels: Object.freeze([]),
});

// GET /api/config/tool-preamble 的响应 → 组件状态。字段缺失 / 类型不对一律
// 退回默认值,非法 mode 退回 prompt(与 daemon 的归一化口径一致)。
export function normalizeToolPreambleState(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const mode = isToolPreambleMode(source.mode) ? source.mode : TOOL_PREAMBLE_MODE_PROMPT;
  const savedModels = Array.isArray(source.saved_models)
    ? source.saved_models.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const sidecarModel = typeof source.sidecar_model === 'string' ? source.sidecar_model.trim() : '';
  return {
    enabled: source.enabled === true,
    mode,
    sidecarModel: savedModels.includes(sidecarModel) ? sidecarModel : '',
    sidecarWaitMs: clampSidecarWaitMs(
      source.sidecar_wait_ms ?? TOOL_PREAMBLE_SIDECAR_WAIT_DEFAULT_MS,
    ),
    savedModels,
  };
}

// 组件草稿 → PUT body(patch 语义:只带出现的键)。
export function buildToolPreambleUpdate(patch = {}) {
  const body = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) body.enabled = patch.enabled === true;
  if (Object.prototype.hasOwnProperty.call(patch, 'mode') && isToolPreambleMode(patch.mode)) {
    body.mode = patch.mode;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sidecarModel')) {
    body.sidecar_model = String(patch.sidecarModel || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sidecarWaitMs')) {
    body.sidecar_wait_ms = clampSidecarWaitMs(patch.sidecarWaitMs);
  }
  return body;
}

// 行卡片右侧的状态文案:关闭 → 「未启用」;开启 → 当前模式名(旁路模式附模型)。
export function toolPreambleStatusText(state) {
  if (!state || state.enabled !== true) return '未启用';
  const label = toolPreambleModeLabel(state.mode) || state.mode;
  if (state.mode === TOOL_PREAMBLE_MODE_SIDECAR) {
    return `${label} · ${state.sidecarModel || '沿用会话模型'}`;
  }
  return label;
}

// tool_preamble 事件 payload → reducer 用的归一化结构;缺标题 / 缺 id 视为无效。
export function normalizeToolPreambleEvent(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const title = String(source.title || '').trim();
  const ids = Array.isArray(source.tool_call_ids)
    ? source.tool_call_ids.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!title || ids.length === 0) return null;
  const batchId = String(source.batch_id || ids[0]).trim() || ids[0];
  return {
    title,
    source: String(source.source || '').trim(),
    batchId,
    ids,
    late: source.late === true,
  };
}

// assistant 消息 metadata.tool_preamble → 挂在同批次工具项上的结构。
export function toolPreambleFromMetadata(metadata, batchId = '') {
  const entry = metadata && typeof metadata === 'object' ? metadata.tool_preamble : null;
  if (!entry || typeof entry !== 'object') return null;
  const title = String(entry.title || '').trim();
  if (!title) return null;
  return {
    title,
    source: String(entry.source || '').trim(),
    batchId: String(batchId || entry.batch_id || entry.batchId || '').trim(),
  };
}
