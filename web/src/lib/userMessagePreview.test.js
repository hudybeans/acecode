// 对话记录用户消息有界预览的单元测试(第 2 条反馈 f300)。
import assert from 'node:assert/strict';
import { composerContentMessagePreview, userMessageTextPreview } from './userMessagePreview.js';
import { LONG_USER_MESSAGE_PREVIEW_CHARS, LONG_USER_MESSAGE_PREVIEW_LINES } from './pastedText.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

const lines = (count) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

// 触发场景:纯文本消息长度正好落在 2 万字符上限两侧。
// 期望行为:20000 字符完整渲染;20001 字符截成前 20000 字符并标记 truncated。
run('userMessageTextPreview: 20000 字符不截断,20001 字符截到 20000', () => {
  const exact = 'a'.repeat(LONG_USER_MESSAGE_PREVIEW_CHARS);
  assert.deepEqual(userMessageTextPreview(exact), { preview: exact, truncated: false });
  const over = userMessageTextPreview('a'.repeat(LONG_USER_MESSAGE_PREVIEW_CHARS + 1));
  assert.equal(over.truncated, true);
  assert.equal(over.preview.length, LONG_USER_MESSAGE_PREVIEW_CHARS);
});

// 触发场景:短行很多的消息(日志),字符数远小于 2 万,但行数落在 400 行上限两侧。
// 期望行为:400 行完整渲染(末尾换行不算多一行);401 行只保留前 400 行。行数上限只为
// 控制气泡高度,字符上限才是性能阈值。
run('userMessageTextPreview: 400 行不截断,401 行截到 400 行', () => {
  const four = lines(LONG_USER_MESSAGE_PREVIEW_LINES);
  assert.deepEqual(userMessageTextPreview(four), { preview: four, truncated: false });
  assert.deepEqual(userMessageTextPreview(`${four}\n`), { preview: `${four}\n`, truncated: false });
  const over = userMessageTextPreview(lines(LONG_USER_MESSAGE_PREVIEW_LINES + 1));
  assert.equal(over.truncated, true);
  assert.equal(over.preview, four);
});

// 回归:f300 那条 24,597,780 字符的 user 消息切进会话时整段进 pre-wrap 气泡,页面卡死。
// 期望行为:预览最多 2 万字符。耗时断言放宽到 300ms,只是粗防护,主断言是输出长度有界。
run('userMessageTextPreview: 2400 万字符旧消息的预览有界(回归 f300 切进会话卡死)', () => {
  const huge = '<div class="row">'.repeat(Math.ceil(24_597_780 / 17)).slice(0, 24_597_780);
  const started = Date.now();
  const result = userMessageTextPreview(huge);
  assert.ok(Date.now() - started < 300);
  assert.equal(result.truncated, true);
  assert.ok(result.preview.length <= LONG_USER_MESSAGE_PREVIEW_CHARS);
});

// 触发场景:第 2 万个码元是一个代理对(emoji)的高位。
// 期望行为:截断点退一位,预览里不出现孤立的高位代理项。
run('userMessageTextPreview: 不把代理对截成两半', () => {
  const text = `${'a'.repeat(LONG_USER_MESSAGE_PREVIEW_CHARS - 1)}😀tail`;
  const { preview, truncated } = userMessageTextPreview(text);
  assert.equal(truncated, true);
  assert.equal(preview, 'a'.repeat(LONG_USER_MESSAGE_PREVIEW_CHARS - 1));
});

// 触发场景:结构化消息里既有超长 text 部件,又有路径 / 技能 / 附件 / 两种粘贴块。
// 期望行为:所有 text 部件共用一份预算,用完后剩余 text 部件被丢弃;紧凑部件与粘贴块
// 全部保留,粘贴块正文不占预算。
run('composerContentMessagePreview: text 共用预算,紧凑部件与粘贴块保留', () => {
  const pasted = 'p'.repeat(100_000);
  const content = { version: 1, parts: [
    { type: 'text', text: 'x'.repeat(15_000) },
    { type: 'path', path: 'src/a.cpp', token: '@src/a.cpp' },
    { type: 'text', text: 'y'.repeat(10_000) },
    { type: 'skill', name: 'review', token: '$review' },
    { type: 'text', text: 'dropped' },
    { type: 'attachment', key: 'k1', id: 'a1', name: 'diagram.png', kind: 'image' },
    { type: 'pasted_text', key: 'paste-1', text: pasted },
    { type: 'attachment', key: 'k2', id: 'f1', name: 'pasted.txt', kind: 'file', paste: { title: 'log' } },
  ] };
  const { content: preview, truncated } = composerContentMessagePreview(content);
  assert.equal(truncated, true);
  const texts = preview.parts.filter((part) => part.type === 'text').map((part) => part.text);
  assert.deepEqual(texts.map((text) => text.length), [15_000, 5_000]);
  assert.deepEqual(preview.parts.map((part) => part.type), [
    'text', 'path', 'text', 'skill', 'attachment', 'pasted_text', 'attachment',
  ]);
  assert.equal(preview.parts.find((part) => part.type === 'pasted_text').text, pasted);
});

// 触发场景:结构化消息的文本都在预算内(只有一个大粘贴块)。
// 期望行为:原样返回同一个对象、truncated=false(不触发「查看全文」)。
run('composerContentMessagePreview: 未超预算时原样返回', () => {
  const content = { version: 1, parts: [
    { type: 'text', text: 'hello' },
    { type: 'pasted_text', key: 'paste-1', text: 'z'.repeat(200_000) },
  ] };
  const result = composerContentMessagePreview(content);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.content, content);
  assert.deepEqual(composerContentMessagePreview(null), { content: null, truncated: false });
});

// 触发场景:行数预算跨部件累计——前一个 text 部件已用掉 399 个换行。
// 期望行为:后一个 text 部件只能再贡献到第 400 行为止。
run('composerContentMessagePreview: 行预算跨 text 部件累计', () => {
  const content = { version: 1, parts: [
    { type: 'text', text: `${lines(399)}\n` },
    { type: 'path', path: 'a', token: '@a' },
    { type: 'text', text: 'row400\nrow401\nrow402' },
  ] };
  const { content: preview, truncated } = composerContentMessagePreview(content);
  assert.equal(truncated, true);
  assert.equal(preview.parts[2].text, 'row400');
});
