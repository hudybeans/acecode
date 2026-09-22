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
const A = { title: 'Reading registry sections', source: 'reasoning', batchId: 'call-2' };
const B = { title: 'Checking the expert loader', source: 'reasoning', batchId: 'call-4' };

// 触发场景:实时回合里先后两个批次都拿到了标题(A 覆盖 call-2/3,B 覆盖 call-4)。
// 期望行为:不再是一条「正在运行 N 个工具」,而是两行 activity_summary,标题分别为
// A / B;只有最后一组是 live;id 带批次的 tool_call_id(流式追加时保持稳定);
// coveredItemIds 按批次划分。
run('实时回合按批次标题拆成多行', () => {
  const items = [user(1), tool(2, { preamble: A }), tool(3, { preamble: A, toolCallId: 'call-3' }), tool(4, { preamble: B, isDone: false })];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary', 'activity_summary']);
  assert.equal(out[1].title, A.title);
  assert.equal(out[1].live, false);
  assert.deepEqual(out[1].coveredItemIds, [2, 3]);
  assert.ok(out[1].id.endsWith(':preamble:call-2'), out[1].id);
  assert.equal(out[2].title, B.title);
  assert.equal(out[2].live, true);
  assert.deepEqual(out[2].preamble, B);
  assert.deepEqual(out[2].coveredItemIds, [4]);
  assert.ok(out[2].id.endsWith(':preamble:call-4'), out[2].id);
});

// 触发场景:回合结束(末尾是最终 assistant 正文)。
// 期望行为:外层仍是「已处理 …」一行;展开后的 detailItems 是按标题拆开的两组,
// 而不是一条「读取 N 个文件」的模板汇总。
run('完成回合的「已处理」里嵌套带标题的批次', () => {
  const items = [user(1), tool(2, { preamble: A }), tool(4, { preamble: B }), assistant(5, 'Done.')];
  const out = projectCollapsedTranscriptItems(items, { deferTrailingToolSummary: false });
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary', 'msg']);
  assert.equal(out[1].mode, 'processed');
  assert.ok(out[1].title.startsWith('已处理'), out[1].title);
  assert.deepEqual(out[1].detailItems.map((item) => item.kind), ['activity_summary', 'activity_summary']);
  assert.deepEqual(out[1].detailItems.map((item) => item.title), [A.title, B.title]);
});

// 触发场景:提示驱动模式,模型先写了一句前言(assistant 正文带
// metadata.tool_preamble.source=prompt)再调工具。
// 期望行为:那句话不再作为独立气泡出现,而是折进批次分组当标题;展开时正文条目
// 仍在 collapsedItems 里(可追溯)。
run('prompt 前言折进分组而不是独立气泡', () => {
  const preamble = { title: 'Reading the loader', source: 'prompt', batchId: 'call-3' };
  const items = [
    user(1),
    assistant(2, 'Reading the loader', { metadata: { tool_preamble: { title: 'Reading the loader', source: 'prompt' } } }),
    tool(3, { preamble }),
  ];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary']);
  assert.equal(out[1].title, 'Reading the loader');
  assert.deepEqual(out[1].coveredItemIds, [2, 3]);
  assert.ok(__test__.isPromptPreambleMessage(items[1]));
  // 流式中的正文不折:标题要等落盘 metadata 到达再定。
  assert.equal(__test__.isPromptPreambleMessage({ ...items[1], streaming: true }), false);
});

// 触发场景:功能关闭 —— 没有任何条目带标题。
// 期望行为:投影与改动前完全一致:单条 activity_summary、模板汇总标题、没有
// preamble 字段、id 仍是 activity:turn:<turnId>:0。
run('没有标题时投影保持原状', () => {
  const items = [user(1), tool(2), tool(3)];
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary']);
  assert.equal(out[1].id, 'activity:turn:t1:0');
  assert.equal(Object.prototype.hasOwnProperty.call(out[1], 'preamble'), false);
  assert.equal(out[1].live, true);
  const settled = projectCollapsedTranscriptItems([...items, assistant(4, 'Done.')], { deferTrailingToolSummary: false });
  assert.equal(settled[1].detailItems.length, 1);
  assert.equal(settled[1].detailItems[0].title, __test__.summarizeToolItems([items[1], items[2]]));
});

// 触发场景:带标题的批次之后,又来了一个没拿到标题的批次(例如 prompt 模式下
// 模型这次写了长段落,daemon 没给标题)。
// 期望行为:无标题的工具项另起一组、用模板汇总当标题,不被上一组的标题冒领;
// 空 assistant 消息这类非工具条目则归入当前组。
run('无标题批次不被上一组标题冒领', () => {
  const items = [user(1), tool(2, { preamble: A }), assistant(3, ''), tool(4), tool(5)];
  const groups = __test__.splitPreambleGroups(items.slice(1));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].preamble.title, A.title);
  assert.deepEqual(groups[0].items.map((item) => item.id), [2, 3]);
  assert.equal(groups[1].preamble, null);
  assert.deepEqual(groups[1].items.map((item) => item.id), [4, 5]);
  const out = projectCollapsedTranscriptItems(items, LIVE);
  assert.deepEqual(out.map((item) => item.kind), ['msg', 'activity_summary', 'activity_summary']);
  assert.equal(out[1].title, A.title);
  assert.equal(out[1].live, false);
  // 尾部无标题组承接实时状态:live 且不带 preamble 字段(标题由实时阶段文案决定)。
  assert.equal(out[2].live, true);
  assert.equal(Object.prototype.hasOwnProperty.call(out[2], 'preamble'), false);
  // 回合落定后无标题组退回模板汇总。
  const settled = projectCollapsedTranscriptItems(items, { deferTrailingToolSummary: false });
  assert.deepEqual(
    settled.slice(1).map((item) => item.title),
    [A.title, __test__.summarizeToolItems([items[3], items[4]])],
  );
});

// 触发场景:老会话历史 —— tool_call / tool 包装消息还没归并成结构化工具项,
// tool_call 包装的 metadata 里带 tool_preamble(历史还原时由 assistant metadata 复制)。
// 期望行为:归并出来的 legacy 工具项带 preamble,投影分组因此有标题。
run('legacy 包装归并后标题跟着走', () => {
  const items = [
    user(1),
    wrapper(2, 'tool_call', '[Tool: bash] {"cmd":"ls"}', {
      toolCallId: 'c1',
      metadata: { tool_call_id: 'c1', tool_preamble: { title: 'Listing files', source: 'reasoning', batch_id: 'c1' } },
    }),
    wrapper(3, 'tool', 'ok', { toolCallId: 'c1', metadata: { tool_call_id: 'c1' } }),
    assistant(4, 'Done.'),
  ];
  const normalized = __test__.normalizeToolInvocationItems(items);
  const legacy = normalized.find((item) => item.kind === 'tool');
  assert.ok(legacy, 'tool_call + tool 应归并成一个 tool 项');
  assert.equal(__test__.preambleOfItem(legacy)?.title, 'Listing files');
  const out = projectCollapsedTranscriptItems(items, { deferTrailingToolSummary: false });
  assert.equal(out[1].mode, 'processed');
  assert.deepEqual(out[1].detailItems.map((item) => item.title), ['Listing files']);
});
