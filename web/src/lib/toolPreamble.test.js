import assert from 'node:assert/strict';
import {
  DEFAULT_TOOL_PREAMBLE_STATE,
  TOOL_PREAMBLE_MODES,
  buildToolPreambleUpdate,
  clampSidecarWaitMs,
  normalizeToolPreambleEvent,
  normalizeToolPreambleState,
  toolPreambleFromMetadata,
  toolPreambleStatusText,
} from './toolPreamble.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// 触发场景:设置页渲染三选一。
// 期望行为:顺序固定为 提示驱动 / 推理服务内置摘要 / 旁路模型摘要(默认选第一项),
// 每项都带标签、一句摘要和圈圈问号的详细说明;默认状态是关闭 + prompt。
run('三选一的顺序、文案与默认值', () => {
  assert.deepEqual(TOOL_PREAMBLE_MODES.map((entry) => entry.id), ['prompt', 'reasoning', 'sidecar']);
  for (const entry of TOOL_PREAMBLE_MODES) {
    assert.ok(entry.label.length > 0, entry.id);
    assert.ok(entry.summary.length > 0, entry.id);
    assert.ok(entry.help.length > 40, `${entry.id} 的说明要足够详细`);
  }
  assert.equal(DEFAULT_TOOL_PREAMBLE_STATE.enabled, false);
  assert.equal(DEFAULT_TOOL_PREAMBLE_STATE.mode, 'prompt');
});

// 触发场景:GET /api/config/tool-preamble 返回完整 / 残缺 / 非法的响应。
// 期望行为:完整响应逐字段映射;非法 mode 退回 prompt;sidecar_model 不在
// saved_models 里时清空(下拉框不会出现选不到的值);sidecar_wait_ms 越界被 clamp;
// 空响应退回默认。
run('normalizeToolPreambleState 映射与兜底', () => {
  const full = normalizeToolPreambleState({
    enabled: true, mode: 'sidecar', sidecar_model: 'fast', sidecar_wait_ms: 800,
    saved_models: ['main', 'fast'],
  });
  assert.deepEqual(full, {
    enabled: true, mode: 'sidecar', sidecarModel: 'fast', sidecarWaitMs: 800, savedModels: ['main', 'fast'],
  });

  const odd = normalizeToolPreambleState({
    enabled: 'true', mode: 'auto', sidecar_model: 'missing', sidecar_wait_ms: 99999, saved_models: ['main'],
  });
  assert.deepEqual(odd, {
    enabled: false, mode: 'prompt', sidecarModel: '', sidecarWaitMs: 15000, savedModels: ['main'],
  });

  assert.deepEqual(normalizeToolPreambleState(null), {
    enabled: false, mode: 'prompt', sidecarModel: '', sidecarWaitMs: 2000, savedModels: [],
  });
});

// 触发场景:组件只改了一个字段就保存。
// 期望行为:PUT body 只带出现的键(patch 语义);非法 mode 被丢弃而不是发给后端;
// sidecar 字段规整(去空白、clamp)。
run('buildToolPreambleUpdate 只带出现的键', () => {
  assert.deepEqual(buildToolPreambleUpdate({ enabled: true }), { enabled: true });
  assert.deepEqual(buildToolPreambleUpdate({ mode: 'bogus' }), {});
  assert.deepEqual(
    buildToolPreambleUpdate({ mode: 'sidecar', sidecarModel: ' fast ', sidecarWaitMs: '99999' }),
    { mode: 'sidecar', sidecar_model: 'fast', sidecar_wait_ms: 15000 },
  );
  assert.equal(clampSidecarWaitMs(-5), 0);
  assert.equal(clampSidecarWaitMs('abc'), 2000);
});

// 触发场景:行卡片右侧的「当前:…」文案。
// 期望行为:关闭 → 未启用;开启显示模式名;旁路模式附模型名或「沿用会话模型」。
run('toolPreambleStatusText', () => {
  assert.equal(toolPreambleStatusText({ enabled: false, mode: 'sidecar' }), '未启用');
  assert.equal(toolPreambleStatusText({ enabled: true, mode: 'reasoning' }), '推理服务内置摘要');
  assert.equal(toolPreambleStatusText({ enabled: true, mode: 'sidecar', sidecarModel: 'fast' }), '旁路模型摘要 · fast');
  assert.equal(toolPreambleStatusText({ enabled: true, mode: 'sidecar', sidecarModel: '' }), '旁路模型摘要 · 沿用会话模型');
});

// 触发场景:daemon 的 tool_preamble 事件 payload。
// 期望行为:标题与 id 齐全时归一化(batch_id 缺省取第一个 id);缺标题或缺 id 视为无效。
run('normalizeToolPreambleEvent', () => {
  assert.deepEqual(
    normalizeToolPreambleEvent({ title: ' Reading registry sections ', source: 'reasoning', tool_call_ids: ['c1', 'c2'], late: false }),
    { title: 'Reading registry sections', source: 'reasoning', batchId: 'c1', ids: ['c1', 'c2'], late: false },
  );
  assert.equal(normalizeToolPreambleEvent({ title: 'x', source: 'sidecar', batch_id: 'c9', tool_call_ids: ['c9'], late: true }).late, true);
  assert.equal(normalizeToolPreambleEvent({ title: '', tool_call_ids: ['c1'] }), null);
  assert.equal(normalizeToolPreambleEvent({ title: 'x', tool_call_ids: [] }), null);
  assert.equal(normalizeToolPreambleEvent(null), null);
});

// 触发场景:REST 历史里的 assistant 消息 metadata。
// 期望行为:批次标题 title 或逐调用 calls 任一存在就返回结构(calls 里的空值被剔除);
// batchId 优先取调用方传入的第一个 tool_call_id,否则取 metadata 里的 batch_id;
// 两者都没有则 null。
run('toolPreambleFromMetadata', () => {
  assert.deepEqual(
    toolPreambleFromMetadata({ tool_preamble: { title: 'Checking loader', source: 'reasoning' } }, 'c1'),
    { title: 'Checking loader', source: 'reasoning', batchId: 'c1', calls: {} },
  );
  assert.deepEqual(
    toolPreambleFromMetadata({ tool_preamble: { source: 'prompt', calls: { c1: ' Listing files ', c2: '' } } }),
    { title: '', source: 'prompt', batchId: '', calls: { c1: 'Listing files' } },
  );
  assert.equal(toolPreambleFromMetadata({ tool_preamble: { title: 'x', batch_id: 'c7' } }).batchId, 'c7');
  assert.equal(toolPreambleFromMetadata({ tool_preamble: { title: '', calls: {} } }), null);
  assert.equal(toolPreambleFromMetadata({}), null);
  assert.equal(toolPreambleFromMetadata(null), null);
});
