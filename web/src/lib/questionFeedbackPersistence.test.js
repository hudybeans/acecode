import assert from 'node:assert/strict';
import {
  createTranscriptState,
  loadTranscriptHistory,
  reduceTranscriptEvent,
} from './sessionTranscript.js';
import { projectCollapsedTranscriptItems } from './transcriptProjection.js';
import { renderQuestionToolForTest } from './questionFeedback.test.js';
import { reconcileLatestCompletedTurn } from './transcriptSelfHeal.js';

async function run(name, fn) {
  try {
    await fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function persistedToolCall(id, name) {
  return {
    id,
    type: 'function',
    function: { name, arguments: '{"questions":[]}' },
  };
}

function persistedAskTurn({
  id,
  kind,
  question = 'Q?',
  answer = 'A',
}) {
  const cancelled = kind === 'cancel';
  return [
    {
      id: `assistant-call-${id}`,
      role: 'assistant',
      tool_calls: [persistedToolCall(`call-${id}`, 'AskUserQuestion')],
      ts: id * 10 + 1,
    },
    {
      id: `tool-result-${id}`,
      role: 'tool',
      tool_call_id: `call-${id}`,
      content: cancelled
        ? '[Error] User declined to answer questions.'
        : 'User has answered your questions',
      metadata: {
        tool_success: !cancelled,
        ask_user_question_result: {
          cancelled,
          items: cancelled ? [] : [{ question, answer, multi_select: false }],
        },
      },
      ts: id * 10 + 2,
    },
  ];
}

function loadMessages(messages) {
  return loadTranscriptHistory(createTranscriptState({ title: 'feedback' }), {
    messages,
    events: [],
  }).state;
}

function renderedFeedbackSequence(items, options = {}) {
  const sequence = [];
  for (const item of projectCollapsedTranscriptItems(items, options)) {
    if (item.kind === 'tool') {
      sequence.push(`tool:${item.tool?.tool || '<unnamed>'}`);
    } else if (item.kind === 'activity_summary') {
      sequence.push(`activity:${item.mode || ''}`);
    } else {
      sequence.push(`${item.kind}:${item.role || ''}`);
    }
    if (item.kind === 'tool') {
      const html = renderQuestionToolForTest(item);
      for (const match of html.matchAll(/data-question-feedback="(submit|cancel)"/g)) {
        sequence.push(`card:${match[1]}`);
      }
    }
  }
  return sequence;
}

function assertCardsImmediatelyFollowCalls(sequence, expectedKinds) {
  const askIndexes = [];
  const cardKinds = [];
  sequence.forEach((entry, index) => {
    if (entry === 'tool:AskUserQuestion') askIndexes.push(index);
    if (entry.startsWith('card:')) cardKinds.push(entry.slice('card:'.length));
  });
  assert.deepEqual(cardKinds, expectedKinds);
  assert.equal(askIndexes.length, expectedKinds.length);
  askIndexes.forEach((index, callIndex) => {
    assert.equal(sequence[index + 1], `card:${expectedKinds[callIndex]}`);
  });
}

function liveAskState(kind) {
  const cancelled = kind === 'cancel';
  const result = {
    cancelled,
    items: cancelled ? [] : [{ question: 'Q?', answer: 'A', multi_select: false }],
  };
  const events = [
    { type: 'message', payload: { id: `user-${kind}`, role: 'user', content: 'Ask me' }, seq: 1 },
    {
      type: 'tool_start',
      payload: { tool: 'AskUserQuestion', tool_call_id: `call-${kind}` },
      seq: 2,
    },
    {
      type: 'tool_end',
      payload: {
        tool: 'AskUserQuestion',
        tool_call_id: `call-${kind}`,
        success: !cancelled,
        metadata: { ask_user_question_result: result },
      },
      seq: 3,
    },
    {
      type: 'message',
      payload: { id: `assistant-${kind}`, role: 'assistant', content: 'Thanks' },
      seq: 4,
    },
  ];
  return events.reduce(
    (state, event) => reduceTranscriptEvent(state, event).state,
    createTranscriptState({ title: kind, isLive: true, loadState: 'loaded' }),
  );
}

await run('持久化提交与取消重载后卡片紧跟各自 AskUserQuestion 调用', () => {
  for (const kind of ['submit', 'cancel']) {
    const state = loadMessages([
      { id: `user-${kind}`, role: 'user', content: 'Ask me', ts: 1 },
      ...persistedAskTurn({ id: kind === 'submit' ? 1 : 2, kind }),
      { id: `assistant-${kind}`, role: 'assistant', content: 'Thanks', ts: 99 },
    ]);
    const sequence = renderedFeedbackSequence(state.items);
    assertCardsImmediatelyFollowCalls(sequence, [kind]);
  }
});

await run('实时提交与取消在回合 self-heal 后仍保持调用与卡片相邻', () => {
  for (const kind of ['submit', 'cancel']) {
    const live = liveAskState(kind);
    const liveSequence = renderedFeedbackSequence(live.items);
    assertCardsImmediatelyFollowCalls(liveSequence, [kind]);

    const canonical = loadMessages([
      { id: `user-${kind}`, role: 'user', content: 'Ask me', ts: 1 },
      ...persistedAskTurn({ id: kind === 'submit' ? 3 : 4, kind }),
      { id: `assistant-${kind}`, role: 'assistant', content: 'Thanks', ts: 99 },
    ]);
    const healed = reconcileLatestCompletedTurn(live, canonical);
    assert.equal(healed.replaced, true);
    const healedSequence = renderedFeedbackSequence(healed.state.items);
    assertCardsImmediatelyFollowCalls(healedSequence, [kind]);
  }
});

await run('transcript_replace 使用相同历史规范化并保持取消卡相邻', () => {
  const previous = liveAskState('submit');
  const replaced = reduceTranscriptEvent(previous, {
    type: 'transcript_replace',
    payload: {
      messages: [
        { id: 'user-replace', role: 'user', content: 'Ask me', ts: 1 },
        ...persistedAskTurn({ id: 8, kind: 'cancel' }),
        { id: 'assistant-replace', role: 'assistant', content: 'Thanks', ts: 99 },
      ],
    },
    seq: previous.lastSeq + 1,
  }).state;

  assertCardsImmediatelyFollowCalls(renderedFeedbackSequence(replaced.items), ['cancel']);
});

await run('历史规范化保留工具结果已有的显式 tool_name', () => {
  const messages = [
    { id: 'user-explicit', role: 'user', content: 'Run tool', ts: 1 },
    {
      id: 'assistant-explicit',
      role: 'assistant',
      tool_calls: [persistedToolCall('call-explicit', 'WrongFallbackName')],
      ts: 2,
    },
    {
      id: 'tool-explicit',
      role: 'tool',
      tool_name: 'ExplicitToolName',
      tool_call_id: 'call-explicit',
      content: 'done',
      metadata: {
        tool_success: true,
        ask_user_question_result: {
          items: [{ question: 'Q?', answer: 'A' }],
        },
      },
      ts: 3,
    },
  ];

  const state = loadMessages(messages);
  const tool = state.items.find((item) => item.kind === 'tool');
  assert.equal(tool?.tool?.tool, 'ExplicitToolName');
  assert.equal(messages[2].tool, undefined, '历史规范化不得改写 API 原始消息');
});

await run('继续对话和同轮多次提问后每次调用只保留一张相邻卡片', () => {
  const state = loadMessages([
    { id: 'user-1', role: 'user', content: 'First turn', ts: 1 },
    ...persistedAskTurn({ id: 5, kind: 'submit', question: 'Q1?', answer: 'A1' }),
    ...persistedAskTurn({ id: 6, kind: 'cancel' }),
    { id: 'assistant-1', role: 'assistant', content: 'First done', ts: 70 },
    { id: 'user-2', role: 'user', content: 'Second turn', ts: 80 },
    ...persistedAskTurn({ id: 7, kind: 'submit', question: 'Q2?', answer: 'A2' }),
    { id: 'assistant-2', role: 'assistant', content: 'Second done', ts: 99 },
  ]);

  const sequence = renderedFeedbackSequence(state.items);
  assertCardsImmediatelyFollowCalls(sequence, ['submit', 'cancel', 'submit']);
  assert.equal(sequence.filter((entry) => entry.startsWith('card:')).length, 3);
});

await run('缺少调用或工具被改名的取消结果不会折叠进历史活动', () => {
  for (const toolName of ['', 'request_input']) {
    const turn = persistedAskTurn({ id: 9, kind: 'cancel' });
    if (toolName) turn[0].tool_calls[0].function.name = toolName;
    else turn.shift();
    const state = loadMessages([
      { id: 'user', role: 'user', content: 'Ask me', ts: 1 },
      ...turn,
      { id: 'done', role: 'assistant', content: 'Done', ts: 99 },
      { id: 'next', role: 'user', content: 'Continue', ts: 100 },
    ]);
    const projected = projectCollapsedTranscriptItems(state.items);
    const feedbackItems = projected.filter((item) => item.kind === 'tool');
    assert.equal(feedbackItems.length, 1);
    assert.match(renderQuestionToolForTest(feedbackItems[0]), /data-question-feedback="cancel"/);
    assert.equal(renderedFeedbackSequence(state.items).filter((entry) => entry === 'card:cancel').length, 1);
  }
});

await run('历史问答保留多选标记和完整答案', () => {
  const turn = persistedAskTurn({ id: 10, kind: 'submit', answer: 'A, B\nC' });
  turn[1].metadata.ask_user_question_result.items[0].multi_select = true;
  const state = loadMessages(turn);
  const item = projectCollapsedTranscriptItems(state.items).find((entry) => entry.kind === 'tool');
  assert.equal(item.tool.askUserQuestionResult.items[0].multiSelect, true);
  const html = renderQuestionToolForTest(item);
  assert.match(html, /data-question-feedback="submit"/);
  assert.match(html, /data-ask-user-question-result="true"/);
  assert.match(html, /data-desktop-tool-expanded="true"/);
  assert.match(html, /A, B\nC/, '历史问答结果默认展开并保留完整答案');
});

console.log('questionFeedbackPersistence tests passed');
