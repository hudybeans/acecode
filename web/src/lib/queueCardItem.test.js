// queueCardItem.js 的单元测试。
//
// 项目内 JS 测试只跑 Node + node:assert,没有 JSDOM / RTL,所以把 QueueCardList 的
// 状态↔标签映射逻辑抽到纯函数 buildQueueCardItem 里测;DOM 端只是把这份结构
// 映射到 className,无独立行为可测。
//
// 覆盖:
//  - 空 items / 缺失 queued 的容错
//  - QUEUED → "排队中",非 dimmed,无 retry
//  - SENDING → "发送中…",dimmed,无 retry
//  - FAILED → 优先用 error 文案,有 retry
//  - buildQueueCardItems 保持 FIFO 顺序

import assert from 'node:assert/strict';
import { QUEUED_INPUT_STATE, QUEUE_PAUSE_REASON } from './chatInputQueue.js';
import { buildQueueCardItem, buildQueueCardItems, buildQueuePausedBanner } from './queueCardItem.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function makeItem(state, content = 'hi', error = '') {
  return {
    kind: 'msg',
    id: `queued-s-${state}`,
    role: 'user',
    content,
    queued: {
      id: `queued-s-${state}`,
      sessionId: 's',
      state,
      error,
      payload: { text: content, attachments: [], contexts: [] },
    },
  };
}

run('buildQueueCardItem QUEUED 默认排队中,无 retry', () => {
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.QUEUED, 'hello'));
  assert.equal(card.queuedId, 'queued-s-queued');
  assert.equal(card.content, 'hello');
  assert.equal(card.statusKind, 'queued');
  assert.equal(card.statusLabel, '排队中');
  assert.equal(card.dimmed, false);
  assert.equal(card.showRetry, false);
  assert.equal(card.canEdit, true);
  assert.equal(card.canGuide, true);
  assert.equal(card.editText, 'hello');
  assert.equal(card.hasExtras, false);
});

run('buildQueueCardItem SENDING 是 dimmed 的发送中状态', () => {
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.SENDING));
  assert.equal(card.statusKind, 'sending');
  assert.equal(card.statusLabel, '发送中…');
  assert.equal(card.dimmed, true);
  assert.equal(card.showRetry, false);
  assert.equal(card.canEdit, false);
  assert.equal(card.canGuide, false);
});

run('buildQueueCardItem FAILED 显示 error 文案并允许重试', () => {
  const card = buildQueueCardItem(
    makeItem(QUEUED_INPUT_STATE.FAILED, 'hi', 'network blew up'),
  );
  assert.equal(card.statusKind, 'failed');
  assert.equal(card.statusLabel, 'network blew up');
  assert.equal(card.dimmed, false);
  assert.equal(card.showRetry, true);
  assert.equal(card.canEdit, true);
  assert.equal(card.canGuide, true);
});

run('buildQueueCardItem FAILED 缺 error 时回退默认文案', () => {
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.FAILED, 'hi', ''));
  assert.equal(card.statusLabel, '发送失败');
  assert.equal(card.showRetry, true);
});

run('buildQueueCardItem GUIDING 显示插话中且不重复显示按钮', () => {
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.GUIDING, 'hi'));
  assert.equal(card.statusKind, 'guiding');
  assert.equal(card.statusLabel, '正在提交插话…');
  assert.equal(card.dimmed, true);
  assert.equal(card.canEdit, false);
  assert.equal(card.canGuide, false);

  const accepted = makeItem(QUEUED_INPUT_STATE.GUIDING, 'hi');
  accepted.queued.acceptedAt = 100;
  assert.equal(buildQueueCardItem(accepted).statusLabel, '正在打断当前回合…');
});

