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

function assistant(id, content, extra = {}) {
  return { kind: 'msg', id, role: 'assistant', content, ts: id * 1000, ...extra };
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

function wrapper(id, role, content, extra = {}) {
  return { kind: 'msg', id, role, content, ts: id * 1000, ...extra };
}

const LIVE = { deferTrailingToolSummary: true, ensureLiveActivity: true, liveTurnId: 't1' };
const A = { title: 'Reading registry sections', source: 'prompt', batchId: '' };
const B = { title: 'Checking the expert loader', source: 'prompt', batchId: '' };

// 触发场景:实时回合里前一个工具(带前言 A)已跑完,当前工具(带前言 B)在跑。
// 期望行为:仍然只有一条 activity_summary(不按前言拆成多行 —— 这正是用户
// 反馈「一堆提示没折叠到一起」要修的),它的标题是正在运行那个工具的前言 B,
// 并带 preamble 字段供组件压过阶段文案 / 并行计数;id 与原来一致。
run('实时:正在运行工具的前言成为活动行标题,不按批次拆行', () => {
  const items = [user(1), tool(2, { preamble: A }), tool(3, { preamble: B, isDone: false })];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary']);
  assert.equal(out[1].live, true);
  assert.equal(out[1].id, 'activity:turn:t1:0');
  assert.equal(out[1].title, B.title);
  assert.deepEqual(out[1].preamble, B);
  assert.deepEqual(out[1].coveredItemIds, [2, 3]);
});

// 触发场景:工具都跑完了,模型正在想下一步(没有正在运行的工具)。
// 期望行为:活动行不再沿用上一步的前言(preamble 字段缺失,标题退回默认逻辑),
// 组件层因此会显示 agent_progress 的阶段文案而不是过时的前言。
run('实时:没有正在运行的工具时不沿用旧前言', () => {
  const items = [user(1), tool(2, { preamble: A })];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.equal(out[1].live, true);
  assert.equal(Object.prototype.hasOwnProperty.call(out[1], 'preamble'), false);
  assert.notEqual(out[1].title, A.title);
  assert.equal(__test__.liveToolPreamble([items[1]]), null);
});

// 触发场景:回合结束(末尾是最终 assistant 正文),两个工具各有自己的前言。
// 期望行为:外层「已处理 …」,展开后只有一条按工具统计的模板汇总,不按前言
// 拆成多组,也没有 preamble 字段 —— 落定后的记录与功能关闭时形态一致。
run('落定回合:已处理里只有一条模板汇总', () => {
  const items = [user(1), tool(2, { preamble: A }), tool(3, { preamble: B }), assistant(4, 'Done.')];
  const out = projectCollapsedTranscriptItems(items, { deferTrailingToolSummary: false });
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary', 'msg']);
  assert.equal(out[1].mode, 'processed');
  assert.ok(out[1].title.startsWith('已处理'), out[1].title);
  assert.equal(out[1].detailItems.length, 1);
  assert.equal(out[1].detailItems[0].title, __test__.summarizeToolItems([items[1], items[2]]));
  assert.equal(Object.prototype.hasOwnProperty.call(out[1].detailItems[0], 'preamble'), false);
});

// 触发场景:功能关闭 —— 没有任何条目带前言。
// 期望行为:投影与改动前完全一致:单条 activity_summary、模板汇总标题、无 preamble。
run('没有前言时投影保持原状', () => {
  const items = [user(1), tool(2), tool(3, { isDone: false })];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary']);
  assert.equal(out[1].id, 'activity:turn:t1:0');
  assert.equal(Object.prototype.hasOwnProperty.call(out[1], 'preamble'), false);
  assert.equal(out[1].live, true);
});

// 触发场景:参数模式的历史 —— tool_call 包装消息带 metadata.tool_preamble.calls
// ({tool_call_id: 前言}),结果消息是 legacy 文本(没归并成结构化工具项)。
// 期望行为:preambleOfItem 按包装项自己的 tool_call_id 从 calls 取前言;归并出的
// legacy 工具项各带各的前言,不会串。
run('历史:tool_call 包装按自己的 id 取逐调用前言', () => {
  const calls = { c1: 'Listing files', c2: 'Reading config' };
  const items = [
    user(1),
    wrapper(2, 'tool_call', '[Tool: bash] {"cmd":"ls"}', {
      toolCallId: 'c1',
      metadata: { tool_call_id: 'c1', tool_preamble: { source: 'prompt', calls } },
    }),
    wrapper(3, 'tool_call', '[Tool: file_read] {"file_path":"cfg"}', {
      toolCallId: 'c2',
      metadata: { tool_call_id: 'c2', tool_preamble: { source: 'prompt', calls } },
    }),
    wrapper(4, 'tool', 'ok', { toolCallId: 'c1', metadata: { tool_call_id: 'c1' } }),
    wrapper(5, 'tool', 'cfg', { toolCallId: 'c2', metadata: { tool_call_id: 'c2' } }),
  ];
  assert.equal(__test__.preambleOfItem(items[1]).title, 'Listing files');
  assert.equal(__test__.preambleOfItem(items[2]).title, 'Reading config');
  const legacy = __test__.normalizeToolInvocationItems(items).filter((item) => item.kind === 'tool');
  assert.equal(legacy.length, 2);
  assert.deepEqual(legacy.map((item) => __test__.preambleOfItem(item)?.title), ['Listing files', 'Reading config']);
});

// 触发场景:批次标题模式(reasoning / sidecar)的老会话历史,包装 metadata 只有 title。
// 期望行为:归并后的 legacy 工具项沿用批次标题。
run('历史:批次标题模式的 legacy 包装沿用标题', () => {
  const items = [
    user(1),
    wrapper(2, 'tool_call', '[Tool: bash] {"cmd":"ls"}', {
      toolCallId: 'c1',
      metadata: { tool_call_id: 'c1', tool_preamble: { title: 'Listing files', source: 'reasoning', batch_id: 'c1' } },
    }),
    wrapper(3, 'tool', 'ok', { toolCallId: 'c1', metadata: { tool_call_id: 'c1' } }),
  ];
  const legacy = __test__.normalizeToolInvocationItems(items).find((item) => item.kind === 'tool');
  assert.ok(legacy);
  assert.deepEqual(__test__.preambleOfItem(legacy), { title: 'Listing files', source: 'reasoning', batchId: 'c1' });
});
