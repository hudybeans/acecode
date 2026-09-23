import assert from 'node:assert/strict';
import { workspaceDraftPath, workspaceDraftRequestOptions } from './api.js';
import { createHomeComposerDraftStore, homeComposerDraftPayload } from './homeComposerDraftStore.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function backend() {
  const drafts = new Map();
  const calls = [];
  return {
    drafts, calls,
    async getWorkspaceDraft(key) { calls.push(['get', key]); return structuredClone(drafts.get(key) || { text: '' }); },
    async setWorkspaceDraft(key, value) { calls.push(['put', key, value]); drafts.set(key, structuredClone(value)); },
    async clearWorkspaceDraft(key, expected) {
      calls.push(['clear', key, expected]);
      const cleared = JSON.stringify(drafts.get(key)) === JSON.stringify(expected);
      if (cleared) drafts.set(key, { text: '' });
      return { ...(drafts.get(key) || { text: '' }), cleared };
    },
  };
}

function fixture() {
  const timers = new Map();
  let sequence = 0;
  const snapshots = [];
  const store = createHomeComposerDraftStore({
    schedule(fn) { timers.set(++sequence, fn); return sequence; },
    cancel(id) { timers.delete(id); },
    onChange(value) { snapshots.push(value); },
  });
  return { store, timers, snapshots };
}

async function run(name, fn) {
  await fn();
  console.log(`[pass] ${name}`);
}

await run('workspace draft routes use a canonical workspace and distinct no-workspace endpoint', () => {
  assert.equal(workspaceDraftPath('abc'), '/api/workspaces/abc/draft');
  assert.equal(workspaceDraftPath(''), '/api/workspaces/__no_workspace__/draft');
  assert.equal(workspaceDraftPath('a/b'), '/api/workspaces/a%2Fb/draft');
});

await run('large UTF-8 drafts bypass the fetch keepalive body limit', () => {
  assert.equal(workspaceDraftRequestOptions({ text: 'draft' }).keepalive, true);
  assert.equal(workspaceDraftRequestOptions({ text: 'x'.repeat(70_000) }).keepalive, false);
  assert.equal(workspaceDraftRequestOptions({ text: '字'.repeat(22_000) }).keepalive, false);
});

await run('new-session drafts survive controller recreation and stay isolated by workspace', async () => {
  const api = backend();
  const { store, timers } = fixture();
  store.update(api, 'a', 'first');
  store.update(api, 'a', 'latest\n多行草稿');
  store.update(api, 'b', 'other');
  store.update(api, '', 'no workspace');
  assert.equal(timers.size, 3);
  await store.flush();
  assert.equal(timers.size, 0);
  assert.equal(api.calls.filter(([kind, key]) => kind === 'put' && key === 'a').length, 1);
  const reopened = fixture().store;
  assert.equal((await reopened.load(api, 'a')).text, 'latest\n多行草稿');
  assert.equal((await reopened.load(api, 'b')).text, 'other');
  assert.equal((await reopened.load(api, '')).text, 'no workspace');
  store.update(api, 'a', '');
  await store.flush();
  assert.equal((await reopened.load(api, 'a')).text, '');
  assert.equal((await reopened.load(api, 'b')).text, 'other');
});

await run('late hydration preserves user edits and newer hydration responses', async () => {
  const api = backend();
  const old = deferred();
  api.getWorkspaceDraft = () => old.promise;
  const { store } = fixture();
  const loading = store.load(api, 'a');
  await Promise.resolve();
  store.update(api, 'a', 'typed while loading');
  old.resolve({ text: 'old disk value' });
  assert.equal((await loading).text, 'typed while loading');
  await store.flush();

  const first = deferred(), second = deferred();
  let count = 0;
  api.getWorkspaceDraft = () => (++count === 1 ? first.promise : second.promise);
  const load1 = store.load(api, 'a');
  await Promise.resolve();
  const load2 = store.load(api, 'a');
  await Promise.resolve();
  second.resolve({ text: 'newer response' });
  await load2;
  first.resolve({ text: 'older response' });
  await load1;
  assert.equal(store.read(api, 'a').text, 'newer response');
});

await run('autosaves are serialized so an older response cannot overwrite a later draft', async () => {
  const api = backend();
  const first = deferred();
  const write = api.setWorkspaceDraft.bind(api);
  api.setWorkspaceDraft = async (key, value) => {
    if (value.text === 'first') await first.promise;
    return write(key, value);
  };
  const { store } = fixture();
  store.update(api, 'a', 'first');
  const save1 = store.flush();
  await Promise.resolve();
  store.update(api, 'a', 'second');
  const save2 = store.flush();
  assert.equal(api.calls.length, 0);
  first.resolve();
  await Promise.all([save1, save2]);
  assert.equal(api.drafts.get('a').text, 'second');
  assert.equal(store.read(api, 'a').text, 'second');
});