run('附件或上下文排队项也可以作为结构化引导', () => {
  const attachmentItem = makeItem(QUEUED_INPUT_STATE.QUEUED, 'with file');
  attachmentItem.queued.payload.attachments = [{ id: 'att-1' }];
  assert.equal(buildQueueCardItem(attachmentItem).canGuide, true);
  assert.equal(buildQueueCardItem(attachmentItem).canEdit, true);
  assert.equal(buildQueueCardItem(attachmentItem).hasExtras, true);

  const contextItem = makeItem(QUEUED_INPUT_STATE.FAILED, 'with context');
  contextItem.queued.payload.contexts = [{ type: 'selection' }];
  assert.equal(buildQueueCardItem(contextItem).canGuide, true);
  assert.equal(buildQueueCardItem(contextItem).canEdit, true);

  const attachmentOnly = makeItem(QUEUED_INPUT_STATE.QUEUED, '');
  attachmentOnly.queued.payload.attachments = [{ id: 'att-2' }];
  assert.equal(buildQueueCardItem(attachmentOnly).canGuide, true);
  assert.equal(buildQueueCardItem(attachmentOnly).canEdit, true);
  assert.equal(buildQueueCardItem(attachmentOnly).editText, '');
  assert.equal(buildQueueCardItem(attachmentOnly).hasExtras, true);
});

run('buildQueueCardItem 缺 queued 字段时不崩溃,默认按 QUEUED 渲染', () => {
  const card = buildQueueCardItem({ kind: 'msg', id: '1', content: 'x' });
  assert.equal(card.queuedId, '');
  assert.equal(card.statusKind, 'queued');
  assert.equal(card.statusLabel, '排队中');
  assert.equal(card.canEdit, true);
  assert.equal(card.editText, 'x');
});

run('buildQueueCardItems 处理 null/非数组并保持 FIFO 顺序', () => {
  assert.deepEqual(buildQueueCardItems(null), []);
  assert.deepEqual(buildQueueCardItems(undefined), []);
  assert.deepEqual(buildQueueCardItems('not array'), []);

  const cards = buildQueueCardItems([
    makeItem(QUEUED_INPUT_STATE.SENDING, 'first'),
    makeItem(QUEUED_INPUT_STATE.QUEUED, 'second'),
    makeItem(QUEUED_INPUT_STATE.FAILED, 'third', 'boom'),
  ]);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].content, 'first');
  assert.equal(cards[1].content, 'second');
  assert.equal(cards[2].content, 'third');
  assert.equal(cards[0].statusKind, 'sending');
  assert.equal(cards[1].statusKind, 'queued');
  assert.equal(cards[2].statusKind, 'failed');
});

run('buildQueueCardItem 长文本完整保留,UI 端用 CSS 截断 + title', () => {
  const longText = '一'.repeat(2000);
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.QUEUED, longText));
  // 数据层不截断 — 完整文本传到 DOM,truncation 由 CSS 完成,title 保留全文
  assert.equal(card.content, longText);
  assert.equal(card.content.length, 2000);
});

// ---- 「队列已暂停」横幅 -------------------------------------------------------
// 触发场景:用户中断回合后 chatInputQueue 记下 { reason:'interrupted', pausedAt }。
// 期望行为:横幅文案点明「由于你中断了当前响应」,右侧按钮文案「继续」;
// 未暂停(null / 非对象)时返回 null,QueueCardList 不渲染横幅。
run('buildQueuePausedBanner:中断暂停给出说明文案与「继续」按钮', () => {
  const banner = buildQueuePausedBanner({ reason: QUEUE_PAUSE_REASON.INTERRUPTED, pausedAt: 1 });
  assert.equal(banner.reason, 'interrupted');
  assert.equal(banner.message, '由于你中断了当前响应，队列已暂停');
  assert.equal(banner.resumeLabel, '继续');
  assert.equal(banner.resumeTitle, '继续发送排队的消息');
  assert.equal(buildQueuePausedBanner(null), null);
  assert.equal(buildQueuePausedBanner(undefined), null);
  assert.equal(buildQueuePausedBanner('interrupted'), null, '只接受对象形态');
});

