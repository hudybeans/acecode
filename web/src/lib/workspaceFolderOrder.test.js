import assert from 'node:assert/strict';
import {
  applyWorkspaceFolderOrder,
  createWorkspaceFolderOrderController,
  reorderWorkspaceFolders,
  workspaceFolderDropTarget,
} from './workspaceFolderOrder.js';

const folders = ['alpha', 'beta', 'gamma'].map((hash) => ({ hash, name: hash, sessions: [hash] }));
const hashes = (workspaces) => workspaces.map((workspace) => workspace.hash);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(initial = folders) {
  let workspaces = initial;
  const requests = [];
  const errors = [];
  const savingChanges = [];
  const writes = [];
  const controller = createWorkspaceFolderOrderController({
    getWorkspaces: () => workspaces,
    setWorkspaces(next) { workspaces = next; writes.push(next); },
    save(order) {
      const request = { hashes: order, ...deferred() };
      requests.push(request);
      return request.promise;
    },
    onError: (error) => errors.push(error),
    onSavingChange: (saving) => savingChanges.push(saving),
  });
  return { controller, requests, errors, savingChanges, writes, current: () => workspaces };
}

// Whole groups move by identity, carrying their sessions and metadata unchanged.
const upward = reorderWorkspaceFolders(folders, 'gamma', 'alpha');
assert.deepEqual(hashes(upward), ['gamma', 'alpha', 'beta']);
assert.equal(upward[0], folders[2]);
assert.equal(upward[0].sessions, folders[2].sessions);
const downward = reorderWorkspaceFolders(folders, 'alpha', 'gamma', 'after');
assert.deepEqual(hashes(downward), ['beta', 'gamma', 'alpha']);
assert.equal(downward[2], folders[0]);
assert.deepEqual(hashes(folders), ['alpha', 'beta', 'gamma']);
for (const [source, target, placement] of [
  ['alpha', 'alpha', 'before'], ['alpha', 'beta', 'before'], ['beta', 'alpha', 'after'],
  ['missing', 'beta', 'before'], ['alpha', 'missing', 'after'], ['alpha', 'gamma', 'invalid'],
]) assert.equal(reorderWorkspaceFolders(folders, source, target, placement), folders);
const duplicateFolders = [folders[0], folders[0], folders[1]];
assert.equal(reorderWorkspaceFolders(duplicateFolders, 'alpha', 'beta'), duplicateFolders);
const empty = [];
assert.equal(reorderWorkspaceFolders(empty, 'alpha', 'beta'), empty);

// Unknown/duplicate saved hashes are ignored; new folders append in their current order.
const latest = [
  { hash: 'beta', name: 'renamed beta' }, { hash: 'delta', name: 'new folder' },
  { hash: 'gamma', name: 'renamed gamma' }, { hash: 'epsilon', name: 'new folder 2' },
];
const applied = applyWorkspaceFolderOrder(latest, ['alpha', 'gamma', 'gamma', 'beta']);
assert.deepEqual(hashes(applied), ['gamma', 'beta', 'delta', 'epsilon']);
assert.equal(applied[0], latest[2]);
assert.equal(applied[1], latest[0]);
assert.equal(applyWorkspaceFolderOrder(latest, ['beta', 'delta', 'gamma', 'epsilon']), latest);
assert.equal(applyWorkspaceFolderOrder(latest, []), latest);
assert.equal(applyWorkspaceFolderOrder(latest, null), latest);

// Use the full expanded group, not just the heading, for upper/lower targets.
const rows = [{ hash: 'alpha', top: 20, bottom: 220 }, { hash: 'beta', top: 230, bottom: 270 }];
const bounds = { left: 10, right: 310, top: 10, bottom: 300 };
for (const y of [10, 20, 60, 119]) {
  assert.deepEqual(workspaceFolderDropTarget(rows, bounds, 50, y), { hash: 'alpha', placement: 'before' });
}
for (const y of [120, 180, 220]) {
  assert.deepEqual(workspaceFolderDropTarget(rows, bounds, 50, y), { hash: 'alpha', placement: 'after' });
}
for (const y of [225, 230, 249]) {
  assert.deepEqual(workspaceFolderDropTarget(rows, bounds, 50, y), { hash: 'beta', placement: 'before' });
}
for (const y of [250, 270, 300]) {
  assert.deepEqual(workspaceFolderDropTarget(rows, bounds, 50, y), { hash: 'beta', placement: 'after' });
}
for (const [x, y] of [[9, 30], [311, 30], [50, 9], [50, 301], [NaN, 30], [50, Infinity]]) {
  assert.equal(workspaceFolderDropTarget(rows, bounds, x, y), null);
}
assert.equal(workspaceFolderDropTarget([], bounds, 50, 30), null);
assert.equal(workspaceFolderDropTarget(rows, null, 50, 30), null);

