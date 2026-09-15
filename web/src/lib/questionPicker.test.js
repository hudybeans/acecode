// QuestionPicker helper 单元测试:覆盖 payload、取消和导航禁用等纯逻辑。

import assert from 'node:assert/strict';
import {
  allQuestionsAnswered,
  buildQuestionAnswerPayload,
  buildQuestionCancelPayload,
  buildQuestionSummary,
  getNavigationState,
  hasSelectedTextWithin,
  isQuestionAnswered,
  isQuestionSkipped,
  makeInitialAnswers,
  normalizeQuestionRequest,
  recommendedOptionIndex,
  selectAnswerCustom,
  toggleAnswerSelection,
  setAnswerCustom,
  skipAnswer,
  unselectAnswerCustom,
} from './questionPicker.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

const request = normalizeQuestionRequest({
  request_id: 'req-1',
  session_id: 'sid-1',
  questions: [
    {
      id: 'q1',
      text: '你想做什么?',
      options: [
        { label: '修复 bug', value: 'fix-bug', description: '诊断问题' },
        { label: '添加功能', value: 'add-feature', description: '实现新能力' },
      ],
    },
    {
      id: 'q2',
      text: '需要哪些质量项?',
      multiSelect: true,
      options: [
        { label: '测试', value: 'tests' },
        { label: '文档', value: 'docs' },
      ],
    },
  ],
});

run('单选 payload 使用 option value', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  answers[1] = toggleAnswerSelection(answers[1], 'tests', true);
  const payload = buildQuestionAnswerPayload(request, request.questions, answers);
  assert.deepEqual(payload.answers[0], { question_id: 'q1', selected: ['fix-bug'] });
});

run('多选 payload 保留多个选中值', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'add-feature', false);
  answers[1] = toggleAnswerSelection(answers[1], 'tests', true);
  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  const payload = buildQuestionAnswerPayload(request, request.questions, answers);
  assert.deepEqual(payload.answers[1], { question_id: 'q2', selected: ['tests', 'docs'] });
});

run('自定义答案 payload 写入 custom_text', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = setAnswerCustom(answers[0], '  其它需求  ');
  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  const payload = buildQuestionAnswerPayload(request, request.questions, answers);
  assert.deepEqual(payload.answers[0], {
    question_id: 'q1',
    selected: [],
    custom_text: '其它需求',
  });
});

run('单选改填其他时清除普通选项且仅提交自定义答案', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  answers[0] = setAnswerCustom(answers[0], '  独立自定义答案  ', false);
  assert.deepEqual(answers[0].selected, []);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: [],
    custom_text: '独立自定义答案',
  });
});

run('单选选中空白其他时立即清除普通选项并禁止推进(末题仍可提交)', () => {
  for (const custom of ['', '   ']) {
    const answers = makeInitialAnswers(request.questions);
    answers[0] = { ...toggleAnswerSelection(answers[0], 'fix-bug', false), custom };
    answers[0] = selectAnswerCustom(answers[0], false);
    answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
    assert.equal(answers[0].customSelected, true);
    assert.deepEqual(answers[0].selected, []);
    assert.equal(isQuestionAnswered(answers[0]), false);
    assert.equal(getNavigationState(0, request.questions, answers).canGoNext, false);
    // 末题即使未作答也始终可提交(整批一并记 Not answered)。
    assert.equal(getNavigationState(1, request.questions, answers).canSubmit, true);
  }
});

run('其他与普通单选互斥且切回其他保留草稿', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = setAnswerCustom(answers[0], '  自定义草稿  ');
  answers[0] = toggleAnswerSelection(answers[0], 'add-feature', false);
  assert.equal(answers[0].customSelected, false);
  assert.equal(answers[0].custom, '  自定义草稿  ');
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: ['add-feature'],
  });

  answers[0] = selectAnswerCustom(answers[0], false);
  assert.equal(answers[0].customSelected, true);
  assert.deepEqual(answers[0].selected, []);
  assert.equal(isQuestionAnswered(answers[0]), true);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: [],
    custom_text: '自定义草稿',
  });
});

run('未选中的自定义草稿不算回答也不进入 payload', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0].custom = '尚未选中的草稿';
  assert.equal(isQuestionAnswered(answers[0]), false);
  assert.equal(getNavigationState(0, request.questions, answers).canGoNext, false);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: [],
  });
});

run('清空其他文本后仍选中其他但不能借旧普通选项推进', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  answers[0] = setAnswerCustom(answers[0], '其他内容');
  answers[0] = setAnswerCustom(answers[0], '');
  assert.equal(answers[0].customSelected, true);
  assert.deepEqual(answers[0].selected, []);
  assert.equal(isQuestionAnswered(answers[0]), false);
  assert.equal(getNavigationState(0, request.questions, answers).canGoNext, false);
});

run('多选可组合普通选项和其他也可仅提交其他', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[1] = toggleAnswerSelection(answers[1], 'tests', true);
  answers[1] = selectAnswerCustom(answers[1], true);
  assert.deepEqual(answers[1].selected, ['tests']);
  answers[1] = setAnswerCustom(answers[1], '  性能检查  ', true);
  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  assert.equal(answers[1].customSelected, true);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[1], {
    question_id: 'q2',
    selected: ['tests', 'docs'],
    custom_text: '性能检查',
  });

  answers[1] = toggleAnswerSelection(answers[1], 'tests', true);
  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  assert.equal(isQuestionAnswered(answers[1]), true);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[1], {
    question_id: 'q2',
    selected: [],
    custom_text: '性能检查',
  });
});