// 触发场景:将来出现别的暂停原因(或 reason 缺失)。
// 期望行为:退回通用文案「队列已暂停」,按钮仍是「继续」,不因未知原因而不渲染。
run('buildQueuePausedBanner:未知 / 缺失原因退回通用文案', () => {
  assert.equal(buildQueuePausedBanner({ reason: 'other' }).message, '队列已暂停');
  assert.equal(buildQueuePausedBanner({ reason: 'other' }).resumeLabel, '继续');
  assert.equal(buildQueuePausedBanner({}).reason, 'interrupted', '缺失原因按中断处理');
});

// ---- 粘贴的文本块(第 2 条反馈 f300) -----------------------------------------

function makePasteItem(parts, { attachments = [] } = {}) {
  const composer_content = { version: 1, parts };
  const text = parts.map((part) => (part.type === 'pasted_text' || part.type === 'text' ? part.text : ''))
    .filter(Boolean).join('\n\n');
  return {
    kind: 'msg',
    id: 'queued-paste',
    role: 'user',
    content: text,
    queued: {
      id: 'queued-paste',
      sessionId: 's',
      state: QUEUED_INPUT_STATE.QUEUED,
      payload: { text, attachments, contexts: [], composer_content },
    },
  };
}

// 触发场景:排队的消息带一个 20 万字符的内联粘贴块,编辑器里只写了「分析下面日志」。
// 期望行为:卡片文字把块显示成「[粘贴的文本]」且不超过 1000 字符;编辑框拿到的
// editText 只有编辑器文本(块在编辑框上方以卡片呈现),不含粘贴正文;可编辑。
run('buildQueueCardItem 带内联粘贴块:卡片显示 [粘贴的文本],编辑文本不含正文', () => {
  const block = 'L'.repeat(200_000);
  const card = buildQueueCardItem(makePasteItem([
    { type: 'text', text: '分析下面日志' },
    { type: 'pasted_text', key: 'p1', text: block },
  ]));
  assert.equal(card.content, '分析下面日志\n\n[粘贴的文本]');
  assert.ok(card.content.length <= 1000);
  assert.equal(card.editText, '分析下面日志');
  assert.equal(card.canEdit, true);
  assert.equal(card.composerContent.parts[1].text.length, block.length, '块原样留在 composer 里');
});

// 触发场景:只有一个文件块(粘贴文本已落成附件),编辑器为空。
// 期望行为:卡片同样显示「[粘贴的文本]」,editText 为空但仍可编辑(附件算 extras)。
run('buildQueueCardItem 只有文件粘贴块:同样显示为 [粘贴的文本]', () => {
  const card = buildQueueCardItem(makePasteItem([
    {
      type: 'attachment', key: 'a1', id: 'a1', name: 'pasted-text-20260925-101010.txt',
      kind: 'file', mime_type: 'text/plain', paste: { title: '日志', chars: 3, lines: 1 },
    },
  ], { attachments: [{ id: 'a1' }] }));
  assert.equal(card.content, '[粘贴的文本]');
  assert.equal(card.editText, '');
  assert.equal(card.hasExtras, true);
  assert.equal(card.canEdit, true);
});

// 触发场景(回归 f300):旧版本排进来的一条 2400 万字符纯文本消息(没有块信息)。
// bug 表现:整段 trim 一遍、整段放进卡片文字与 title 属性,渲染明显卡顿。
// 期望行为:hasText 正确(可编辑),卡片文字只保留前 4096 字符。耗时断言只是粗防护
// (300ms 给慢 CI 留余量),主断言是输出长度有界。
run('buildQueueCardItem 2400 万字符旧文本:卡片文字有界且 hasText 正确', () => {
  const huge = `${' '.repeat(10)}${'x'.repeat(24_000_000)}`;
  const started = Date.now();
  const card = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.QUEUED, huge));
  const elapsed = Date.now() - started;
  assert.equal(card.canEdit, true);
  assert.equal(card.content.length, 4096);
  assert.ok(elapsed < 300, `took ${elapsed}ms`);
  const blank = buildQueueCardItem(makeItem(QUEUED_INPUT_STATE.QUEUED, ' '.repeat(5000)));
  assert.equal(blank.canEdit, false, '全空白的文本仍然不算有内容');
});
