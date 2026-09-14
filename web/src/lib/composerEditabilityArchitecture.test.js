// 输入框可编辑性的结构不变量。
//
// 背景(用户反馈的现场 bug):Web/Desktop 上输入框会「突然打不了字、光标进不
// 去」,来回切一次会话又恢复。根因不是焦点也不是遮罩,而是 ChatView 把发送
// 请求在途标记 composerSubmitting 并进了 InputBar 的 disabled,disabled 一路
// 传到 Slate 的 <Editable readOnly>,DOM 上直接变成 contenteditable=false;而
// 唯一的复位点是请求的 .finally() 和会话切换时的 setComposerSubmitting(false)
// —— 所以一次慢往返(实测侧边栏轮询把浏览器 6 条连接占满时排队 400ms+,
// daemon 侧还可能卡在 app_config_mu 或同步 SessionStart hook 上)就会让输入框
// 静默锁死最长 30s(api.js 的默认超时),而切会话正好把它擦掉。
//
// 更糟的是这个只读状态在视觉上完全不可见:样式写的是 Tailwind 的 disabled:
// 变体,而该变体只匹配真正的表单元素,对 contenteditable 的 div 永不生效 ——
// 用户看到的是一个长得完全正常、却打不了字的输入框。
//
// 这里守住三条:提交在途不进 disabled、只读状态可见、发送回执不吞掉用户在
// 等待窗口里写下的下一条。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8').replace(/\r\n?/g, '\n');
}

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('提交在途只走 submitting,绝不并进 InputBar 的 disabled', () => {
  const chatView = source('components/ChatView.jsx');

  // 会话 composer 与主页 composer 两处都不能再把 *Submitting 并进 disabled。
  assert.doesNotMatch(
    chatView,
    /disabled=\{[^}]*composerSubmitting[^}]*\}/,
    'composerSubmitting 进 disabled 会让编辑区在发送期间变成只读',
  );
  assert.doesNotMatch(
    chatView,
    /disabled=\{[^}]*homeSubmitting[^}]*\}/,
    'homeSubmitting 进 disabled 会让主页输入框在建会话期间变成只读',
  );

  // 主页 composer 的 disabled 只剩「有待回答的问题」这一个来源(没有会话可以
  // 承接插话);会话 composer 在提问挂起时**不再禁用** —— 直接输入 = 插话,
  // daemon 把问题以「用户改为直接输入」收掉并让模型在同一回合继续。旧行为
  // (禁用 + 「请先回答上方问题」)正是时序问题的根源:用户只能先取消作答,
  // 模型带着「用户拒答」先跑一截,那句话要等本回合结束才作为新回合送达。
  assert.equal(
    (chatView.match(/disabled=\{!!questionForView\}/g) || []).length,
    1,
    '只有主页 composer 由 questionForView 决定只读',
  );
  const sessionComposer = chatView.match(/<div className="ace-composer-dock">\s*<InputBar[\s\S]*?\/>/)?.[0] || '';
  assert.ok(sessionComposer, '未找到会话 composer 挂载点');
  assert.doesNotMatch(
    sessionComposer,
    /disabled=\{/,
    '会话 composer 不能因待回答的问题变成只读,否则用户无法插话',
  );
  assert.match(chatView, /submitting=\{composerSubmitting\}/);
  assert.match(chatView, /submitting=\{homeSubmitting\}/);
  assert.match(
    chatView,
    /placeholder=\{questionForView \? '回答上方问题，或直接输入插话（将取消作答，交给 AI 继续）' : undefined\}/,
    '提问挂起时 placeholder 要说明「直接输入 = 插话并取消作答」',
  );
  assert.doesNotMatch(chatView, /请先回答上方问题/);
});

