import assert from 'node:assert/strict';
import {
  DEFAULT_TOOL_PREAMBLE_STATE,
  buildToolPreambleUpdate,
  normalizeToolPreambleState,
  preambleFromProgress,
  preambleFromToolStart,
  stripTextPreambleTags,
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

// 触发场景:GET /api/config/tool-preamble 的响应(新 daemon 只回 {enabled},旧 daemon
// 还带 mode / modes / sidecar_*)。期望行为:只保留 enabled,类型不对按关闭;默认关闭。
run('normalizeToolPreambleState:只认 enabled', () => {
  assert.deepEqual(DEFAULT_TOOL_PREAMBLE_STATE, { enabled: false });
  assert.deepEqual(normalizeToolPreambleState(null), { enabled: false });
  assert.deepEqual(normalizeToolPreambleState({ enabled: 'yes' }), { enabled: false });
  assert.deepEqual(
    normalizeToolPreambleState({ enabled: true, mode: 'sidecar', modes: ['prompt'], sidecar_model: 'fast' }),
    { enabled: true },
  );
});

// 触发场景:工作模式切换发 PUT。期望行为:patch 语义,只带 enabled;其它键(包括旧
// 的 mode)不带出;空草稿得到空对象。
run('buildToolPreambleUpdate 只带 enabled', () => {
  assert.deepEqual(buildToolPreambleUpdate({ enabled: true }), { enabled: true });
  assert.deepEqual(buildToolPreambleUpdate({ enabled: 0 }), { enabled: false });
  assert.deepEqual(buildToolPreambleUpdate({ mode: 'reasoning' }), {});
  assert.deepEqual(buildToolPreambleUpdate(), {});
});

// 触发场景:tool_start / agent_progress 带 daemon 生成的文案字段(source 是 reasoning /
// template / context)。期望行为:归一化成 {title, source, kind};kind 只认 read / write
// (大小写不敏感),其它当空;没有标题返回 null。
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
// (前一版要求模型打标签,落盘正文保留了原文)。期望行为:标签整段去掉,标签后紧跟的空行也去掉;
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
