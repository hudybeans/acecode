import assert from 'node:assert/strict';
import { createUnsavedFileGuard, runAfterFileApproval } from './unsavedFileGuard.js';
import { openFileTab, updateFileTabDraft, discardFileTabDraft, visiblePreviewTabs } from './previewTabs.js';

const context = { scopeKey: 'workspace', sessionId: 'a' };
function fixture() {
  let state = openFileTab({}, { ...context, cwd: '/project', path: 'a.txt' });
  const key = visiblePreviewTabs(state, context)[0].key;
  state = updateFileTabDraft(state, { scopeKey: context.scopeKey, tabKey: key,
    patch: { baselineText: 'disk', text: 'edit', readId: 'read-1' } });
  let dialog;
  let writes = 0;
  let navigation = 0;
  const guard = createUnsavedFileGuard((next) => { dialog = next; });
  const discard = (tabs) => {
    for (const tab of tabs) state = discardFileTabDraft(state, { scopeKey: context.scopeKey, tabKey: tab.key });
  };
  const options = {
    getTabs: () => visiblePreviewTabs(state, context), discard,
    save: async (tabs) => {
      writes += 1;
      for (const tab of tabs) state = updateFileTabDraft(state, {
        scopeKey: context.scopeKey, tabKey: tab.key,
        patch: { baselineText: tab.edit.text, text: tab.edit.text, readId: 'read-2' },
      });
    },
  };
  return { guard, options, get dialog() { return dialog; }, get writes() { return writes; },
    get navigation() { return navigation; }, navigate: () => { navigation += 1; return true; } };
}

{
  const f = fixture();
  const result = runAfterFileApproval(f.guard.request(f.options), f.navigate);
  assert.equal(f.navigation, 0);
  await f.guard.choose('cancel');
  assert.equal(await result, false);
  assert.equal(f.navigation, 0);
  assert.equal(f.options.getTabs()[0].edit.text, 'edit');
  assert.equal(f.writes, 0);
}
{
  const f = fixture();
  const result = runAfterFileApproval(f.guard.request(f.options), f.navigate);
  await f.guard.choose('discard');
  assert.equal(await result, true);
  assert.equal(f.navigation, 1);
  assert.equal(f.options.getTabs()[0].edit.text, 'disk');
  assert.equal(f.writes, 0);
  assert.equal(f.guard.request(f.options), true);
}
{
  const f = fixture();
  const result = runAfterFileApproval(f.guard.request(f.options), f.navigate);
  await f.guard.choose('save');
  assert.equal(await result, true);
  assert.equal(f.writes, 1);
  assert.equal(f.navigation, 1);
  assert.equal(f.options.getTabs()[0].edit.baselineText, 'edit');
  assert.equal(f.guard.request(f.options), true);
}
{
  const f = fixture();
  let fail = true;
  const options = { ...f.options, save: async (tabs) => {
    if (fail) throw new Error('file changed');
    return f.options.save(tabs);
  } };
  const result = runAfterFileApproval(f.guard.request(options), f.navigate);
  await f.guard.choose('save');
  assert.equal(f.navigation, 0);
  assert.equal(f.dialog.error, 'file changed');
  assert.equal(f.dialog.saving, false);
  assert.equal(f.options.getTabs()[0].edit.text, 'edit');
  fail = false;
  await f.guard.choose('save');
  assert.equal(await result, true);
  assert.equal(f.navigation, 1);
}
{
  const f = fixture();
  let release;
  const result = runAfterFileApproval(f.guard.request({ ...f.options,
    save: () => new Promise((resolve) => { release = resolve; }),
  }), f.navigate);
  const saving = f.guard.choose('save');
  assert.equal(f.dialog.saving, true);
  assert.equal(f.guard.request(f.options), false);
  await f.guard.choose('discard');
  await f.guard.choose('cancel');
  assert.equal(f.navigation, 0);
  f.guard.cancelPending();
  assert.equal(await result, false);
  release();
  await saving;
  assert.equal(f.navigation, 0);
  assert.equal(f.dialog, null);
}
console.log('unsavedFileGuard: cancel, discard, save, retry and pending navigation checks passed');
