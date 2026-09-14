// Feedback is derived from durable question metadata, including renamed tools
// and history pages that no longer contain the original assistant call.
export function questionFeedbackForTool(entry) {
  if (entry?.isDone !== true) return null;
  const result = entry.askUserQuestionResult;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  if (result.cancelled === true) return { kind: 'cancel', items: [] };
  // 插话取消作答:用户没选项,而是直接输入了一条消息(紧跟其后的 user 气泡)。
  if (result.interjected === true) return { kind: 'interject', items: [] };
  if (entry.success === false) return null;
  const items = Array.isArray(result.items)
    ? result.items.filter((item) => item && typeof item === 'object'
      && !Array.isArray(item) && (item.question || item.answer))
    : [];
  return items.length > 0 ? { kind: 'submit', items } : null;
}

export function questionFeedbackForItem(item) {
  return item?.kind === 'tool' ? questionFeedbackForTool(item.tool) : null;
}
