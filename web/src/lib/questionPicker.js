// AskUserQuestion picker 的纯逻辑 helper。
// 保持与 daemon question_answer 协议兼容,供 React 组件与 Node 单测复用。
// 覆盖单选/多选、自定义草稿与选中态分离、跳过(Not answered)、导航、
// 末题防误提交、Enter 目标优先级等规则。

function toText(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function optionValue(option, index) {
  const label = toText(option?.label, `Option ${index + 1}`);
  const value = option && option.value != null ? toText(option.value, label) : label;
  return { label, value };
}

export function normalizeQuestionRequest(request = {}) {
  const rawQuestions = Array.isArray(request.questions) ? request.questions : [];
  return {
    requestId: toText(request.request_id),
    sessionId: toText(request.session_id),
    questions: rawQuestions.map((q, qi) => {
      const text = toText(q?.text || q?.question || q?.header, `Question ${qi + 1}`);
      const options = Array.isArray(q?.options) ? q.options : [];
      return {
        id: toText(q?.id || q?.question || q?.text, text),
        text,
        header: toText(q?.header),
        multiSelect: !!q?.multiSelect,
        options: options.map((opt, oi) => {
          const normalized = optionValue(opt, oi);
          return {
            ...normalized,
            description: toText(opt?.description),
            recommended: !!opt?.recommended,
          };
        }),
      };
    }),
  };
}

export function makeInitialAnswers(questions = []) {
  // skipped:true 表示该题被用户显式跳过(Not answered)。
  return questions.map(() => ({ selected: [], custom: '', customSelected: false, skipped: false }));
}

export function isQuestionAnswered(answer = {}) {
  return (Array.isArray(answer.selected) && answer.selected.length > 0) ||
    (!!answer.customSelected && toText(answer.custom).trim().length > 0);
}

// 是否"未作答"(供按钮文案:未作答 -> 跳过/提交 判定、Not answered 标记)。
export function isQuestionSkipped(answer = {}) {
  return !!answer.skipped && !isQuestionAnswered(answer);
}

export function allQuestionsAnswered(questions = [], answers = []) {
  return questions.length > 0 && questions.every((_, index) => isQuestionAnswered(answers[index]));
}

// 推荐项优先级:带 recommended 标记的第一个选项;否则回退第一个选项。
export function recommendedOptionIndex(question = {}) {
  const options = Array.isArray(question.options) ? question.options : [];
  const first = options.find((opt) => opt.recommended);
  if (first) return options.findIndex((opt) => opt.recommended);
  return options.length > 0 ? 0 : -1;
}

export function getNavigationState(currentIndex, questions = [], answers = []) {
  const total = questions.length;
  const currentAnswered = isQuestionAnswered(answers[currentIndex]);
  const isLast = total > 0 && currentIndex >= total - 1;
  // 未作答且非末题时允许「跳过」。
  const canSkip = total > 0 && !currentAnswered && !isLast;
  return {
    total,
    current: total === 0 ? 0 : currentIndex + 1,
    isLast,
    currentAnswered,
    canSkip,
    // 末题提交需要 Ctrl+Enter 防误触:单按主按钮在非末题进下一题。
    // 末题始终可提交(即使整批未答/跳过,一并记 Not answered)。
    canSubmit: total > 0 && isLast,
    canGoPrev: currentIndex > 0,
    canGoNext: total > 0 && !isLast && currentAnswered,
    // 非末题提交(进下一题)需要已作答;末题提交需要已作答(由 canSubmit 决定)。
    canCommitCurrent: total > 0 && !isLast && currentAnswered,
  };
}

export function toggleAnswerSelection(answer = {}, value, multiSelect) {
  const selected = Array.isArray(answer.selected) ? answer.selected : [];
  const textValue = toText(value);
  if (!textValue) return { ...answer, selected };
  if (!multiSelect) {
    // 单选:选中该项并取消自定义选中态,保留自定义草稿文字(灰显、不进 payload)。
    return { ...answer, selected: [textValue], customSelected: false, skipped: false };
  }
  const hasValue = selected.includes(textValue);
  return {
    ...answer,
    selected: hasValue
      ? selected.filter((item) => item !== textValue)
      : [...selected, textValue],
    customSelected: answer.customSelected,
    skipped: false,
  };
}

export function selectAnswerCustom(answer = {}, multiSelect = false) {
  return {
    ...answer,
    selected: multiSelect && Array.isArray(answer.selected) ? answer.selected : [],
    customSelected: true,
    skipped: false,
  };
}

export function setAnswerCustom(answer = {}, custom, multiSelect = false) {
  // 输入非空时激活自定义;为空时仍保持选中态但视为未作答(见 isQuestionAnswered)。
  return { ...selectAnswerCustom(answer, multiSelect), custom: toText(custom) };
}

export function unselectAnswerCustom(answer = {}) {
  // 取消自定义选中态:保留草稿文字(灰显),不再作为答案。
  return { ...answer, customSelected: false };
}

export function skipAnswer(answer = {}) {
  return { ...answer, skipped: true };
}

export function hasSelectedTextWithin(target, selection) {
  if (!target || !selection || selection.isCollapsed || selection.rangeCount <= 0) return false;
  try {
    return selection.getRangeAt(0).intersectsNode(target);
  } catch {
    return false;
  }
}

export function buildQuestionAnswerPayload(request = {}, questions = [], answers = []) {
  const payload = {
    request_id: toText(request.requestId || request.request_id),
    session_id: toText(request.sessionId || request.session_id),
    answers: questions.map((q, index) => {
      const answer = answers[index] || {};
      const selected = Array.isArray(answer.selected)
        ? answer.selected.map((item) => toText(item)).filter(Boolean)
        : [];
      const out = {
        question_id: toText(q.id || q.question || q.text),
        selected,
      };
      const custom = answer.customSelected ? toText(answer.custom).trim() : '';
      if (custom) out.custom_text = custom;
      // 显式跳过的未答题不写入 selected/custom,只标记 not_answered。
      if (!isQuestionAnswered(answer) && answer.skipped) out.not_answered = true;
      return out;
    }),
  };
  if (!payload.session_id) delete payload.session_id;
  return payload;
}

export function buildQuestionSummary(questions = [], answers = []) {
  // 提交反馈展示用:逐题汇总题干与答案。未作答/跳过的题标记 not_answered。
  return questions.map((q, index) => {
    const answer = answers[index] || {};
    const selected = (Array.isArray(answer.selected) ? answer.selected : [])
      .map((item) => toText(item));
    const chosen = selected.map((value) => {
      const option = (Array.isArray(q.options) ? q.options : []).find((opt) => toText(opt?.value) === value);
      return option ? toText(option.label, value) : value;
    });
    const custom = answer.customSelected ? toText(answer.custom).trim() : '';
    if (custom) chosen.push(custom);
    const answered = isQuestionAnswered(answer);
    return {
      question: toText(q.text),
      multiSelect: !!q.multiSelect,
      answer: answered ? chosen.filter(Boolean).join('、') : '',
      notAnswered: !answered,
    };
  });
}

export function buildQuestionCancelPayload(request = {}) {
  const payload = {
    request_id: toText(request.requestId || request.request_id),
    session_id: toText(request.sessionId || request.session_id),
    cancelled: true,
  };
  if (!payload.session_id) delete payload.session_id;
  return payload;
}