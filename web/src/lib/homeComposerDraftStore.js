import { apiConnectionScope } from './api.js';
import { normalizeComposerContent } from './composerContent.js';
import {
  clearHomeComposerDraftIfMatch,
  homeComposerDraft,
  homeComposerDraftKey,
  updateHomeComposerDrafts,
} from './homeComposerDrafts.js';

export function homeComposerDraftPayload(value) {
  const content = normalizeComposerContent(value?.composer_content);
  return {
    text: typeof value === 'string' ? value : String(value?.text || ''),
    ...(content ? { composer_content: content } : {}),
  };
}

// App owns this controller so navigating away from ChatView never drops a
// pending save or the live File resources kept in the in-memory draft.
export function createHomeComposerDraftStore({
  onChange = () => {},
  schedule = setTimeout,
  cancel = clearTimeout,
  delay = 250,
} = {}) {
  const connections = new Map();
  let activeConnection;

  function connection(api) {
    const key = apiConnectionScope(api);
    if (!connections.has(key)) connections.set(key, { drafts: {}, entries: new Map() });
    return connections.get(key);
  }

  function entryFor(state, api, workspace) {
    const key = homeComposerDraftKey(workspace);
    if (!state.entries.has(key)) {
      state.entries.set(key, { api, workspace, version: 0, loadVersion: 0, dirty: null, pending: null, timer: null });
    }
    return state.entries.get(key);
  }

  function publish(state) {
    if (state === activeConnection) onChange(state.drafts);
  }

  function replace(state, workspace, value) {
    state.drafts = updateHomeComposerDrafts(state.drafts, workspace, value);
    publish(state);
  }

  function flushEntry(state, entry) {
    if (entry.timer !== null) cancel(entry.timer);
    entry.timer = null;
    if (!entry.dirty) return entry.pending || Promise.resolve(true);
    const operation = entry.dirty;
    const version = entry.version;
    entry.dirty = null;
    const previous = entry.pending || Promise.resolve(true);
    const save = previous.then(async () => {
      try {
        if (operation.clear) {
          const result = await entry.api.clearWorkspaceDraft(entry.workspace, operation.clear);
          if (entry.version === version && !result.cleared) replace(state, entry.workspace, result);
        } else {
          await entry.api.setWorkspaceDraft(entry.workspace, operation.value);
        }
        return true;
      } catch {
        // Preserve the latest operation for a later edit/navigation/lifecycle
        // retry. A failed older save must never replace a newer operation.
        if (entry.version === version) entry.dirty = operation;
        return false;
      }
    });
    entry.pending = save;
    void save.then(() => { if (entry.pending === save) entry.pending = null; });
    return save;
  }

  function isTransient(workspace) {
    return String(workspace).startsWith('__ai_theme__:');
  }

  return {
    read(api, workspace) {
      return homeComposerDraft(connection(api).drafts, workspace);
    },

    async load(api, workspace) {
      const state = connection(api);
      activeConnection = state;
      publish(state);
      const entry = entryFor(state, api, workspace);
      const version = entry.version;
      const loadVersion = ++entry.loadVersion;
      if (isTransient(workspace)) return homeComposerDraft(state.drafts, workspace);
      if (!await flushEntry(state, entry)) return homeComposerDraft(state.drafts, workspace);
      try {
        const stored = await api.getWorkspaceDraft(workspace);
        if (entry.version === version && entry.loadVersion === loadVersion && !entry.dirty && !entry.pending) {
          // Keep File/preview resources while the same structured draft is
          // still live. JSON storage contains only text and references.
          const current = homeComposerDraft(state.drafts, workspace);
          replace(state, workspace, { ...stored, attachments: current.attachments || [] });
        }
      } catch {
        // An unavailable backend must not erase the in-memory draft.
      }
      return homeComposerDraft(state.drafts, workspace);
    },

    update(api, workspace, value) {
      const state = connection(api);
      activeConnection = state;
      const next = updateHomeComposerDrafts(state.drafts, workspace, value);
      if (next === state.drafts) return;
      state.drafts = next;
      publish(state);
      const entry = entryFor(state, api, workspace);
      entry.version += 1;
      if (isTransient(workspace)) return;
      entry.dirty = { value: homeComposerDraftPayload(value) };
      if (entry.timer !== null) cancel(entry.timer);
      entry.timer = schedule(() => { void flushEntry(state, entry); }, delay);
    },

    accept(api, workspace, submitted) {
      const state = connection(api);
      const next = clearHomeComposerDraftIfMatch(state.drafts, workspace, submitted);
      if (next === state.drafts) return Promise.resolve(false);
      const entry = entryFor(state, api, workspace);
      // Finish the submitted autosave before matching its durable snapshot.
      void flushEntry(state, entry);
      state.drafts = next;
      publish(state);
      entry.version += 1;
      if (isTransient(workspace)) return Promise.resolve(true);
      entry.dirty = { clear: homeComposerDraftPayload(submitted) };
      return flushEntry(state, entry);
    },

    flush() {
      return Promise.all([...connections.values()].flatMap((state) => (
        [...state.entries.values()].map((entry) => flushEntry(state, entry))
      )));
    },
  };
}
