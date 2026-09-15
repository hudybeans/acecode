export const SIDE_CHAT_QUESTION_MAX_BYTES = 16000;
export const SIDE_CHAT_HISTORY_MAX_BYTES = 256 * 1024;
export const SIDE_CHAT_HISTORY_MAX_MESSAGES = 200;

const utf8 = new TextEncoder();
let requestSequence = 0;

function initialSnapshot() {
  return { open: false, turns: [], draft: '', busy: false, stopping: false };
}

function historyFromTurns(turns) {
  return turns.flatMap((turn) => (
    (turn.status === 'success' || turn.status === 'stopped') && turn.answer.trim()
      ? [{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]
      : []
  ));
}

function validationError(question, history) {
  if (utf8.encode(question).length > SIDE_CHAT_QUESTION_MAX_BYTES) {
    return { code: 'SIDE_CHAT_QUESTION_TOO_LONG', message: '问题过长，请缩短后重试。' };
  }
  if (history.length > SIDE_CHAT_HISTORY_MAX_MESSAGES
      || history.reduce((bytes, message) => bytes + utf8.encode(message.content).length, 0) > SIDE_CHAT_HISTORY_MAX_BYTES) {
    return { code: 'SIDE_CHAT_HISTORY_TOO_LONG', message: '旁路聊天记录过长，无法继续发送。' };
  }
  return null;
}

// State ownership stays outside React so submitting, stopping and session
// changes cannot race stale render closures or late transport callbacks.
export function createSideChatController({ startStream } = {}) {
  if (typeof startStream !== 'function') throw new TypeError('startStream is required');
  const listeners = new Set();
  let snapshot = initialSnapshot();
  let active = null;

  function publish(patch) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function updateTurn(request, patch, statePatch = {}) {
    publish({
      ...statePatch,
      turns: snapshot.turns.map((turn) => turn.id === request.id ? { ...turn, ...patch } : turn),
    });
  }

  function finish(request, patch) {
    if (active !== request) return;
    active = null;
    request.handle?.dispose();
    updateTurn(request, patch, { busy: false, stopping: false });
  }

  function cancelImmediately() {
    if (!active) return;
    const request = active;
    // Invalidate first: even a synchronous stop acknowledgement is stale.
    active = null;
    try { request.handle?.stop(); }
    finally { request.handle?.dispose(); }
    updateTurn(request, { status: 'stopped' }, { busy: false, stopping: false });
  }

  const controller = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() { return snapshot; },
    open() { publish({ open: true }); },
    setDraft(draft) {
      if (snapshot.busy) return false;
      publish({ draft: String(draft ?? '') });
      return true;
    },
    submit(question = snapshot.draft) {
      if (active || snapshot.busy) return false;
      const text = String(question ?? '').trim();
      if (!text) return false;
      const history = historyFromTurns(snapshot.turns);
      const error = validationError(text, history);
      const id = `side-${Date.now().toString(36)}-${++requestSequence}`;
      const turn = { id, question: text, answer: '', status: error ? 'error' : 'loading', error: error?.message || '', errorCode: error?.code || '' };
      if (error) {
        publish({ open: true, turns: [...snapshot.turns, turn] });
        return false;
      }
      const request = { id, handle: null };
      active = request;
      publish({ open: true, turns: [...snapshot.turns, turn], draft: '', busy: true, stopping: false });
      // A subscriber can close/reset during publication.
      if (active !== request) return true;
      try {
        const handle = startStream({
          requestId: id,
          question: text,
          history,
          onDelta(delta) {
            if (active !== request || typeof delta !== 'string') return;
            const current = snapshot.turns.find((item) => item.id === id);
            updateTurn(request, { answer: current.answer + delta, status: 'streaming' });
          },
          onReset() {
            if (active === request) updateTurn(request, { answer: '', status: 'loading' });
          },
          onDone(result = {}) {
            if (active !== request) return;
            const current = snapshot.turns.find((item) => item.id === id);
            const finalAnswer = typeof result.answer === 'string' ? result.answer : current.answer;
            const answer = result.cancelled && !finalAnswer ? current.answer : finalAnswer;
            if (!result.cancelled && !answer.trim()) {
              finish(request, { status: 'error', error: '旁路聊天未返回内容，请重试。', errorCode: 'SIDE_CHAT_EMPTY_RESPONSE' });
              return;
            }
            const patch = { status: result.cancelled ? 'stopped' : 'success' };
            patch.answer = answer;
            finish(request, patch);
          },
          onError(error) {
            finish(request, {
              status: 'error',
              error: typeof error === 'string' ? error : String(error?.message || '旁路聊天请求失败，请重试。'),
              errorCode: String(error?.code || 'SIDE_CHAT_ERROR'),
            });
          },
        });
        request.handle = handle;
        // A constructor can report a failure before returning its handle.
        if (active !== request) handle?.dispose();
        else if (snapshot.stopping) handle?.stop();
      } catch (error) {
        finish(request, { status: 'error', error: String(error?.message || '旁路聊天请求失败，请重试。'), errorCode: 'SIDE_CHAT_ERROR' });
      }
      return true;
    },
    stop() {
      if (!active || snapshot.stopping) return false;
      const request = active;
      publish({ stopping: true });
      if (active === request) {
        try { request.handle?.stop(); }
        catch { finish(request, { status: 'stopped' }); }
      }
      return true;
    },
    close() {
      cancelImmediately();
      publish({ open: false });
    },
    reset() {
      cancelImmediately();
      publish(initialSnapshot());
    },
    dispose() {
      cancelImmediately();
      listeners.clear();
      snapshot = initialSnapshot();
    },
  };
  return controller;
}