// Ordinary refreshes accept server order and metadata without rebuilding objects.
{
  const state = setup();
  const next = [...folders].reverse();
  assert.equal(state.controller.acceptRefresh(next, state.controller.captureRefresh()), next);
  assert.equal(state.current(), next);
}

// Invalid, incomplete, duplicate and no-op submissions neither write nor save.
{
  const state = setup();
  const token = state.controller.captureRefresh();
  for (const next of [null, [], folders, [...folders], folders.slice(1),
    [folders[0], folders[0], folders[1]], [folders[0], folders[1], { hash: 'unknown' }],
    [folders[0], folders[1], {}]]) {
    assert.equal(await state.controller.reorder(next), false);
  }
  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
  assert.deepEqual(state.savingChanges, []);
  assert.equal(state.controller.captureRefresh(), token);
}

// Save once, preserve optimistic order across old polls, and retain new metadata.
{
  const state = setup();
  const oldToken = state.controller.captureRefresh();
  const pending = state.controller.reorder(upward);
  assert.deepEqual(hashes(state.current()), ['gamma', 'alpha', 'beta']);
  assert.deepEqual(state.savingChanges, [true]);
  assert.deepEqual(state.requests[0].hashes, ['gamma', 'alpha', 'beta']);
  const pendingToken = state.controller.captureRefresh();
  assert.notEqual(pendingToken, oldToken);
  assert.equal(await state.controller.reorder(downward), false);
  assert.equal(state.requests.length, 1);

  const renamed = folders.map((workspace) => ({ ...workspace, name: `renamed ${workspace.hash}` }));
  state.controller.acceptRefresh(renamed, oldToken);
  assert.deepEqual(hashes(state.current()), ['gamma', 'alpha', 'beta']);
  assert.equal(state.current()[0], renamed[2]);
  state.controller.acceptRefresh(renamed, pendingToken);
  assert.deepEqual(hashes(state.current()), ['gamma', 'alpha', 'beta']);
  state.requests[0].resolve({ hashes: ['gamma', 'alpha', 'beta'] });
  assert.equal(await pending, true);
  assert.deepEqual(state.savingChanges, [true, false]);
  assert.equal(state.current()[0], renamed[2]);
  assert.notEqual(state.controller.captureRefresh(), pendingToken);

  // Even a poll begun during saving is stale once the save finishes.
  state.controller.acceptRefresh(folders, pendingToken);
  assert.deepEqual(hashes(state.current()), ['gamma', 'alpha', 'beta']);
  state.controller.acceptRefresh(folders, oldToken);
  assert.deepEqual(hashes(state.current()), ['gamma', 'alpha', 'beta']);
  state.controller.acceptRefresh(folders, state.controller.captureRefresh());
  assert.equal(state.current(), folders);
}

// Confirmed server order is applied to current metadata; arrivals append.
{
  const state = setup();
  const pending = state.controller.reorder(upward.map((workspace) => ({ ...workspace, name: 'stale' })));
  assert.equal(state.current()[0], folders[2]);
  const added = { hash: 'delta', name: 'arrived while saving' };
  const renamed = folders.map((workspace) => ({ ...workspace, name: `latest ${workspace.hash}` }));
  state.controller.acceptRefresh([...renamed, added], state.controller.captureRefresh());
  state.requests[0].resolve({ hashes: ['beta', 'gamma', 'alpha'] });
  assert.equal(await pending, true);
  assert.deepEqual(hashes(state.current()), ['beta', 'gamma', 'alpha', 'delta']);
  assert.equal(state.current()[0], renamed[1]);
  assert.equal(state.current()[3], added);
}

