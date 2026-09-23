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

// 触发场景:参数模式 —— daemon 从调用参数里剥出前言,随 tool_start 直接下发。
// 期望行为:工具项建项时就带 tool.preamble(source=prompt、无 batchId);投影的
// 实时活动行标题就是这句前言。
run('tool_start 自带前言:建项即打标', () => {
  const state = reduceMany([
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' }, preamble: 'Reading registry sections', preamble_source: 'prompt' }, seq: 1 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools[0].tool.preamble, { title: 'Reading registry sections', source: 'prompt', batchId: '' });
  const projected = projectCollapsedTranscriptItems(state.items, LIVE);
  assert.deepEqual(projected.map((item) => item.kind), ['activity_summary']);
  assert.equal(projected[0].title, 'Reading registry sections');
  assert.equal(projected[0].live, true);
});

// 触发场景:批次标题模式的常规顺序 —— tool_preamble 先于该批次的 tool_start 到达。
// 期望行为:标题先暂存在 pendingToolPreambles,两个 tool_start 建项时各自取走并挂到
// tool.preamble(带 batchId);取完 pending 清空。
run('tool_preamble 先到:tool_start 建项时取走暂存标题', () => {
  const state = reduceMany([
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1', 'c2'], title: 'Reading registry sections', source: 'reasoning', late: false }, seq: 1 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' }, preamble: 'Reading registry sections', preamble_source: 'reasoning' }, seq: 2 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c2', args: { file_path: 'b' } }, seq: 3 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 2);
  for (const item of tools) {
    assert.deepEqual(item.tool.preamble, { title: 'Reading registry sections', source: 'reasoning', batchId: 'c1' });
  }
  assert.deepEqual(state.pendingToolPreambles, {});
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

// 触发场景:REST 历史 / resume,参数模式 —— 前言落在 assistant(tool_calls) 消息的
// metadata.tool_preamble.calls 里(参数本身已被剥干净),结果在后面的 role:tool 消息。
// 期望行为:结构化结果项按自己的 tool_call_id 拿到前言(无 batchId);同批里没
// 填前言的调用没有 preamble;下一个 user 之后映射清空,不串到后面的回合。
run('历史加载:逐调用前言按 id 传播到结果项', () => {
  const loaded = loadTranscriptHistory(createTranscriptState({ title: 's1' }), {
    messages: [
      { id: 'u1', role: 'user', content: 'list files', ts: 1 },
      {
        id: 'a1', role: 'assistant', content: '', ts: 2,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } },
          { id: 'c2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"pwd"}' } },
        ],
        metadata: { tool_preamble: { source: 'prompt', calls: { c1: 'Listing files' } } },
      },
      {
        id: 't1', role: 'tool', tool_call_id: 'c1', content: 'ok', ts: 3,
        metadata: { tool_success: true, tool_summary: { verb: 'ran', object: 'ls', icon: '', metrics: [] } },
      },
      {
        id: 't2', role: 'tool', tool_call_id: 'c2', content: '/tmp', ts: 4,
        metadata: { tool_success: true, tool_summary: { verb: 'ran', object: 'pwd', icon: '', metrics: [] } },
      },
      { id: 'u2', role: 'user', content: 'again', ts: 5 },
      {
        id: 'a2', role: 'assistant', content: '', ts: 6,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } }],
      },
      {
        id: 't3', role: 'tool', tool_call_id: 'c1', content: 'ok', ts: 7,
        metadata: { tool_success: true, tool_summary: { verb: 'ran', object: 'ls', icon: '', metrics: [] } },
      },
    ],
  }).state;
  const tools = toolItems(loaded);
  assert.equal(tools.length, 3);
  assert.deepEqual(tools[0].tool.preamble, { title: 'Listing files', source: 'prompt', batchId: '' });
  assert.equal(tools[1].tool.preamble, undefined, '没填前言的调用不该有 preamble');
  assert.equal(tools[2].tool.preamble, undefined, '下一回合复用同一 id 也不能继承上一回合的前言');
});

// 触发场景:REST 历史,批次标题模式 —— metadata.tool_preamble 只有 title。
// 期望行为:整批结果项都挂批次标题(batchId = 第一个 tool_call_id);assistant
// 派生的 tool_call 包装项 metadata 补上 batch_id;投影出的分组仍是一条模板汇总。
run('历史加载:批次标题传播到整批结果项', () => {
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
      { id: 'a2', role: 'assistant', content: 'Done.', ts: 4 },
    ],
  }).state;
  const result = loaded.items.find((item) => item.kind === 'tool' && item.tool.toolCallId === 'c1');
  assert.ok(result, '结构化结果项应存在');
  assert.deepEqual(result.tool.preamble, { title: 'Listing files', source: 'reasoning', batchId: 'c1' });
  const wrapper = loaded.items.find((item) => item.kind === 'msg' && item.role === 'tool_call' && item.toolCallId === 'c1');
  assert.ok(wrapper, 'tool_call 包装项应存在');
  assert.equal(wrapper.metadata.tool_preamble.batch_id, 'c1');
  const projected = projectCollapsedTranscriptItems(loaded.items, { deferTrailingToolSummary: false });
  assert.deepEqual(projected.map((item) => item.kind), ['msg', 'activity_summary', 'msg']);
  assert.equal(projected[1].mode, 'processed');
});

// 触发场景:tool_preamble 事件夹在流式 token 之间到达。
// 期望行为:它是流中性事件 —— 不会把正在流式的 assistant 草稿切成两条;随后的
// message 帧原位定稿。
run('tool_preamble 不切断流式草稿', () => {
  const state = reduceMany([
    { type: 'token', payload: { text: 'Reading ' }, seq: 1 },
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1'], title: 'Reading the loader', source: 'reasoning', late: false }, seq: 2 },
    { type: 'token', payload: { text: 'the loader' }, seq: 3 },
    { type: 'message', payload: { id: 'm1', role: 'assistant', content: 'Reading the loader' }, seq: 4 },
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' } }, seq: 5 },
  ]);
  const assistants = state.items.filter((item) => item.kind === 'msg' && item.role === 'assistant');
  assert.equal(assistants.length, 1);
  assert.equal(assistants[0].content, 'Reading the loader');
  assert.equal(toolItems(state)[0].tool.preamble.title, 'Reading the loader');
});