run('取消 payload 不包含部分答案', () => {
  assert.deepEqual(buildQuestionCancelPayload(request), {
    request_id: 'req-1',
    session_id: 'sid-1',
    cancelled: true,
  });
});

run('未回答问题禁用推进;非末题不可提交,末题始终可提交', () => {
  const answers = makeInitialAnswers(request.questions);
  const state = getNavigationState(0, request.questions, answers);
  assert.equal(isQuestionAnswered(answers[0]), false);
  assert.equal(allQuestionsAnswered(request.questions, answers), false);
  assert.equal(state.canGoNext, false);
  assert.equal(state.canSubmit, false); // 非末题不可提交(首题)

  // 末题即使未答也始终可提交(一并记 Not answered)。
  assert.equal(getNavigationState(1, request.questions, answers).canSubmit, true);
});

run('答案卡片内有鼠标选区时保留选区', () => {
  const target = {};
  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ intersectsNode: (node) => node === target }),
  };
  assert.equal(hasSelectedTextWithin(target, selection), true);
  assert.equal(hasSelectedTextWithin({}, selection), false);
});

run('折叠选区不会阻止答案点击', () => {
  const selection = {
    isCollapsed: true,
    rangeCount: 1,
    getRangeAt: () => ({ intersectsNode: () => true }),
  };
  assert.equal(hasSelectedTextWithin({}, selection), false);
});

run('末题未作答也可提交(整批一并记 Not answered);作答后同样可提交', () => {
  const answers = makeInitialAnswers(request.questions);
  // 末题无论是否作答,canSubmit 恒为 true。
  assert.equal(getNavigationState(1, request.questions, answers).canSkip, false);
  assert.equal(getNavigationState(1, request.questions, answers).canSubmit, true);

  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  assert.equal(getNavigationState(1, request.questions, answers).canSubmit, true);
});

run('已作答后不再允许跳过', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  assert.equal(getNavigationState(0, request.questions, answers).canSkip, false);
});

run('跳过记为未作答并在 payload 带 not_answered', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = skipAnswer(answers[0]);
  assert.equal(isQuestionSkipped(answers[0]), true);
  assert.equal(isQuestionAnswered(answers[0]), false);
  const payload = buildQuestionAnswerPayload(request, request.questions, answers);
  assert.deepEqual(payload.answers[0], {
    question_id: 'q1',
    selected: [],
    not_answered: true,
  });
});

run('整批跳过(mask-all)末题统一收卷全部记 not_answered', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = skipAnswer(answers[0]);
  answers[1] = skipAnswer(answers[1]);
  const payload = buildQuestionAnswerPayload(request, request.questions, answers);
  assert.deepEqual(payload.answers[0], { question_id: 'q1', selected: [], not_answered: true });
  assert.deepEqual(payload.answers[1], { question_id: 'q2', selected: [], not_answered: true });
});

run('跳过被作答后视为已作答', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  assert.equal(isQuestionSkipped(answers[0]), false);
});

run('单选选中预设保留自定义草稿文字但不作为答案', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = setAnswerCustom(answers[0], '  独立草稿  ');
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  assert.equal(answers[0].custom, '  独立草稿  ');
  assert.equal(answers[0].customSelected, false);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: ['fix-bug'],
  });
});

run('取消自定义选中态保留草稿且不作为答案', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = setAnswerCustom(answers[0], '草稿');
  answers[0] = unselectAnswerCustom(answers[0]);
  assert.equal(answers[0].customSelected, false);
  assert.equal(isQuestionAnswered(answers[0]), false);
  assert.deepEqual(buildQuestionAnswerPayload(request, request.questions, answers).answers[0], {
    question_id: 'q1',
    selected: [],
  });
});

run('推荐项索引:优先推荐标记,否则回退第一个', () => {
  const withRec = { options: [
    { label: 'a' },
    { label: 'b', recommended: true },
    { label: 'c' },
  ] };
  assert.equal(recommendedOptionIndex(withRec), 1);
  assert.equal(recommendedOptionIndex({ options: [{ label: 'x' }] }), 0);
  assert.equal(recommendedOptionIndex({ options: [] }), -1);
});

run('题干汇总:选中项展示 label 并标记已作答', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = toggleAnswerSelection(answers[0], 'fix-bug', false);
  answers[1] = toggleAnswerSelection(answers[1], 'tests', true);
  answers[1] = toggleAnswerSelection(answers[1], 'docs', true);
  const summary = buildQuestionSummary(request.questions, answers);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].question, '你想做什么?');
  assert.equal(summary[0].answer, '修复 bug');
  assert.equal(summary[0].notAnswered, false);
  assert.equal(summary[1].answer, '测试、文档');
  assert.equal(summary[1].multiSelect, true);
});

run('题干汇总:自定义激活写入答案文本', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = setAnswerCustom(answers[0], '  其它需求  ');
  const summary = buildQuestionSummary(request.questions, answers);
  assert.equal(summary[0].answer, '其它需求');
  assert.equal(summary[0].notAnswered, false);
});

run('题干汇总:未作答/跳过标记 notAnswered', () => {
  const answers = makeInitialAnswers(request.questions);
  answers[0] = skipAnswer(answers[0]);
  const summary = buildQuestionSummary(request.questions, answers);
  assert.equal(summary[0].notAnswered, true);
  assert.equal(summary[0].answer, '');
});
