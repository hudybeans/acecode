// Use the complete transcript, before optimistic messages, collapsing or
// windowing. Only an explicit, completed user stop may allow a non-user tail.
export function trailingUserMessageRetryId({
  sessionId = '', items = [], loadState = 'idle', busy = false,
  status = 'idle', streamingId = null, disabled = false, abortPending = false,
} = {}) {
  if (!sessionId || loadState !== 'loaded' || disabled || busy || abortPending ||
      status === 'running' || streamingId != null) return '';
  const transcript = Array.isArray(items) ? items : [];
  let tail = transcript[transcript.length - 1];
  if (tail?.kind === 'termination_notice' && tail.source === 'user' &&
      tail.metadata?.transcript_only === true && tail.metadata?.user_aborted === true) {
    const expectedId = tail.metadata.retry_user_message_id;
    if (typeof expectedId !== 'string' || !expectedId) return '';
    // The daemon binds this completed stop to the last real user message.
    // A later visible item invalidates the exception, including an error.
    tail = null;
    for (let i = transcript.length - 2; i >= 0; i -= 1) {
      if (transcript[i]?.kind === 'msg' && transcript[i].role === 'user') {
        tail = transcript[i];
        break;
      }
    }
    if (tail?.messageId !== expectedId) return '';
  }
  if (tail?.kind !== 'msg' || tail.role !== 'user' || tail.streaming ||
      tail.queued || tail.metadata?.hidden_goal_context || tail.is_meta) return '';
  return typeof tail.messageId === 'string' ? tail.messageId.trim() : '';
}
