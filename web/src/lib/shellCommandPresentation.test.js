import assert from 'node:assert/strict';
import { isShellCommand, shellCommandPresentation } from './shellCommandPresentation.js';
import { projectCollapsedTranscriptItems } from './transcriptProjection.js';
import { createTranscriptState, loadTranscriptHistory } from './sessionTranscript.js';

function run(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

run('Shell 卡片识别 bash 与历史 Ran，其它工具保持原有展示', () => {
  assert.equal(isShellCommand({ tool: 'bash' }), true);
  assert.equal(isShellCommand({ tool: 'Bash' }), true);
  assert.equal(isShellCommand({ summary: { verb: 'Ran' } }), true);
  assert.equal(shellCommandPresentation({ tool: 'file_read', args: { command: 'not a shell invocation' } }), null);
  assert.equal(shellCommandPresentation(null), null);
});

run('Shell 优先完整参数，命令多行与空白在复制中保持不变', () => {
  const command = "Get-Content -LiteralPath 'AGENTS.md'\nrg --files web\n  echo done";
  const entry = { tool: 'bash', args: { command }, summary: { verb: 'Ran', object: 'Get-Content ...' }, output: 'first\n\nlast\n' };
  const card = shellCommandPresentation(entry);
  assert.equal(card.command, command);
  assert.equal(card.output, entry.output);
  assert.equal(card.copyText, `$ ${command}\n\n${entry.output}`);
});

run('Shell 预览有界但完整输出未被截断，空结果不拼入 undefined', () => {
  const command = 'one\ntwo\nthree\nfour';
  const output = 'a\nb\nc\nd';
  const card = shellCommandPresentation({ tool: 'bash', args: { command }, output });
  assert.equal(card.previewText, '$ one\ntwo\nthree\n\na\nb\nc');
  assert.equal(card.copyText, `$ ${command}\n\n${output}`);
  assert.equal(shellCommandPresentation({ tool: 'bash', args: { command: 'true' } }).copyText, '$ true');
});

run('Shell 实时输出保留已完成行与尚未换行的尾部，完成后使用最终结果', () => {
  const entry = { tool: 'bash', args: { command: 'pnpm test' }, tailLines: ['test one', ''], currentPartial: 'test tw' };
  assert.equal(shellCommandPresentation(entry).output, 'test one\n\ntest tw');
  assert.equal(shellCommandPresentation({ ...entry, output: 'all passed' }).output, 'all passed');
});

run('Shell 兼容 JSON 参数与仅摘要历史，缺失参数时不把通用摘要伪装成命令', () => {
  assert.equal(shellCommandPresentation({ tool: 'bash', args: '{"command":"pwd"}' }).command, 'pwd');
  assert.equal(shellCommandPresentation({ summary: { verb: 'Ran', object: 'old command ...' } }).command, 'old command ...');
  assert.equal(shellCommandPresentation({ tool: 'bash', args: '{bad', summary: { verb: 'Bash', object: '{bad' }, output: 'error' }).command, '');
});

run('历史 assistant.tool_calls 与结构化 Shell 结果配对后保留完整命令', () => {
  const command = "Get-ChildItem -LiteralPath 'C:\\Projects\\example' -Force -Directory\nWrite-Output complete";
  const history = { messages: [
    { role: 'user', id: 'user', content: 'list folders', ts: 1 },
    { role: 'assistant', id: 'call', content: '', ts: 2, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command }) } }] },
    { role: 'tool', id: 'result', tool_call_id: 'call-1', content: 'FullName\nC:\\Projects\\example', ts: 3, metadata: { tool_summary: { verb: 'Ran', object: 'Get-ChildItem ...', metrics: [], icon: 'terminal' }, tool_success: true } },
  ] };
  const raw = loadTranscriptHistory(createTranscriptState(), history).state.items;
  const original = structuredClone(raw);
  const projected = projectCollapsedTranscriptItems(raw, { messageAutoCollapse: false });
  const calls = projected.filter((item) => item.kind === 'tool');
  assert.equal(calls.length, 1);
  assert.equal(shellCommandPresentation(calls[0].tool).command, command);
  assert.deepEqual(raw, original);
});

run('并行 Shell 调用按 call id 恢复参数，已有实时参数不被旧包装覆盖', () => {
  const wrapper = (id, command) => ({ kind: 'msg', id: `call-${id}`, role: 'tool_call', content: `[Tool: bash] ${JSON.stringify({ command })}`, toolCallId: id, ts: 1 });
  const result = (id, args = null) => ({ kind: 'tool', id, tool: { tool: 'bash', toolCallId: id, args, isDone: true, success: true, output: id, summary: { verb: 'Ran', object: 'short...' } }, ts: 2 });
  const raw = [wrapper('one', 'echo first'), wrapper('two', 'echo second'), result('two'), result('one')];
  const flat = projectCollapsedTranscriptItems(raw, { messageAutoCollapse: false });
  assert.deepEqual(flat.map((item) => shellCommandPresentation(item.tool).command), ['echo second', 'echo first']);
  const live = projectCollapsedTranscriptItems([wrapper('live', 'old'), result('live', { command: 'current' })], { messageAutoCollapse: false });
  assert.equal(shellCommandPresentation(live[0].tool).command, 'current');
});

run('旧 Shell 包装配对后输出不重复包含请求；没有请求的记录保留真实结果', () => {
  const raw = [
    { kind: 'msg', id: 1, role: 'tool_call', toolCallId: 'old', content: '[Tool: bash] {"command":"echo hello"}', ts: 1 },
    { kind: 'msg', id: 2, role: 'tool_result', toolCallId: 'old', content: 'hello', ts: 2 },
  ];
  const [item] = projectCollapsedTranscriptItems(raw, { messageAutoCollapse: false });
  assert.equal(shellCommandPresentation(item.tool).copyText, '$ echo hello\n\nhello');
  const [orphan] = projectCollapsedTranscriptItems([{ ...raw[1], tool_name: 'bash' }], { messageAutoCollapse: false });
  assert.equal(shellCommandPresentation(orphan.tool).command, '');
  assert.equal(shellCommandPresentation(orphan.tool).output, 'hello');
});
