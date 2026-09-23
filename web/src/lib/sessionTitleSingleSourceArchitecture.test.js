import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8').replace(/\r\n?/g, '\n');
}

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// 会话显示标题的单一来源合同。
// 触发场景:任何会显示会话名字的地方 —— 侧栏行、顶部标题栏、网格卡片、搜索面板。
// 期望行为:全部经 sessionDisplayTitle 从服务端的 title / title_source / summary 派生,
// 实时刷新只认 session_updated 与 messages 快照;前端任何地方都不能从消息正文推标题。
// 回归(bug 表现):transcript 加载历史后用 titleFromMessages 把最后一条 user 消息全文
// 当顶部标题(会话 20260923-163126-e7e3 的首条消息是 9k 字符的 @session 展开文本,
// 顶部标题就是它、长度不受限),侧栏却显示 80 字节的 summary,两处经常不一致;
// 侧栏 hover 还会再拉整份消息把跑马灯「水合」成全文。

test('sessionTitle.js 不再暴露从消息正文推标题的入口', () => {
  const lib = source('lib/sessionTitle.js');
  assert.doesNotMatch(lib, /export function titleFromMessages/);
  assert.match(lib, /export function sessionDisplayTitle\(/);
});

test('transcript 的标题只认服务端字段:快照与 session_updated,不看消息正文', () => {
  const transcript = source('lib/sessionTranscript.js');
  assert.doesNotMatch(transcript, /titleFromMessages/);
  assert.doesNotMatch(transcript, /\bsetTitle\b/);
  assert.match(transcript, /title: transcriptDisplayTitle\(state, sessionRefRef\.current\)/);
  assert.match(
    transcript,
    /case 'session_updated': \{[\s\S]*?hasOwnProperty\.call\(p, 'title'\)[\s\S]*?hasOwnProperty\.call\(p, 'summary'\)/,
  );
  assert.match(transcript, /if \(typeof data\.summary === 'string'\) next\.summary = data\.summary;/);
  assert.match(transcript, /titleSource: '',\n\s*summary: '',/);
});

test('ChatView 不在本地用输入文本改写标题,顶部标题直接来自 transcript', () => {
  const chatView = source('components/ChatView.jsx');
  assert.doesNotMatch(chatView, /setTranscriptTitle|\bsetTitle\(/);
  assert.match(
    chatView,
    /<SessionTitleBar titleTarget=\{titleTarget\} actionsTarget=\{actionsTarget\}\s*\n?\s*title=\{title\}/,
  );
});

test('侧栏对 session_updated 合并 summary,与 transcript 同一事件同一字段', () => {
  const sidebar = source('components/Sidebar.jsx');
  const handlerStart = sidebar.indexOf("msg.type === 'session_updated'");
  assert.ok(handlerStart >= 0);
  const handler = sidebar.slice(handlerStart, handlerStart + 1500);
  assert.match(handler, /hasOwnProperty\.call\(payload, 'title'\)/);
  assert.match(handler, /hasOwnProperty\.call\(payload, 'summary'\)/);
  assert.match(handler, /summary: hasSummary/);
  assert.doesNotMatch(sidebar, /sidebarFullTitle|loadSidebarFullTitle/);
  assert.ok(!fs.existsSync(path.join(srcRoot, 'lib/sidebarFullTitle.js')));
});
