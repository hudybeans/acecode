import { sessionRefFromJumpTarget } from './sessionJump.js';

const STATUSES = new Set(['pending', 'queued', 'starting', 'started', 'failed', 'dismissed']);
const KINDS = new Set(['side_task', 'context_handoff']);
export const SUGGESTION_POLL_INTERVAL_MS = 3000;
export const SUGGESTION_DISMISS_DELAY_MS = 30_000;

export function normalizeTaskSuggestion(raw, sourceSessionId) {
  if (!raw || typeof raw !== 'object' || !raw.id || !KINDS.has(raw.kind) || !STATUSES.has(raw.status)) return null;
  if (raw.source_session_id && raw.source_session_id !== sourceSessionId) return null;
  return {
    ...raw,
    id: String(raw.id),
    title: String(raw.title || ''),
    description: String(raw.description || raw.summary || ''),
    error: String(raw.error || ''),
  };
}

export function suggestionTargetRef(suggestion, sourceRef = {}) {
  const target = suggestion?.target_session || {};
  const sessionId = target.id || target.session_id || suggestion?.target_session_id;
  if (!sessionId) return null;
  // A new task never inherits source search matches, drafts or remote bindings.
  const fallback = {
    port: sourceRef.port,
    token: sourceRef.token,
    workspaceHash: sourceRef.workspaceHash || sourceRef.workspace_hash,
    noWorkspace: sourceRef.noWorkspace || sourceRef.no_workspace,
    cwd: sourceRef.cwd,
    workingCwd: sourceRef.workingCwd || sourceRef.working_cwd,
  };
  return sessionRefFromJumpTarget({
    ...target,
    sessionId,
    workingCwd: target.workingCwd || target.working_cwd || suggestion?.target_working_cwd,
  }, {}, fallback);
}

