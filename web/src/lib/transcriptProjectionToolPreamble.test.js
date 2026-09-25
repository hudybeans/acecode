import assert from 'node:assert/strict';
import { __test__, projectCollapsedTranscriptItems } from './transcriptProjection.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function user(id, content = 'do work') {
  return { kind: 'msg', id, role: 'user', content, ts: id * 1000, messageId: `u-${id}` };
}

function tool(id, { name = 'file_read', object = `file-${id}.txt`, isDone = true, preamble = null, toolCallId = `call-${id}` } = {}) {
  return {
    kind: 'tool',
    id,
    ts: id * 1000,
    tool: {
      isDone,
      success: true,
      tool: name,
      toolCallId,
      summary: { verb: 'Read', object, metrics: [] },
      output: '',
      hunks: [],
      ...(preamble ? { preamble } : {}),
    },
  };
}

const LIVE = { deferTrailingToolSummary: true, ensureLiveActivity: true, liveTurnId: 't1' };
const SETTLED = { deferTrailingToolSummary: false };

// 触发场景:实时回合里前一个工具(前言 A)已完成、当前工具(前言 B)在跑。
// 期望行为:仍只有一行 activity_summary(不按前言拆组 —— 拆成一摞标题行是被用户
// 否掉的那版),标题是正在运行的工具的前言 B,kind 随之透传。
run('实时行标题 = 正在运行工具的前言,不拆组', () => {
  const items = [
    user(1),
    tool(2, { preamble: { title: 'Phase A', source: 'prompt', kind: 'read' } }),
    tool(3, { isDone: false, preamble: { title: 'Phase B', source: 'prompt', kind: 'write' } }),
  ];
  const projected = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(projected.map((item) => item.kind), ['msg', 'activity_summary']);
  assert.equal(projected[1].title, 'Phase B');
  assert.deepEqual(projected[1].preamble, { title: 'Phase B', source: 'prompt', kind: 'write' });
  assert.equal(projected[1].collapsedItems.length, 2);
});

// 触发场景:工具都跑完了,模型在想下一步(实时行仍在)。
// 期望行为:不沿用旧前言 —— 标题退回按工具统计的模板 / 阶段文案,preamble 字段不出现。
run('工具都完成后不沿用旧前言', () => {
  const items = [
    user(1),
    tool(2, { preamble: { title: 'Phase A', source: 'prompt', kind: 'read' } }),
  ];
  const projected = projectCollapsedTranscriptItems(items, LIVE);
  assert.equal(projected[1].kind, 'activity_summary');
  assert.notEqual(projected[1].title, 'Phase A');
  assert.equal(projected[1].preamble, undefined);
});

// 触发场景:回合落定后(非实时)投影带前言的工具项。
// 期望行为:与没有前言时逐项一致 —— 落定后的记录不显示前言(用户决定)。
run('落定后的投影与无前言时一致', () => {
  const withPreamble = [
    user(1),
    tool(2, { preamble: { title: 'Phase A', source: 'prompt', kind: 'read' } }),
    tool(3, { preamble: { title: 'Phase A', source: 'prompt', kind: 'read' } }),
  ];
  const without = [user(1), tool(2), tool(3)];
  const a = projectCollapsedTranscriptItems(withPreamble, SETTLED);
  const b = projectCollapsedTranscriptItems(without, SETTLED);
  assert.deepEqual(a.map((item) => [item.kind, item.title]), b.map((item) => [item.kind, item.title]));
  for (const item of a) assert.equal(item.preamble, undefined);
});

// 触发场景:preambleOfItem / liveToolPreamble 的边界 —— 非工具项、空标题、
// 没有 kind。期望行为:非工具项与空标题返回 null;kind 缺省为空串;实时前言取
// 最后一个正在运行且带前言的工具。
run('preambleOfItem / liveToolPreamble 边界', () => {
  const { preambleOfItem, liveToolPreamble } = __test__;
  assert.equal(preambleOfItem(user(1)), null);
  assert.equal(preambleOfItem(tool(2, { preamble: { title: '   ' } })), null);
  assert.deepEqual(preambleOfItem(tool(2, { preamble: { title: 'X', source: 'reasoning' } })),
    { title: 'X', source: 'reasoning', kind: '' });
  const items = [
    tool(1, { isDone: false, preamble: { title: 'first', source: 'prompt', kind: 'read' } }),
    tool(2, { isDone: false }),
    tool(3, { isDone: true, preamble: { title: 'done one', source: 'prompt', kind: 'read' } }),
  ];
  assert.equal(liveToolPreamble(items).title, 'first');
  assert.equal(liveToolPreamble([tool(4)]), null);
});