// Failed writes restore the previous order against latest objects and current membership.
{
  const state = setup();
  const pending = state.controller.reorder(upward);
  const pendingToken = state.controller.captureRefresh();
  const removedAndAdded = [{ hash: 'gamma', name: 'latest gamma' }, { hash: 'beta', name: 'latest beta' },
    { hash: 'delta', name: 'new folder' }];
  state.controller.acceptRefresh(removedAndAdded, pendingToken);
  const error = new Error('disk full');
  state.requests[0].reject(error);
  assert.equal(await pending, false);
  assert.deepEqual(hashes(state.current()), ['beta', 'gamma', 'delta']);
  assert.equal(state.current()[0], removedAndAdded[1]);
  assert.equal(state.current()[2], removedAndAdded[2]);
  assert.deepEqual(state.errors, [error]);
  assert.deepEqual(state.savingChanges, [true, false]);
  state.controller.acceptRefresh(removedAndAdded, pendingToken);
  assert.deepEqual(hashes(state.current()), ['beta', 'gamma', 'delta']);

  const retry = state.controller.reorder(reorderWorkspaceFolders(state.current(), 'delta', 'beta'));
  assert.equal(state.requests.length, 2);
  state.requests[1].resolve({ hashes: ['delta', 'beta', 'gamma'] });
  assert.equal(await retry, true);
}

// Conflict recovery refreshes start after saving finishes and accept the server's current order.
{
  let current = folders;
  let refresh;
  let recoveryToken;
  const request = deferred();
  const savingChanges = [];
  const conflict = Object.assign(new Error('workspace list changed'), { code: 'WORKSPACE_ORDER_CONFLICT' });
  const serverCurrent = [folders[1], folders[0], folders[2], { hash: 'delta', name: 'new workspace' }];
  const controller = createWorkspaceFolderOrderController({
    getWorkspaces: () => current,
    setWorkspaces: (next) => { current = next; },
    save: () => request.promise,
    onSavingChange: (value) => savingChanges.push(value),
    onError: (error) => {
      assert.equal(error, conflict);
      assert.deepEqual(hashes(current), ['alpha', 'beta', 'gamma']);
      assert.deepEqual(savingChanges, [true, false]);
      recoveryToken = controller.captureRefresh();
      refresh = Promise.resolve(serverCurrent)
        .then((response) => controller.acceptRefresh(response, recoveryToken));
    },
  });
  const pending = controller.reorder(upward);
  const pendingToken = controller.captureRefresh();
  request.reject(conflict);
  assert.equal(await pending, false);
  await refresh;
  assert.notEqual(recoveryToken, pendingToken);
  assert.equal(recoveryToken, controller.captureRefresh());
  assert.equal(current, serverCurrent);
  // A genuinely stale pending-write poll cannot undo the recovery response.
  controller.acceptRefresh(folders, pendingToken);
  assert.deepEqual(hashes(current), ['beta', 'alpha', 'gamma']);
}

// Malformed confirmations fail visibly and synchronous transport errors release the lock.
for (const confirmed of [null, {}, { hashes: ['gamma'] }, { hashes: ['gamma', 'gamma', 'alpha'] },
  { hashes: ['gamma', 'alpha', 'unknown'] }]) {
  const state = setup();
  const pending = state.controller.reorder(upward);
  state.requests[0].resolve(confirmed);
  assert.equal(await pending, false);
  assert.deepEqual(hashes(state.current()), ['alpha', 'beta', 'gamma']);
  assert.equal(state.errors.length, 1);
  assert.deepEqual(state.savingChanges, [true, false]);
}
{
  let current = folders;
  const error = new Error('synchronous failure');
  const errors = [];
  const savingChanges = [];
  const controller = createWorkspaceFolderOrderController({
    getWorkspaces: () => current,
    setWorkspaces: (next) => { current = next; },
    save: () => { throw error; },
    onError: (value) => errors.push(value),
    onSavingChange: (value) => savingChanges.push(value),
  });
  assert.equal(await controller.reorder(upward), false);
  assert.deepEqual(hashes(current), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(errors, [error]);
  assert.deepEqual(savingChanges, [true, false]);
  assert.equal(await controller.reorder(upward), false);
  assert.equal(errors.length, 2);
}

console.log('[pass] workspace folder ordering, geometry, persistence, refresh races, rollback, and retries');