run('提问挂起时的提交走插话端点,问题已结束才退回普通路径', () => {
  const chatView = source('components/ChatView.jsx');
  const submit = chatView.slice(
    chatView.indexOf('const submit = useCallback((text) => {'),
    chatView.indexOf('const drainQueuedInput = useCallback('),
  );
  assert.ok(submit, '未找到 submit');
  // 结束锚点用「自动新建会话」注释:submit 里前面的 desktop_feedback 分支也有
  // 一处 `if (!sid) {`,直接搜它会切到插话分支之前。
  const homeCreateIndex = submit.indexOf('// 自动新建会话');
  assert.ok(homeCreateIndex > 0, '未找到新建会话分支');
  const interject = submit.slice(
    submit.indexOf('if (sid && !isBuiltin && questionForView?.request_id) {'),
    homeCreateIndex,
  );
  assert.ok(interject, '未找到提问插话分支');
  // 插话必须发到问题所属会话(后台任务的问题路由回子会话),携带 request_id。
  assert.ok(interject.includes("const targetSid = questionForView.session_id || sid;"));
  assert.ok(interject.includes('api.interjectQuestion(targetSid, interjectPayload)'));
  assert.ok(interject.includes('request_id: requestId,'));
  // 绝不能走打断(会 abort 回合、丢 <turn_aborted> 标记)或普通排队。
  assert.ok(!interject.includes('api.interruptTurn('));
  assert.ok(!interject.includes('api.steerTurn('));
  // 只有 NO_PENDING_QUESTION(问题已在别处结束)才退回普通路径,其它错误提示用户。
  assert.ok(interject.includes("if (e?.code === 'NO_PENDING_QUESTION') {"));
  assert.ok(interject.includes('fallbackToOrdinaryPath();'));
  assert.ok(
    interject.indexOf('fallbackToOrdinaryPath();') > interject.indexOf("e?.code === 'NO_PENDING_QUESTION'"),
    '退回普通路径只能在 NO_PENDING_QUESTION 分支里',
  );
  // 插话分支要先于「无会话 → 新建会话」与「busy → 排队」两个分支。
  assert.ok(submit.indexOf('questionForView?.request_id') < homeCreateIndex);
  assert.ok(submit.indexOf('questionForView?.request_id') < submit.indexOf('if (busy && !isBuiltin) {'));

  // 排队卡片的「插话」在提问挂起时同样走提问插话,只有问题已结束才退回立即打断。
  const guideFlow = chatView.slice(
    chatView.indexOf('const guideQueued = useCallback((queuedId) => {'),
    chatView.indexOf('const executeBuiltinCommand = useCallback('),
  );
  assert.ok(guideFlow.includes('api.interjectQuestion(pendingQuestion.sid, {'));
  assert.ok(guideFlow.includes("if (e?.code !== 'NO_PENDING_QUESTION') throw e;"));
  assert.ok(
    guideFlow.indexOf('api.interjectQuestion(') < guideFlow.indexOf('return interruptNow();'),
    '提问挂起时先插话,退回打断只能在 NO_PENDING_QUESTION 之后',
  );
});

run('InputBar 把 submitting 只接到提交动作上', () => {
  const inputBar = source('components/InputBar.jsx');

  assert.match(inputBar, /disabled, submitting = false,/);
  assert.match(
    inputBar,
    /getInputBarActionState\(\{ value, disabled, busy, hasExtras, submitting \}\)/,
  );
  // 回车提交也要挡重复提交,否则去掉 disabled 后连点两次会发两条。
  assert.match(
    inputBar,
    /if \(\(!v && !hasExtras\) \|\| disabled \|\| submitting\) return;/,
  );
  // RichComposer(Slate readOnly 的唯一来源)只能吃 disabled,不能吃 submitting。
  const composerProps = inputBar.match(/<RichComposer[\s\S]*?\/>/)?.[0] || '';
  assert.ok(composerProps, '未找到 RichComposer 挂载点');
  assert.match(composerProps, /disabled=\{disabled\}/);
  assert.doesNotMatch(composerProps, /submitting/);
});

run('只读态在 contenteditable 上必须可见', () => {
  const inputBar = source('components/InputBar.jsx');
  const richComposer = source('components/RichComposer.jsx');

  // Editable 渲染的是 div,Tailwind 的 disabled: 变体对它永远不匹配,只能靠
  // aria-disabled 属性变体;属性本身由 RichComposer 写出。
  assert.match(richComposer, /aria-disabled=\{disabled \? 'true' : undefined\}/);
  assert.match(richComposer, /readOnly=\{disabled\}/);
  assert.match(inputBar, /aria-disabled:opacity-50 aria-disabled:cursor-not-allowed/);

  // 负向后行是必须的:aria-disabled:opacity-50 里也含 disabled:opacity-50 子串。
  const composerProps = inputBar.match(/<RichComposer[\s\S]*?\/>/)?.[0] || '';
  assert.doesNotMatch(
    composerProps,
    /(?<!aria-)disabled:opacity-50/,
    'disabled: 变体对 contenteditable div 无效,会让只读态完全没有视觉反馈',
  );
});

run('发送回执不吞掉等待窗口里写下的下一条', () => {
  const chatView = source('components/ChatView.jsx');

  // 编辑区不再锁,发送成功的 .then() 可能晚于用户写下的新内容;清草稿必须
  // 先比对提交那一刻的原文,对不上就整条放弃。
  assert.match(
    chatView,
    /const clearCurrentSessionDraft = useCallback\(\(\{ expectedText = null \} = \{\}\) => \{/,
  );
  assert.match(
    chatView,
    /if \(expectedText !== null && composerValueRef\.current !== expectedText\) return;/,
  );
  assert.match(chatView, /const submittedComposerText = composerValueRef\.current;/);
  assert.match(
    chatView,
    /clearCurrentSessionDraft\(\{ expectedText: submittedComposerText \}\)/,
  );
});
