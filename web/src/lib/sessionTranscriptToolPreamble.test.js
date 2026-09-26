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

function assistantItems(state) {
  return state.items.filter((item) => item.kind === 'msg' && item.role === 'assistant');
}

const LIVE = { deferTrailingToolSummary: true, ensureLiveActivity: true, liveTurnId: 't1' };

// 触发场景:daemon 把本批次沿用的阶段前言随 tool_start 下发(preamble / preamble_source /
// preamble_kind)。期望行为:工具项建项时就带 tool.preamble = {title, source, kind};
// 投影的实时活动行标题就是这句前言;kind 只透传,不影响标题。
run('tool_start 自带前言:建项即打标,实时活动行用它当标题', () => {
  const state = reduceMany([
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' }, preamble: 'Reading registry sections', preamble_source: 'prompt', preamble_kind: 'read' }, seq: 1 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools[0].tool.preamble, { title: 'Reading registry sections', source: 'prompt', kind: 'read' });
  const projected = projectCollapsedTranscriptItems(state.items, LIVE);
  assert.deepEqual(projected.map((item) => item.kind), ['activity_summary']);
  assert.equal(projected[0].title, 'Reading registry sections');
  assert.deepEqual(projected[0].preamble, { title: 'Reading registry sections', source: 'prompt', kind: 'read' });
});

// 触发场景:没有前言的 tool_start(功能关闭 / 模型没打标签)。
// 期望行为:工具项没有 preamble 字段,投影与改动前一致(模板文案)。
run('没有前言的 tool_start 不打标', () => {
  const state = reduceMany([
    { type: 'tool_start', payload: { tool: 'file_read', tool_call_id: 'c1', args: { file_path: 'a' } }, seq: 1 },
  ]);
  const tools = toolItems(state);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].tool.preamble, undefined);
});

// 触发场景:标签一闭合 daemon 就发 agent_progress{phase:preamble, label, preamble:{…}},
// 工具调用还没流出来。期望行为:activity.label 是前言,activity.preamble 带 kind,
// 投影的实时行(还没有工具项时靠 ensureLiveActivity)显示这句前言。
run('agent_progress 的前言帧立刻换掉活动行文案', () => {
  const state = reduceMany([
    { type: 'busy_changed', payload: { busy: true }, seq: 1 },
    { type: 'agent_progress', payload: { phase: 'model_waiting', label: '正在等待模型响应' }, seq: 2 },
    { type: 'agent_progress', payload: { phase: 'preamble', label: 'Editing config', preamble: { title: 'Editing config', source: 'prompt', kind: 'write' } }, seq: 3 },
  ]);
  assert.equal(state.activity.label, 'Editing config');
  assert.deepEqual(state.activity.preamble, { title: 'Editing config', source: 'prompt', kind: 'write' });
  const plain = reduceMany([
    { type: 'agent_progress', payload: { phase: 'reasoning', label: '正在推理' }, seq: 1 },
  ]);
  assert.equal(plain.activity.preamble, null);
});

// 触发场景:落盘的 assistant 正文保留了 <text_preamble> 标签(有意为之,模型会模仿
// 自己的历史),历史加载与实时 message 帧都可能带它。期望行为:两条路径的 assistant
// 正文都剥掉标签(标签后的空行一起去掉);整段都是标签的 assistant(tool_calls)
// 消息不产生正文气泡;metadata.tool_preamble 只是记录,不影响任何项。
run('历史加载与 message 帧都剥掉 <text_preamble> 标签', () => {
  const loaded = loadTranscriptHistory(createTranscriptState({ title: 's1' }), {
    messages: [
      { id: 'u1', role: 'user', content: 'list files', ts: 1 },
      {
        id: 'a1', role: 'assistant', ts: 2,
        content: '<text_preamble type="read">Listing files</text_preamble>\n\n',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } }],
        metadata: { tool_preamble: { source: 'prompt', title: 'Listing files', kind: 'read' } },
      },
      { id: 't1', role: 'tool', tool_call_id: 'c1', content: 'ok', ts: 3 },
      { id: 'a2', role: 'assistant', ts: 4, content: '<text_preamble>x</text_preamble>\n\nAll done.' },
    ],
  }).state;
  const assistants = assistantItems(loaded);
  for (const item of assistants) {
    assert.ok(!String(item.content || '').includes('text_preamble'), item.content);
  }
  assert.deepEqual(assistants.filter((item) => item.content.trim()).map((item) => item.content), ['All done.']);
  for (const item of toolItems(loaded)) {
    assert.equal(item.tool.preamble, undefined);
  }

  const live = reduceMany([
    { type: 'message', payload: { role: 'assistant', id: 'm1', content: '<text_preamble type="write">Editing</text_preamble>\n\nDone editing.' }, seq: 1 },
  ]);
  assert.deepEqual(assistantItems(live).map((item) => item.content), ['Done editing.']);
});

// 触发场景:旧 daemon 仍发 tool_preamble 事件(已从协议里删掉)。
// 期望行为:当作未知事件忽略,不报错、不建项。
run('已删除的 tool_preamble 事件被忽略', () => {
  const state = reduceMany([
    { type: 'tool_preamble', payload: { batch_id: 'c1', tool_call_ids: ['c1'], title: 'Old', source: 'prompt', late: false }, seq: 1 },
  ]);
  assert.equal(state.items.length, 0);
  assert.equal(state.pendingToolPreambles, undefined);
});
