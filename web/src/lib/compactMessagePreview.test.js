import assert from 'node:assert/strict';
import {
  buildCompactMessagePreview,
  compactLineCount,
  compactOneLinePreview,
  isInterjectionAbortNotice,
  labelForNonAssistantRole,
} from './compactMessagePreview.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('compactOneLinePreview folds multiline text into one line', () => {
  assert.equal(compactOneLinePreview('first\n  second\n\nthird'), 'first second third');
});

run('compactOneLinePreview truncates long content', () => {
  const text = 'x'.repeat(30);
  assert.equal(compactOneLinePreview(text, 12), 'xxxxxxxxxxxx...');
});

run('compactOneLinePreview handles JSON-able values', () => {
  assert.equal(compactOneLinePreview({ tool: 'skill_view', ok: true }), '{"tool":"skill_view","ok":true}');
});

run('compactLineCount counts CRLF and LF lines', () => {
  assert.equal(compactLineCount('a\r\nb\nc'), 3);
});

run('labelForNonAssistantRole distinguishes tool calls and returns', () => {
  assert.equal(labelForNonAssistantRole('tool_call'), '工具调用');
  assert.equal(labelForNonAssistantRole('tool_result'), '工具返回');
  assert.equal(labelForNonAssistantRole('tool'), '工具返回');
  assert.equal(labelForNonAssistantRole('system'), '系统信息');
  assert.equal(labelForNonAssistantRole('system', '[Interrupted]'), '系统信息');
  assert.equal(labelForNonAssistantRole('system', '[Interjected]'), '插话中断');
  assert.equal(
    labelForNonAssistantRole('system', '[Interrupted]', { turn_interrupt: true }),
    '插话中断',
  );
});

run('isInterjectionAbortNotice only matches interjection markers', () => {
  assert.equal(isInterjectionAbortNotice('[Interjected]'), true);
  assert.equal(isInterjectionAbortNotice('[Interrupted]'), false);
  assert.equal(isInterjectionAbortNotice('[Interrupted]', { turn_interrupt: true }), true);
});

run('buildCompactMessagePreview returns one-line preview metadata', () => {
  const meta = buildCompactMessagePreview({ role: 'tool_result', content: 'line1\nline2' });
  assert.equal(meta.label, '工具返回');
  assert.equal(meta.preview, 'line1 line2');
  assert.equal(meta.lineCount, 2);

  const interjected = buildCompactMessagePreview({
    role: 'system',
    content: '[Interjected]',
  });
  assert.equal(interjected.label, '插话中断');
  assert.equal(interjected.preview, '[Interjected]');
});

// 回归(f300):回合滚动条对 2400 万字符的 user 消息调 compactOneLinePreview,旧实现
// split + Array.from 出 2400 万元素的数组,切进会话即卡死。
// 期望行为:只扫描开头有界窗口,源被截断时结果以 ... 结尾;耗时断言放宽到 300ms,只是粗防护。
run('compactOneLinePreview 对 2400 万字符输入只扫有界窗口并以 ... 结尾', () => {
  const huge = `   \n${'<td>cell</td>\n'.repeat(Math.ceil(24_000_000 / 14))}`;
  const started = Date.now();
  const preview = compactOneLinePreview(huge, 120);
  assert.ok(Date.now() - started < 300);
  assert.ok(preview.endsWith('...'));
  assert.ok(preview.startsWith('<td>cell</td> <td>cell</td>'));
  assert.ok(Array.from(preview).length <= 123);
});

// 触发场景:开头后面跟着一大段空白(超过扫描窗口),窗口内归一化后不足 limit。
// 期望行为:源文本被截断,结果仍强制以 ... 结尾,不会看起来像完整内容。
run('compactOneLinePreview 源被截断时即使窗口内不足 limit 也以 ... 结尾', () => {
  const text = `head${' '.repeat(10_000)}tail`;
  assert.equal(compactOneLinePreview(text, 20), 'head...');
});

// 触发场景:普通短输入(扫描窗口之内)。
// 期望行为:与改动前逐字节一致,包括空白折叠、截断与空内容。
run('compactOneLinePreview 短输入结果逐字节不变', () => {
  assert.equal(compactOneLinePreview('  first\r\n  second \n\n third  '), 'first second third');
  assert.equal(compactOneLinePreview('😀'.repeat(20), 10), `${'😀'.repeat(10)}...`);
  assert.equal(compactOneLinePreview(' \n\t '), '空内容');
  assert.equal(compactOneLinePreview(''), '空内容');
});
