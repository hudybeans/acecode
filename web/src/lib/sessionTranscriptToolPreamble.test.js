import assert from 'node:assert/strict';
import {
  createTranscriptState,
  loadTranscriptHistory,
  reduceTranscriptEvent,
} from './sessionTranscript.js';
import { projectCollapsedTranscriptItems } from './transcriptProjection.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function reduceMany(events, initial = createTranscriptState()) {
  return events.reduce((state, event) => reduceTranscriptEvent(state, event).state, initial);
}

function toolItems(state) {
  return state.items.filter((item) => item.kind === 'tool');
}

const LIVE = { deferTrailingToolSummary: true, ensureLiveActivity: true, liveTurnId: 't1' };

// 触发场景:daemon 的常规顺序 —— tool_preamble 先于该批次的 tool_start 到达。
// 期望行为:标题先暂存在 pendingToolPreambles,两个 tool_start 建项时各自取走并挂到
// tool.preamble;取完 pending 清空;投影出一条以标题命名的 activity_summary。
run('tool_preamble 先到:tool_start 建项时取走暂存标题', () => {
  const state = reduceMany([
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1', 'c2'], title: 'Reading registry sections', source: 'reasoning', late: false }, seq: 1 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' } }, seq: 2 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c2', args: { file_path: 'b' } }, seq: 3 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 2);
  for (const item of tools) {
    assert.deepEqual(item.tool.preamble, { title: 'Reading registry sections', source: 'reasoning', batchId: 'c1' });
  }
  assert.deepEqual(state.pendingToolPreambles, {});
  const projected = projectCollapsedTranscriptItems(state.items, LIVE);
  assert.deepEqual(projected.map((item) => item.kind), ['activity_summary']);
  assert.equal(projected[0].title, 'Reading registry sections');
  assert.equal(projected[0].live, true);
});

// 触发场景:sidecar 迟到 —— 工具已经跑完(tool_start / tool_end 都到了)标题才来,
// 事件带 late=true。
// 期望行为:已存在的工具项原地打标;不残留 pending。
run('late 标题原地打到已存在的工具项上', () => {
  const state = reduceMany([
    { type: 'tool_start', payload: { tool: 'bash', tool_call_id: 'c1', args: { cmd: 'ls' } }, seq: 1 },
    { type: 'tool_end', payload: { tool: 'bash', tool_call_id: 'c1', success: true, output: 'ok' }, seq: 2 },
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1'], title: 'Listing files', source: 'sidecar', late: true }, seq: 3 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].tool.preamble.title, 'Listing files');
  assert.equal(tools[0].tool.isDone, true);
  assert.deepEqual(state.pendingToolPreambles, {});
});

// 触发场景:REST 历史 / resume —— 标题只落在 assistant(tool_calls) 消息的
// metadata.tool_preamble 上,结果在后面的 role:tool 消息里。
// 期望行为:结构化结果项(带 tool_summary)挂上 tool.preamble、batchId 是第一个
// tool_call_id;assistant 派生的 tool_call 包装项 metadata 补上 batch_id;
// 投影出以标题命名的分组。下一个 user 消息之后映射清空,不会串到后面的回合。
run('历史加载把 assistant metadata 的标题传播到同批次结果项', () => {
  const loaded = loadTranscriptHistory(createTranscriptState({ title: 's1' }), {
    messages: [
      { id: 'u1', role: 'user', content: 'list files', ts: 1 },
      {
        id: 'a1', role: 'assistant', content: '', ts: 2,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } }],
        metadata: { tool_preamble: { title: 'Listing files', source: 'reasoning' } },
      },
      {
        id: 't1', role: 'tool', tool_call_id: 'c1', content: 'ok', ts: 3,
        metadata: { tool_success: true, tool_summary: { verb: 'ran', object: 'ls', icon: '', metrics: [] } },
      },
      { id: 'u2', role: 'user', content: 'again', ts: 4 },
      {
        id: 'a2', role: 'assistant', content: '', ts: 5,
        tool_calls: [{ id: 'c2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"pwd"}' } }],
      },
      {
        id: 't2', role: 'tool', tool_call_id: 'c2', content: '/tmp', ts: 6,
        metadata: { tool_success: true, tool_summary: { verb: 'ran', object: 'pwd', icon: '', metrics: [] } },
      },
    ],
  }).state;
  const result = loaded.items.find((item) => item.kind === 'tool' && item.tool.toolCallId === 'c1');
  assert.ok(result, '结构化结果项应存在');
  assert.deepEqual(result.tool.preamble, { title: 'Listing files', source: 'reasoning', batchId: 'c1' });
  const wrapper = loaded.items.find((item) => item.kind === 'msg' && item.role === 'tool_call' && item.toolCallId === 'c1');
  assert.ok(wrapper, 'tool_call 包装项应存在');
  assert.equal(wrapper.metadata.tool_preamble.batch_id, 'c1');
  const second = loaded.items.find((item) => item.kind === 'tool' && item.tool.toolCallId === 'c2');
  assert.ok(second);
  assert.equal(second.tool.preamble, undefined, '没有标题的下一回合不能继承上一回合的标题');

  const projected = projectCollapsedTranscriptItems(loaded.items, { deferTrailingToolSummary: false });
  const titles = projected.filter((item) => item.kind === 'activity_summary').map((item) => item.title);
  assert.equal(titles[0], 'Listing files');
  assert.notEqual(titles[1], 'Listing files');
});

// 触发场景:tool_preamble 夹在流式 token 之间到达(它在 assistant 正文之后、
// message 帧之前发出)。
// 期望行为:它是流中性事件 —— 不会把正在流式的 assistant 草稿切成两条;随后的
// message 帧原位定稿并带上 metadata.tool_preamble。
run('tool_preamble 不切断流式草稿', () => {
  const state = reduceMany([
    { type: 'token', payload: { text: 'Reading ' }, seq: 1 },
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1'], title: 'Reading the loader', source: 'prompt', late: false }, seq: 2 },
    { type: 'token', payload: { text: 'the loader' }, seq: 3 },
    { type: 'message', payload: { id: 'm1', role: 'assistant', content: 'Reading the loader', metadata: { tool_preamble: { title: 'Reading the loader', source: 'prompt' } } }, seq: 4 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' } }, seq: 5 },
  ]);
  const assistants = state.items.filter((item) => item.kind === 'msg' && item.role === 'assistant');
  assert.equal(assistants.length, 1);
  assert.equal(assistants[0].content, 'Reading the loader');
  assert.equal(assistants[0].metadata.tool_preamble.source, 'prompt');
  const projected = projectCollapsedTranscriptItems(state.items, LIVE);
  assert.deepEqual(projected.map((item) => item.kind), ['activity_summary']);
  assert.equal(projected[0].title, 'Reading the loader');
});