await run('failed saves retain the draft and retry on re-entry', async () => {
  const api = backend();
  const write = api.setWorkspaceDraft.bind(api);
  api.setWorkspaceDraft = async () => { throw new Error('offline'); };
  const { store } = fixture();
  store.update(api, 'a', 'unsaved');
  assert.deepEqual(await store.flush(), [false]);
  assert.equal((await store.load(api, 'a')).text, 'unsaved');
  assert.equal(api.calls.length, 0, 'failed persistence must not hydrate stale disk state');
  api.setWorkspaceDraft = write;
  await store.load(api, 'a');
  assert.equal(api.drafts.get('a').text, 'unsaved');
});

await run('successful submission flushes its pending save and clears only that workspace', async () => {
  const api = backend();
  const { store } = fixture();
  store.update(api, 'a', 'submitted');
  store.update(api, 'b', 'keep');
  assert.equal(await store.accept(api, 'a', { text: 'submitted' }), true);
  await store.flush();
  const reopened = fixture().store;
  assert.equal((await reopened.load(api, 'a')).text, '');
  assert.equal((await reopened.load(api, 'b')).text, 'keep');
});

await run('late send receipts preserve newer local drafts and other-window drafts', async () => {
  const api = backend();
  const { store } = fixture();
  store.update(api, 'a', 'submitted');
  await store.flush();
  store.update(api, 'a', 'new input');
  assert.equal(await store.accept(api, 'a', { text: 'submitted' }), false);
  await store.flush();
  assert.equal(api.drafts.get('a').text, 'new input');
  api.drafts.set('a', { text: 'edited in another window' });
  await store.accept(api, 'a', { text: 'new input' });
  assert.equal(store.read(api, 'a').text, 'edited in another window');
  assert.equal(api.drafts.get('a').text, 'edited in another window');
});

await run('a failed matching clear is retried without erasing an intervening remote draft', async () => {
  const api = backend();
  const clear = api.clearWorkspaceDraft.bind(api);
  api.clearWorkspaceDraft = async () => { throw new Error('offline'); };
  const { store } = fixture();
  store.update(api, 'a', 'submitted');
  assert.equal(await store.accept(api, 'a', { text: 'submitted' }), false);
  api.drafts.set('a', { text: 'new remote draft' });
  api.clearWorkspaceDraft = clear;
  await store.flush();
  assert.equal(api.drafts.get('a').text, 'new remote draft');
});

await run('new input written during a pending clear wins after the clear completes', async () => {
  const api = backend();
  const gate = deferred();
  const clear = api.clearWorkspaceDraft.bind(api);
  api.clearWorkspaceDraft = async (...args) => { await gate.promise; return clear(...args); };
  const { store } = fixture();
  store.update(api, 'a', 'submitted');
  const accepted = store.accept(api, 'a', { text: 'submitted' });
  store.update(api, 'a', 'next prompt');
  const saved = store.flush();
  gate.resolve();
  await Promise.all([accepted, saved]);
  assert.equal(api.drafts.get('a').text, 'next prompt');
  assert.equal(store.read(api, 'a').text, 'next prompt');
});

await run('structured drafts persist references and retain live File resources only in memory', async () => {
  const api = backend();
  const { store } = fixture();
  const file = { name: 'file.txt' };
  const content = { version: 1, parts: [
    { type: 'text', text: 'review ' },
    { type: 'attachment', key: 'local-1', name: 'file.txt', kind: 'file' },
  ] };
  const draft = { text: 'review ', composer_content: content, attachments: [{ local_id: 'local-1', file }] };
  store.update(api, 'a', draft);
  await store.flush();
  await store.load(api, 'a');
  assert.equal(store.read(api, 'a').attachments[0].file, file);
  assert.deepEqual(api.drafts.get('a'), homeComposerDraftPayload(draft));
  assert.equal(api.drafts.get('a').attachments, undefined);
  assert.deepEqual((await fixture().store.load(api, 'a')).composer_content, homeComposerDraftPayload(draft).composer_content);
});

await run('connection scopes and isolated AI-theme prompts never share durable draft state', async () => {
  const first = backend(), second = backend();
  const { store } = fixture();
  store.update(first, 'a', 'first server');
  store.update(second, 'a', 'second server');
  store.update(first, '__ai_theme__:a', 'theme prompt');
  await store.flush();
  assert.equal((await store.load(first, 'a')).text, 'first server');
  assert.equal((await store.load(second, 'a')).text, 'second server');
  assert.equal((await store.load(first, '__ai_theme__:a')).text, 'theme prompt');
  assert.equal(first.drafts.has('__ai_theme__:a'), false);
});
