// Use the complete transcript, before optimistic messages, collapsing or
// windowing. A non-user tail must never be skipped to find an older user.
export function trailingUserMessageRetryId({
  sessionId = '', items = [], loadState = 'idle', busy = false,
  status = 'idle', streamingId = null, disabled = false,
} = {}) {
  if (!sessionId || loadState !== 'loaded' || disabled || busy ||
      status === 'running' || streamingId != null) return '';
  const tail = Array.isArray(items) ? items[items.length - 1] : null;
  if (tail?.kind !== 'msg' || tail.role !== 'user' || tail.streaming ||
      tail.queued || tail.metadata?.hidden_goal_context || tail.is_meta) return '';
  return typeof tail.messageId === 'string' ? tail.messageId.trim() : '';
}
