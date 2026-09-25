import assert from 'node:assert/strict';
import {
  DEFAULT_TOOL_PREAMBLE_STATE,
  TOOL_PREAMBLE_MODES,
  buildToolPreambleUpdate,
  normalizeToolPreambleState,
  preambleFromProgress,
  preambleFromToolStart,
  stripTextPreambleTags,
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

// 触发场景:设置页渲染二选一。
// 期望行为:顺序固定为 提示驱动 / 推理服务内置摘要(默认选第一项),每项都带标签、
// 一句摘要和圈圈问号的详细说明;提示驱动的说明写的是 <text_preamble> 标签,不再
// 提「参数」;默认状态是关闭 + prompt。旁路模型摘要已被砍掉。
run('二选一的顺序、文案与默认值', () => {
  assert.deepEqual(TOOL_PREAMBLE_MODES.map((entry) => entry.id), ['prompt', 'reasoning']);
  for (const entry of TOOL_PREAMBLE_MODES) {
    assert.ok(entry.label.length > 0, entry.id);
    assert.ok(entry.summary.length > 0, entry.id);
    assert.ok(entry.help.length > 40, entry.id);
  }
  assert.ok(TOOL_PREAMBLE_MODES[0].help.includes('text_preamble'));
  assert.ok(!TOOL_PREAMBLE_MODES[0].help.includes('参数'));
  assert.deepEqual(DEFAULT_TOOL_PREAMBLE_STATE, { enabled: false, mode: 'prompt' });
});

// 触发场景:GET 响应字段缺失 / 类型不对 / 旧版本还带 sidecar 字段。
// 期望行为:退回默认值;非法 mode(含已废弃的 sidecar)退回 prompt;多余字段丢弃。
run('normalizeToolPreambleState:缺省、非法与旧字段', () => {
  assert.deepEqual(normalizeToolPreambleState(null), { enabled: false, mode: 'prompt' });
  assert.deepEqual(normalizeToolPreambleState({ enabled: 'yes', mode: 'auto' }), { enabled: false, mode: 'prompt' });
  assert.deepEqual(
    normalizeToolPreambleState({ enabled: true, mode: 'sidecar', sidecar_model: 'fast', sidecar_wait_ms: 500 }),
    { enabled: true, mode: 'prompt' },
  );
  assert.deepEqual(normalizeToolPreambleState({ enabled: true, mode: 'reasoning' }), { enabled: true, mode: 'reasoning' });
});

// 触发场景:组件只改了部分字段。期望行为:PUT body 只带出现的键(patch 语义),
// 非法 mode 不带出;行卡片状态文案关闭时是「未启用」,开启时是模式名。
run('buildToolPreambleUpdate 与状态文案', () => {
  assert.deepEqual(buildToolPreambleUpdate({ enabled: true }), { enabled: true });
  assert.deepEqual(buildToolPreambleUpdate({ mode: 'reasoning' }), { mode: 'reasoning' });
  assert.deepEqual(buildToolPreambleUpdate({ mode: 'sidecar' }), {});
  assert.equal(toolPreambleStatusText({ enabled: false, mode: 'prompt' }), '未启用');
  assert.equal(toolPreambleStatusText({ enabled: true, mode: 'prompt' }), '提示驱动');
  assert.equal(toolPreambleStatusText({ enabled: true, mode: 'reasoning' }), '推理服务内置摘要');
});

// 触发场景:tool_start / agent_progress 带前言字段。期望行为:归一化成 {title, source,
// kind};kind 只认 read / write(大小写不敏感),其它当空;没有标题返回 null。
run('preambleFromToolStart / preambleFromProgress', () => {
  assert.deepEqual(
    preambleFromToolStart({ preamble: ' Reading the loader ', preamble_source: 'prompt', preamble_kind: 'READ' }),
    { title: 'Reading the loader', source: 'prompt', kind: 'read' },
  );
  assert.deepEqual(
    preambleFromToolStart({ preamble: 'x', preamble_source: 'reasoning', preamble_kind: 'verify' }),
    { title: 'x', source: 'reasoning', kind: '' },
  );
  assert.equal(preambleFromToolStart({ preamble: '   ' }), null);
  assert.equal(preambleFromToolStart({}), null);
  assert.deepEqual(
    preambleFromProgress({ phase: 'preamble', label: 'x', preamble: { title: 'Editing', source: 'prompt', kind: 'write' } }),
    { title: 'Editing', source: 'prompt', kind: 'write' },
  );
  assert.equal(preambleFromProgress({ phase: 'reasoning', label: '正在推理' }), null);
});

// 触发场景:历史消息 / message 事件里的 assistant 正文带 <text_preamble> 标签
// (落盘正文保留原文,是有意的)。期望行为:标签整段去掉,标签后紧跟的空行也去掉;
// 没写 type、缺闭合(到行尾)、自闭合、孤立闭合标签、大小写都按 daemon 同款规则处理;
// 没有标签的文本逐字节原样返回(含前导空白)。
run('stripTextPreambleTags 与 daemon 同款规则', () => {
  assert.equal(stripTextPreambleTags('  plain\ntext '), '  plain\ntext ');
  assert.equal(stripTextPreambleTags(''), '');
  assert.equal(stripTextPreambleTags(null), '');
  assert.equal(
    stripTextPreambleTags('<text_preamble type="read">Reading A</text_preamble>\n\nFirst.\n\n<text_preamble type="write">Editing B</text_preamble>\n\nSecond.'),
    'First.\n\nSecond.',
  );
  assert.equal(stripTextPreambleTags('<text_preamble type="read">Reading A</text_preamble>\n\n'), '');
  assert.equal(stripTextPreambleTags('<text_preamble>No close\nVisible'), 'Visible');
  assert.equal(stripTextPreambleTags('<text_preamble>Reading A\n</text_preamble>\n\nText'), 'Text');
  assert.equal(stripTextPreambleTags('<text_preamble/>\nHi'), 'Hi');
  assert.equal(stripTextPreambleTags('<TEXT_PREAMBLE Type="READ">x</TEXT_PREAMBLE>\nHi'), 'Hi');
  assert.equal(stripTextPreambleTags('a < b, <textarea>x</textarea>, <text_preambleX>y'), 'a < b, <textarea>x</textarea>, <text_preambleX>y');
});