export function createTaskSuggestionsController({
  api,
  sessionId,
  busy = false,
  onChange = () => {},
  onStarted = () => {},
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  now = Date.now,
  pollIntervalMs = SUGGESTION_POLL_INTERVAL_MS,
}) {
  let snapshot = {
    suggestions: [], sourceBusy: !!busy, workspaceBusy: !!busy,
    worktreeAvailable: false, unsupported: false, pending: {}, errors: {}, errorActions: {}, refreshError: '',
    dismissDeadlines: {},
  };
  let disposed = false;
  let timer = null;
  let readInFlight = false;
  let readAbort = null;
  let readFailures = 0;
  let revision = 0;
  let refreshRequested = false;
  let sourceBusy = !!busy;
  const actions = new Map();
  const acceptedHandoffs = new Set();
  const announced = new Set();
  const countdowns = new Map();
  const stoppedCountdowns = new Set();

  function syncCountdowns() {
    const eligible = new Set(snapshot.suggestions
      .filter((item) => item.status === 'pending' && !snapshot.pending[item.id]
        && !snapshot.errors[item.id] && !item.error && !stoppedCountdowns.has(item.id))
      .map((item) => item.id));
    for (const [id, countdown] of countdowns) {
      if (eligible.has(id)) continue;
      clearTimer(countdown.timer);
      countdowns.delete(id);
      stoppedCountdowns.add(id);
    }
    for (const id of eligible) {
      if (countdowns.has(id)) continue;
      const deadline = now() + SUGGESTION_DISMISS_DELAY_MS;
      const expire = () => {
        if (disposed || !countdowns.has(id)) return;
        const remaining = deadline - now();
        if (remaining > 0) {
          countdowns.get(id).timer = setTimer(expire, remaining);
          return;
        }
        // Use the same serialized action path as the close button. Starting an
        // action removes this deadline synchronously, before its request runs.
        stoppedCountdowns.add(id);
        void mutate(id, 'dismiss');
      };
      countdowns.set(id, { deadline, timer: setTimer(expire, SUGGESTION_DISMISS_DELAY_MS) });
    }
    snapshot.dismissDeadlines = Object.fromEntries(
      [...countdowns].map(([id, countdown]) => [id, countdown.deadline]),
    );
  }

  function publish(patch) {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    syncCountdowns();
    onChange(snapshot);
  }

  function clearPoll() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule(force = false) {
    clearPoll();
    if (disposed || snapshot.unsupported || actions.size || readFailures >= 3) return;
    const active = sourceBusy || snapshot.sourceBusy || snapshot.workspaceBusy || readFailures > 0
      || snapshot.suggestions.some((item) => item.status === 'queued' || item.status === 'starting');
    if (!force && !active) return;
    timer = setTimer(() => { timer = null; void refresh(); }, force ? 0 : pollIntervalMs);
  }

  function reportStarted(suggestions) {
    for (const suggestion of suggestions) {
      if (suggestion.status !== 'started' || announced.has(suggestion.id)) continue;
      announced.add(suggestion.id);
      onStarted(suggestion, { continueInTarget: acceptedHandoffs.delete(suggestion.id) });
    }
  }

  async function refresh() {
    if (disposed || snapshot.unsupported) return;
    if (readInFlight || actions.size) { refreshRequested = true; return; }
    clearPoll();
    readInFlight = true;
    refreshRequested = false;
    const requestRevision = revision;
    readAbort = new AbortController();
    try {
      const result = await api.listTaskSuggestions(sessionId, { signal: readAbort.signal });
      if (disposed || requestRevision !== revision) return;
      readFailures = 0;
      const suggestions = (Array.isArray(result?.suggestions) ? result.suggestions : [])
        .map((item) => normalizeTaskSuggestion(item, sessionId))
        .filter((item) => item && item.status !== 'dismissed');
      const errors = { ...snapshot.errors };
      for (const item of suggestions) {
        if (snapshot.errorActions[item.id] === 'accept'
          && ['queued', 'starting', 'started'].includes(item.status)) delete errors[item.id];
      }
      publish({
        suggestions,
        errors,
        sourceBusy: !!result?.source_busy,
        workspaceBusy: !!result?.workspace_busy,
        worktreeAvailable: result?.worktree_available === true,
        refreshError: '',
      });
      reportStarted(suggestions);
    } catch (error) {
      if (disposed || requestRevision !== revision) return;
      const missingRoute = error?.status === 404
        && !(error?.body && typeof error.body === 'object' && error.body.error);
      if (missingRoute || error?.status === 405) {
        publish({ unsupported: true, suggestions: [] });
      } else if (error?.name !== 'AbortError') {
        readFailures += 1;
        if (readFailures >= 3) publish({ refreshError: String(error?.message || error) });
      }
    } finally {
      readInFlight = false;
      readAbort = null;
      schedule(refreshRequested);
    }
  }

  function mutate(id, action, location) {
    if (disposed || snapshot.unsupported) return Promise.resolve(null);
    if (actions.has(id)) return actions.get(id);
    const original = snapshot.suggestions.find((item) => item.id === id);
    if (!original || original.status === 'starting') return Promise.resolve(null);
    if (action === 'accept' && !['pending', 'failed'].includes(original.status)) return Promise.resolve(null);
    revision += 1;
    clearPoll();
    if (action === 'accept' && original.kind === 'context_handoff') acceptedHandoffs.add(id);
    publish({ pending: { ...snapshot.pending, [id]: action }, errors: { ...snapshot.errors, [id]: '' } });
    // Defer the request so the guard is installed before synchronous adapters run.
    const request = Promise.resolve().then(async () => {
      try {
        const result = action === 'accept'
          ? await api.acceptTaskSuggestion(sessionId, id, location)
          : await api.dismissTaskSuggestion(sessionId, id);
        if (disposed) return null;
        const suggestion = normalizeTaskSuggestion(result?.suggestion, sessionId);
        if (!suggestion) throw new Error('Invalid suggestion response');
        revision += 1;
        const suggestions = snapshot.suggestions
          .map((item) => item.id === id ? suggestion : item)
          .filter((item) => item.status !== 'dismissed');
        publish({ suggestions });
        if (action === 'dismiss') acceptedHandoffs.delete(id);
        reportStarted(suggestions);
        return suggestion;
      } catch (error) {
        if (!disposed) {
          publish({
            errors: { ...snapshot.errors, [id]: String(error?.message || error) },
            errorActions: { ...snapshot.errorActions, [id]: action },
          });
        }
        return null;
      } finally {
        actions.delete(id);
        if (!disposed) {
          const pending = { ...snapshot.pending };
          delete pending[id];
          publish({ pending });
          readFailures = 0;
          void refresh();
        }
      }
    });
    actions.set(id, request);
    return request;
  }

  return {
    getSnapshot: () => snapshot,
    refresh,
    retryRefresh() { readFailures = 0; return refresh(); },
    setBusy(value) {
      if (sourceBusy === !!value || disposed) return;
      sourceBusy = !!value;
      readFailures = 0;
      void refresh();
    },
    accept: (id, location) => mutate(id, 'accept', location),
    dismiss: (id) => mutate(id, 'dismiss'),
    dispose() {
      disposed = true;
      clearPoll();
      for (const countdown of countdowns.values()) clearTimer(countdown.timer);
      countdowns.clear();
      readAbort?.abort();
    },
  };
}
