import assert from 'node:assert/strict';
import {
  SIDEBAR_SESSION_COLLAPSE_LIMIT,
  allowSidebarSessionListRevealExpansion,
  allowSidebarWorkspaceAutoExpand,
  applyRemoteControlSessionSelection,
  clearRemoteControlSessionBindings,
  completeRemoteControlSurgeRequest,
  expandedSessionListsAfterWorkspaceCollapseAll,
  expandedSessionListsAfterWorkspaceDisclosure,
  nextRemoteControlSurgeRequest,
  reconcileSidebarSessions,
  reorderSidebarWorkspaceSession,
  remoteControlSurgeTargetKey,
  sessionListNeedsRevealExpansion,
  sessionMatchesRevealTarget,
  shouldRunRemoteControlForcedSurge,
  shouldStartRemoteControlSurge,
  sidebarSessionHasWorktree,
  sidebarSessionMarker,
  sidebarRevealTarget,
  sidebarRevealTargetKey,
  sidebarSessionProjection,
  sidebarSessionRevealLimit,
  sidebarWorkspaceListKeys,
  sortSidebarSessionsNewestFirst,
  upsertSidebarSession,
} from './sidebarSessions.js';

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

test('sidebarSessionHasWorktree requires a worktree name or branch', () => {
  assert.equal(sidebarSessionHasWorktree({}), false);
  assert.equal(sidebarSessionHasWorktree({ worktree: {} }), false);
  assert.equal(sidebarSessionHasWorktree({ worktree: { name: '   ', branch: '' } }), false);
  assert.equal(sidebarSessionHasWorktree({ worktree: { name: 'ses-abc' } }), true);
  assert.equal(sidebarSessionHasWorktree({ worktree: { branch: 'worktree-ses-abc' } }), true);
});

test('sidebarSessionMarker gives LOOP alarm priority over worktree', () => {
  assert.equal(sidebarSessionMarker({}), '');
  assert.equal(sidebarSessionMarker({
    worktree: { name: 'ses-abc' },
  }), 'worktree');
  assert.equal(sidebarSessionMarker({
    loop_execution: { loop_id: 'loop-1', run_id: 'run-1' },
  }), 'loop');
  assert.equal(sidebarSessionMarker({
    loop_execution: { loop_id: 'loop-1', run_id: 'run-1' },
    worktree: { name: 'ses-abc', branch: 'worktree-ses-abc' },
  }), 'loop');
  assert.equal(sidebarSessionMarker({
    loop_execution: {},
    worktree: { name: 'ses-abc' },
  }), 'worktree');
});

test('remote-control surge starts only on a false-to-true binding transition', () => {
  assert.equal(shouldStartRemoteControlSurge(false, true), true);
  assert.equal(shouldStartRemoteControlSurge(undefined, true), true);
  assert.equal(shouldStartRemoteControlSurge(true, true), false);
  assert.equal(shouldStartRemoteControlSurge(true, false), false);
  assert.equal(shouldStartRemoteControlSurge(false, false), false);
});

test('remote-control selection clears old bindings and keeps the selected row bound', () => {
  const result = applyRemoteControlSessionSelection([
    { id: 'old', workspace_hash: 'w1', remote_control_bound: true },
    { id: 'other', workspace_hash: 'w1' },
  ], {
    id: 'target',
    workspace_hash: 'w2',
    title: 'Target',
  });

  assert.deepEqual(result.map((session) => ({
    id: session.id,
    workspace: session.workspace_hash,
    bound: session.remote_control_bound,
  })), [
    { id: 'old', workspace: 'w1', bound: false },
    { id: 'other', workspace: 'w1', bound: undefined },
    { id: 'target', workspace: 'w2', bound: true },
  ]);
});

test('remote-control surge target key distinguishes workspace and no-workspace rows', () => {
  assert.equal(
    remoteControlSurgeTargetKey({ id: 's1', workspace_hash: 'w1' }),
    'workspace\u0000w1\u0000s1',
  );
  assert.equal(
    remoteControlSurgeTargetKey({ id: 's1', no_workspace: true }),
    'no-workspace\u0000\u0000s1',
  );
});

test('authoritative refresh replaces an optimistic remote-control selection', () => {
  const optimistic = applyRemoteControlSessionSelection([
    { id: 'a', workspace_hash: 'w1', remote_control_bound: false },
    { id: 'b', workspace_hash: 'w2', remote_control_bound: true },
  ], {
    id: 'a',
    workspace_hash: 'w1',
  });
  const surge = nextRemoteControlSurgeRequest(null, remoteControlSurgeTargetKey(optimistic[0]), 1);
  const refreshed = reconcileSidebarSessions(optimistic, [
    { id: 'a', workspace_hash: 'w1', remote_control_bound: false },
    { id: 'b', workspace_hash: 'w2', remote_control_bound: true },
  ]);

  assert.deepEqual(refreshed.map((session) => [session.id, session.remote_control_bound]), [
    ['a', false],
    ['b', true],
  ]);
  assert.equal(completeRemoteControlSurgeRequest(surge, 1), null);
});

test('duplicate same-target selection coalesces during one surge window', () => {
  const first = nextRemoteControlSurgeRequest(null, 'workspace\u0000w1\u0000a', 4);
  const duplicate = nextRemoteControlSurgeRequest(first, 'workspace\u0000w1\u0000a', 5);
  const laterReplay = nextRemoteControlSurgeRequest(
    completeRemoteControlSurgeRequest(first, 4),
    'workspace\u0000w1\u0000a',
    5,
  );

  assert.equal(duplicate, first);
  assert.deepEqual(laterReplay, {
    targetKey: 'workspace\u0000w1\u0000a',
    sequence: 5,
  });
});

test('authoritative refresh to another binding blocks a stale pre-RAF surge', () => {
  const optimistic = applyRemoteControlSessionSelection([
    { id: 'a', workspace_hash: 'w1', remote_control_bound: false },
    { id: 'b', workspace_hash: 'w2', remote_control_bound: false },
  ], {
    id: 'a',
    workspace_hash: 'w1',
  });
  const scheduled = nextRemoteControlSurgeRequest(
    null,
    remoteControlSurgeTargetKey(optimistic[0]),
    7,
  );
  const refreshed = reconcileSidebarSessions(optimistic, [
    { id: 'a', workspace_hash: 'w1', remote_control_bound: false },
    { id: 'b', workspace_hash: 'w2', remote_control_bound: true },
  ]);
  const refreshedA = refreshed.find((session) => session.id === 'a');

  assert.equal(
    shouldRunRemoteControlForcedSurge(
      refreshedA.remote_control_bound,
      scheduled.sequence,
      scheduled.sequence,
    ),
    false,
  );
  assert.equal(shouldRunRemoteControlForcedSurge(true, scheduled.sequence, 8), false);
  assert.equal(shouldRunRemoteControlForcedSurge(true, scheduled.sequence, scheduled.sequence), true);
  assert.deepEqual(refreshed.map((session) => [session.id, session.remote_control_bound]), [
    ['a', false],
    ['b', true],
  ]);
});

test('stale surge completion cannot clear a newer target sequence', () => {
  const newer = nextRemoteControlSurgeRequest(null, 'workspace\u0000w2\u0000b', 8);

  assert.equal(completeRemoteControlSurgeRequest(newer, 7), newer);
  assert.equal(completeRemoteControlSurgeRequest(newer, 8), null);
});

test('five or fewer sidebar sessions are not collapsible', () => {
  const sessions = Array.from({ length: SIDEBAR_SESSION_COLLAPSE_LIMIT }, (_, i) => ({ id: String(i) }));
  const result = sidebarSessionProjection(sessions);
  assert.equal(result.collapsible, false);
  assert.equal(result.action, '');
  assert.deepEqual(result.visibleSessions.map((s) => s.id), ['0', '1', '2', '3', '4']);
});

test('more than five sidebar sessions collapse to first five', () => {
  const sessions = Array.from({ length: 7 }, (_, i) => ({ id: String(i) }));
  const result = sidebarSessionProjection(sessions);
  assert.equal(result.collapsible, true);
  assert.equal(result.action, 'expand');
  assert.equal(result.hiddenCount, 2);
  assert.deepEqual(result.visibleSessions.map((s) => s.id), ['0', '1', '2', '3', '4']);
});

test('sidebar sessions reveal five rows per batch through a partial last batch and collapse again', () => {
  const sessions = Array.from({ length: 17 }, (_, i) => ({ id: String(i) }));
  for (const [visibleLimit, expectedCount, expectedAction] of [
    [5, 5, 'expand'],
    [10, 10, 'expand'],
    [15, 15, 'expand'],
    [20, 17, 'collapse'],
    [5, 5, 'expand'],
  ]) {
    const result = sidebarSessionProjection(sessions, visibleLimit);
    assert.equal(result.collapsible, true);
    assert.equal(result.action, expectedAction);
    assert.equal(result.hiddenCount, sessions.length - expectedCount);
    assert.deepEqual(result.visibleSessions, sessions.slice(0, expectedCount));
  }
});

test('six, ten, and twelve sessions show only the available rows in the final batch', () => {
  for (const total of [6, 10, 12]) {
    const sessions = Array.from({ length: total }, (_, i) => ({ id: String(i) }));
    const firstExpansion = sidebarSessionProjection(sessions, 10);
    assert.equal(firstExpansion.visibleSessions.length, Math.min(10, total));
    assert.equal(firstExpansion.action, total > 10 ? 'expand' : 'collapse');
    const complete = sidebarSessionProjection(sessions, 15);
    assert.equal(complete.visibleSessions.length, total);
    assert.equal(complete.action, 'collapse');
  }
});

test('partially loaded session lists keep the expand action until all reported rows are visible', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  const loading = sidebarSessionProjection(sessions.slice(0, 5), 10, 5, 12);
  assert.equal(loading.visibleSessions.length, 5);
  assert.equal(loading.action, 'expand');
  assert.equal(loading.hiddenCount, 7);
  const loaded = sidebarSessionProjection(sessions, 10, 5, 12);
  assert.equal(loaded.visibleSessions.length, 10);
  assert.equal(loaded.action, 'expand');
  assert.equal(loaded.hiddenCount, 2);
  assert.equal(sidebarSessionProjection(sessions, 15, 5, 12).action, 'collapse');
});

test('invalid visible limits retain the compact batch while finite limits use whole rows', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  for (const visibleLimit of [undefined, null, 0, -5, NaN, Infinity]) {
    assert.equal(sidebarSessionProjection(sessions, visibleLimit).visibleSessions.length, 5);
  }
  assert.equal(sidebarSessionProjection(sessions, 2).visibleSessions.length, 5);
  assert.equal(sidebarSessionProjection(sessions, 10.8).visibleSessions.length, 10);
});

test('collapse all workspaces resets registered session lists to the default compact state', () => {
  const expanded = expandedSessionListsAfterWorkspaceCollapseAll(
    new Map([
      ['__no_workspace__', 10],
      ['w1', 10],
      ['w2', 15],
      ['w3', 20],
      ['stale-workspace', 25],
    ]),
    [
      { hash: 'w1' },
      { workspace_hash: 'w2' },
      { workspaceHash: 'w3' },
      { hash: '' },
    ],
  );
  assert.deepEqual(
    Array.from(expanded),
    [['__no_workspace__', 10], ['stale-workspace', 25]],
  );
  const sessions = Array.from({ length: 7 }, (_, index) => ({ id: String(index) }));
  const projection = sidebarSessionProjection(sessions, expanded.get('w1'));
  assert.equal(projection.action, 'expand');
  assert.deepEqual(projection.visibleSessions.map((session) => session.id), ['0', '1', '2', '3', '4']);
  assert.equal(expanded.get('__no_workspace__'), 10);
  assert.deepEqual(sidebarWorkspaceListKeys([
    { hash: 'w1' },
    { workspace_hash: 'w1' },
    { workspaceHash: 'w2' },
    { hash: '' },
    'w3',
  ]), ['w1', 'w2', 'w3']);
});

test('workspace disclosure forgets an expanded session list and restores the compact five-row mode', () => {
  const expanded = new Map([['w1', 10], ['w2', 15], ['__no_workspace__', 20]]);
  const afterCollapse = expandedSessionListsAfterWorkspaceDisclosure(expanded, 'w1');
  assert.deepEqual(Array.from(afterCollapse), [['w2', 15], ['__no_workspace__', 20]]);
  assert.equal(expanded.get('w1'), 10);
  assert.equal(expandedSessionListsAfterWorkspaceDisclosure(afterCollapse, 'w1'), afterCollapse);
  assert.equal(expandedSessionListsAfterWorkspaceDisclosure(afterCollapse, ''), afterCollapse);

  const sessions = Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    workspace_hash: 'w1',
  }));
  const compact = sidebarSessionProjection(sessions, afterCollapse.get('w1'));
  assert.equal(compact.action, 'expand');
  assert.deepEqual(compact.visibleSessions.map((session) => session.id), ['0', '1', '2', '3', '4']);
  assert.equal(sessionListNeedsRevealExpansion(sessions, {
    sessionId: '6',
    workspaceHash: 'w1',
  }, afterCollapse.get('w1')), true);
});

test('workspace and no-workspace visible limits stay independent', () => {
  const sessions = Array.from({ length: 18 }, (_, i) => ({ id: String(i) }));
  const limits = new Map([['w1', 10], ['w2', 15], ['__no_workspace__', 20]]);
  assert.equal(sidebarSessionProjection(sessions, limits.get('w1')).visibleSessions.length, 10);
  assert.equal(sidebarSessionProjection(sessions, limits.get('w2')).visibleSessions.length, 15);
  assert.equal(sidebarSessionProjection(sessions, limits.get('__no_workspace__')).visibleSessions.length, 18);
  assert.equal(sidebarSessionProjection(sessions, limits.get('w3')).visibleSessions.length, 5);
  const compact = expandedSessionListsAfterWorkspaceDisclosure(limits, 'w1');
  assert.equal(sidebarSessionProjection(sessions, compact.get('w1')).visibleSessions.length, 5);
  assert.equal(sidebarSessionProjection(sessions, compact.get('w2')).visibleSessions.length, 15);
});

test('user-collapsed workspaces and disclosure-compact lists block sticky reveal expansion', () => {
  assert.equal(allowSidebarWorkspaceAutoExpand('w1'), true);
  assert.equal(allowSidebarWorkspaceAutoExpand('w1', { workspaceCollapseAll: true }), false);
  assert.equal(allowSidebarWorkspaceAutoExpand('w1', {
    userCollapsedWorkspaces: new Set(['w1']),
  }), false);
  assert.equal(allowSidebarWorkspaceAutoExpand('w1', {
    userCollapsedWorkspaces: new Set(['w2']),
  }), true);
  assert.equal(allowSidebarWorkspaceAutoExpand('w1', { noWorkspace: true }), false);
  assert.equal(allowSidebarWorkspaceAutoExpand(''), false);

  assert.equal(allowSidebarSessionListRevealExpansion({ listKey: 'w1' }), true);
  assert.equal(allowSidebarSessionListRevealExpansion({
    listKey: 'w1',
    workspaceCollapseAll: true,
  }), false);
  assert.equal(allowSidebarSessionListRevealExpansion({
    listKey: 'w1',
    noWorkspace: true,
    workspaceCollapseAll: true,
  }), true);
  assert.equal(allowSidebarSessionListRevealExpansion({
    listKey: 'w1',
    disclosureCompactKeys: new Set(['w1']),
  }), false);
  assert.equal(allowSidebarSessionListRevealExpansion({
    listKey: 'w1',
    noWorkspace: true,
    workspaceCollapseAll: true,
    disclosureCompactKeys: new Set(['w1']),
  }), false);
  assert.equal(allowSidebarSessionListRevealExpansion({ listKey: '' }), false);

  const sessions = Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    workspace_hash: 'w1',
  }));
  const hiddenTarget = { sessionId: '6', workspaceHash: 'w1' };
  const compactKeys = new Set(['w1']);
  assert.equal(sessionListNeedsRevealExpansion(sessions, hiddenTarget), true);
  assert.equal(allowSidebarSessionListRevealExpansion({
    listKey: 'w1',
    disclosureCompactKeys: compactKeys,
  }), false);
  assert.deepEqual(
    sidebarSessionProjection(sessions).visibleSessions.map((session) => session.id),
    ['0', '1', '2', '3', '4'],
  );
});

test('sidebarRevealTarget keeps workspace session identity', () => {
  assert.deepEqual(sidebarRevealTarget({
    sessionId: 's1',
    workspaceHash: 'w1',
  }), {
    sessionId: 's1',
    workspaceHash: 'w1',
    noWorkspace: false,
  });
});

test('sidebarRevealTarget marks no-workspace sessions without workspace hash', () => {
  assert.deepEqual(sidebarRevealTarget({
    session_id: 's1',
    workspace_hash: 'w1',
    no_workspace: true,
  }), {
    sessionId: 's1',
    workspaceHash: '',
    noWorkspace: true,
  });
});

test('sidebarRevealTargetKey distinguishes workspace and no-workspace targets', () => {
  assert.equal(
    sidebarRevealTargetKey({ sessionId: 's1', workspaceHash: 'w1' }),
    'workspace\u0000w1\u0000s1',
  );
  assert.equal(
    sidebarRevealTargetKey({
      session_id: 's1',
      workspace_hash: 'stale-workspace',
      no_workspace: true,
    }),
    'no-workspace\u0000\u0000s1',
  );
  assert.equal(sidebarRevealTargetKey({ workspaceHash: 'w1' }), '');
});

test('sidebarRevealTargetKey stays stable across refresh-only metadata updates', () => {
  const previous = sidebarRevealTargetKey({
    sessionId: 's1',
    workspaceHash: 'w1',
    title: 'Earlier title',
    updated_at: '2026-07-30T01:00:00Z',
  });
  const refreshed = sidebarRevealTargetKey({
    session_id: 's1',
    workspace_hash: 'w1',
    title: 'Updated title',
    updated_at: '2026-07-30T02:00:00Z',
    attention_state: 'working',
  });
  assert.equal(refreshed, previous);
  assert.notEqual(
    sidebarRevealTargetKey({ sessionId: 's1', workspaceHash: 'w2' }),
    previous,
  );
  assert.notEqual(
    sidebarRevealTargetKey({ sessionId: 's2', workspaceHash: 'w1' }),
    previous,
  );
});

test('sessionListNeedsRevealExpansion expands when target row is hidden', () => {
  const sessions = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    workspace_hash: 'w1',
  }));
  assert.equal(sessionListNeedsRevealExpansion(sessions, {
    sessionId: '6',
    workspaceHash: 'w1',
  }), true);
  assert.equal(sessionListNeedsRevealExpansion(sessions, {
    sessionId: '3',
    workspaceHash: 'w1',
  }), false);
});

test('session reveal compares the current visible batch and expands only through the target batch', () => {
  const sessions = Array.from({ length: 18 }, (_, i) => ({
    id: String(i),
    workspace_hash: 'w1',
  }));
  for (const [index, expectedLimit] of [[0, 5], [4, 5], [5, 10], [9, 10], [10, 15], [17, 20]]) {
    const target = { sessionId: String(index), workspaceHash: 'w1' };
    const revealLimit = sidebarSessionRevealLimit(sessions, target);
    assert.equal(revealLimit, expectedLimit);
    assert.equal(sessionListNeedsRevealExpansion(sessions, target, 10), index >= 10);
    assert.equal(sessionListNeedsRevealExpansion(sessions, target, revealLimit), false);
    assert.ok(sidebarSessionProjection(sessions, revealLimit).visibleSessions.some((session) => session.id === target.sessionId));
  }
  const missing = { sessionId: 'missing', workspaceHash: 'w1' };
  assert.equal(sidebarSessionRevealLimit(sessions, missing), 5);
  assert.equal(sessionListNeedsRevealExpansion(sessions, missing), false);
  assert.equal(sidebarSessionRevealLimit(sessions, { sessionId: '10', workspaceHash: 'w2' }), 5);
  assert.equal(sidebarSessionRevealLimit(sessions, { sessionId: '10', noWorkspace: true }), 5);
  assert.equal(sidebarSessionRevealLimit(sessions, { sessionId: '9', workspaceHash: 'w1' }, 4), 12);
});

test('sessionMatchesRevealTarget separates workspace and no-workspace rows', () => {
  assert.equal(sessionMatchesRevealTarget({
    id: 's1',
    workspace_hash: 'w1',
  }, {
    sessionId: 's1',
    workspaceHash: 'w1',
  }), true);
  assert.equal(sessionMatchesRevealTarget({
    id: 's1',
    workspace_hash: 'w1',
  }, {
    sessionId: 's1',
    noWorkspace: true,
  }), false);
});

test('sortSidebarSessionsNewestFirst orders by updated then created time', () => {
  const result = sortSidebarSessionsNewestFirst([
    { id: 'old', updated_at: '2026-05-17T01:00:00Z' },
    { id: 'new', updated_at: '2026-05-17T03:00:00Z' },
    { id: 'middle', created_at: '2026-05-17T02:00:00Z' },
  ]);
  assert.deepEqual(result.map((s) => s.id), ['new', 'middle', 'old']);
});

test('upsertSidebarSession inserts new session newest-first', () => {
  const result = upsertSidebarSession([
    { id: 'old', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z' },
  ], {
    id: 'fork',
    workspace_hash: 'w1',
    updated_at: '2026-05-17T04:00:00Z',
  });
  assert.deepEqual(result.map((s) => s.id), ['fork', 'old']);
});

test('upsertSidebarSession promotes an incomplete created session immediately', () => {
  const result = upsertSidebarSession([
    { id: 'newest-known', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z' },
    { id: 'older', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z' },
  ], {
    id: 'created',
    workspace_hash: 'w1',
  }, {
    promoteToTop: true,
  });
  assert.deepEqual(result.map((s) => s.id), ['created', 'newest-known', 'older']);
});

test('upsertSidebarSession creation promotion wins a refresh race without duplicates', () => {
  const result = upsertSidebarSession([
    { id: 'other', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z' },
    { id: 'created', workspace_hash: 'w1', updated_at: '2026-05-17T04:00:00Z', message_count: 0 },
    { id: 'created', workspace_hash: 'w1', title: 'stale duplicate' },
  ], {
    id: 'created',
    workspace_hash: 'w1',
    title: 'Created task',
  }, {
    promoteToTop: true,
  });
  assert.deepEqual(result.map((s) => s.id), ['created', 'other']);
  assert.equal(result[0].title, 'Created task');
  assert.equal(result[0].updated_at, '2026-05-17T04:00:00Z');
});

test('upsertSidebarSession keeps non-creation inserts on timestamp order', () => {
  const result = upsertSidebarSession([
    { id: 'known', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z' },
  ], {
    id: 'metadata-pending',
    workspace_hash: 'w1',
  });
  assert.deepEqual(result.map((s) => s.id), ['known', 'metadata-pending']);
});

test('upsertSidebarSession replaces existing session without duplicates', () => {
  const result = upsertSidebarSession([
    { id: 'other', updated_at: '2026-05-17T02:00:00Z' },
    { id: 'same', title: 'old', updated_at: '2026-05-17T01:00:00Z' },
  ], {
    id: 'same',
    title: 'new',
    updated_at: '2026-05-17T03:00:00Z',
  });
  assert.deepEqual(result.map((s) => s.id), ['other', 'same']);
  assert.equal(result[1].title, 'new');
});

test('upsertSidebarSession promotes existing session only when content counters change', () => {
  const result = upsertSidebarSession([
    { id: 'other', updated_at: '2026-05-17T02:00:00Z' },
    { id: 'same', title: 'old', updated_at: '2026-05-17T01:00:00Z', message_count: 2 },
  ], {
    id: 'same',
    title: 'new',
    updated_at: '2026-05-17T03:00:00Z',
    message_count: 4,
  });
  assert.deepEqual(result.map((s) => s.id), ['same', 'other']);
  assert.equal(result[0].title, 'new');
});

test('reconcileSidebarSessions preserves row order when only updated_at changes', () => {
  const previous = [
    { id: 'a', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z', message_count: 2, turn_count: 1 },
    { id: 'b', workspace_hash: 'w1', updated_at: '2026-05-17T02:00:00Z', message_count: 4, turn_count: 2 },
    { id: 'c', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z', message_count: 6, turn_count: 3 },
  ];
  const incoming = [
    { id: 'c', workspace_hash: 'w1', updated_at: '2026-05-17T09:00:00Z', message_count: 6, turn_count: 3 },
    { id: 'b', workspace_hash: 'w1', updated_at: '2026-05-17T02:00:00Z', message_count: 4, turn_count: 2 },
    { id: 'a', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z', message_count: 2, turn_count: 1 },
  ];
  const result = reconcileSidebarSessions(previous, incoming);
  assert.deepEqual(result.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(result[2].updated_at, '2026-05-17T09:00:00Z');
});

test('reconcileSidebarSessions promotes content changes and new sessions', () => {
  const previous = [
    { id: 'a', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z', message_count: 2, turn_count: 1 },
    { id: 'b', workspace_hash: 'w1', updated_at: '2026-05-17T02:00:00Z', message_count: 4, turn_count: 2 },
    { id: 'c', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z', message_count: 6, turn_count: 3 },
  ];
  const incoming = [
    { id: 'a', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z', message_count: 2, turn_count: 1 },
    { id: 'b', workspace_hash: 'w1', updated_at: '2026-05-17T10:00:00Z', message_count: 8, turn_count: 3 },
    { id: 'c', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z', message_count: 6, turn_count: 3 },
    { id: 'new', workspace_hash: 'w1', updated_at: '2026-05-17T11:00:00Z', message_count: 0, turn_count: 0 },
  ];
  const result = reconcileSidebarSessions(previous, incoming);
  assert.deepEqual(result.map((s) => s.id), ['new', 'b', 'a', 'c']);
});

// 场景：折叠态只显示最新 5 条，归档其中一条后刷新，第 6 条旧会话补进来。
// 期望：补位的旧会话按时间落在末尾，不顶到最前；真正的新会话（比已显示的都新）仍然置顶。
// 回归表现：归档同工作区的会话时，3 天前的会话突然窜到了列表顶部（LIUXIN557 反馈）。
test('reconcileSidebarSessions keeps backfilled older sessions in time order', () => {
  const at = (id, day) => ({ id, workspace_hash: 'w1', updated_at: `2026-09-${day}T10:00:00Z`, message_count: 10, turn_count: 2 });
  const previous = [at('d20', 20), at('d19', 19), at('d18', 18), at('d17', 17)];
  const incoming = [at('d20', 20), at('d19', 19), at('d18', 18), at('d17', 17), at('d16', 16)];
  assert.deepEqual(reconcileSidebarSessions(previous, incoming).map((s) => s.id), ['d20', 'd19', 'd18', 'd17', 'd16']);

  const withFresh = [...incoming, at('d21', 21)];
  assert.deepEqual(reconcileSidebarSessions(previous, withFresh).map((s) => s.id), ['d21', 'd20', 'd19', 'd18', 'd17', 'd16']);
});

test('remote-control off clears the bound row without rewriting unrelated sessions', () => {
  const untouched = { id: 'other', workspace_hash: 'w2' };
  const result = clearRemoteControlSessionBindings([
    { id: 'bound', workspace_hash: 'w1', remote_control_bound: true },
    untouched,
  ]);
  assert.equal(result[0].remote_control_bound, false);
  assert.equal(result[0].remoteControlBound, false);
  assert.equal(result[1], untouched);
  assert.equal(clearRemoteControlSessionBindings([untouched])[0], untouched);
});

test('reorderSidebarWorkspaceSession moves rows within one workspace only', () => {
  const sessions = [
    { id: 'a', workspace_hash: 'w1' },
    { id: 'x', workspace_hash: 'w2' },
    { id: 'b', workspace_hash: 'w1' },
    { id: 'task', no_workspace: true },
    { id: 'c', workspace_hash: 'w1' },
    { id: 'y', workspace_hash: 'w2' },
  ];

  const movedUp = reorderSidebarWorkspaceSession(sessions, 'w1', 'c', 'a', 'before');
  assert.deepEqual(movedUp.map((session) => session.id), ['c', 'x', 'a', 'task', 'b', 'y']);
  assert.equal(movedUp[1], sessions[1]);
  assert.equal(movedUp[3], sessions[3]);
  assert.equal(movedUp[5], sessions[5]);

  const movedDown = reorderSidebarWorkspaceSession(sessions, 'w1', 'a', 'c', 'after');
  assert.deepEqual(movedDown.map((session) => session.id), ['b', 'x', 'c', 'task', 'a', 'y']);
});

test('reorderSidebarWorkspaceSession rejects invalid and cross-workspace targets', () => {
  const sessions = [
    { id: 'a', workspace_hash: 'w1' },
    { id: 'x', workspace_hash: 'w2' },
    { id: 'b', workspace_hash: 'w1' },
    { id: 'task', no_workspace: true },
  ];

  assert.equal(reorderSidebarWorkspaceSession(sessions, 'w1', 'a', 'x'), sessions);
  assert.equal(reorderSidebarWorkspaceSession(sessions, 'w1', 'missing', 'b'), sessions);
  assert.equal(reorderSidebarWorkspaceSession(sessions, '', 'a', 'b'), sessions);
  assert.equal(reorderSidebarWorkspaceSession(sessions, 'w1', 'a', 'a'), sessions);
  assert.equal(reorderSidebarWorkspaceSession(sessions, 'w1', 'task', 'a'), sessions);
});

test('manual workspace reorder composes with automatic sidebar promotion', () => {
  const sessions = [
    { id: 'a', workspace_hash: 'w1', updated_at: '2026-05-17T03:00:00Z', message_count: 2, turn_count: 1 },
    { id: 'b', workspace_hash: 'w1', updated_at: '2026-05-17T02:00:00Z', message_count: 4, turn_count: 2 },
    { id: 'c', workspace_hash: 'w1', updated_at: '2026-05-17T01:00:00Z', message_count: 6, turn_count: 3 },
  ];
  const manuallyReordered = reorderSidebarWorkspaceSession(sessions, 'w1', 'a', 'c', 'after');
  assert.deepEqual(manuallyReordered.map((session) => session.id), ['b', 'c', 'a']);

  const metadataOnly = reconcileSidebarSessions(manuallyReordered, [
    { ...sessions[0], updated_at: '2026-05-17T09:00:00Z' },
    sessions[2],
    sessions[1],
  ]);
  assert.deepEqual(metadataOnly.map((session) => session.id), ['b', 'c', 'a']);

  const contentChanged = reconcileSidebarSessions(metadataOnly, [
    { ...sessions[0], updated_at: '2026-05-17T10:00:00Z', message_count: 3 },
    sessions[1],
    sessions[2],
  ]);
  assert.deepEqual(contentChanged.map((session) => session.id), ['a', 'b', 'c']);
});

test('created session stays first across refreshes without expanding a compact list', () => {
  const existing = Array.from({ length: 6 }, (_, index) => ({
    id: `old-${index}`,
    workspace_hash: 'w1',
    updated_at: `2026-05-${String(16 - index).padStart(2, '0')}T01:00:00Z`,
    message_count: 2,
    turn_count: 1,
  }));
  const target = { sessionId: 'created', workspaceHash: 'w1' };
  const optimistic = upsertSidebarSession(existing, {
    id: 'created',
    workspace_hash: 'w1',
  }, {
    promoteToTop: true,
  });

  assert.equal(optimistic[0].id, 'created');
  assert.equal(sessionListNeedsRevealExpansion(optimistic, target), false);
  assert.deepEqual(
    sidebarSessionProjection(optimistic).visibleSessions.map((session) => session.id),
    ['created', 'old-0', 'old-1', 'old-2', 'old-3'],
  );

  const withMetadata = reconcileSidebarSessions(optimistic, [
    {
      id: 'created',
      workspace_hash: 'w1',
      updated_at: '2026-05-17T04:00:00Z',
      message_count: 0,
      turn_count: 0,
    },
    ...existing,
  ]);
  const withContent = reconcileSidebarSessions(withMetadata, [
    {
      id: 'created',
      workspace_hash: 'w1',
      updated_at: '2026-05-17T04:01:00Z',
      message_count: 2,
      turn_count: 1,
    },
    ...existing,
  ]);

  assert.equal(withMetadata[0].id, 'created');
  assert.equal(withMetadata[0].message_count, 0);
  assert.equal(withContent[0].id, 'created');
  assert.equal(withContent[0].message_count, 2);
  assert.equal(sessionListNeedsRevealExpansion(withContent, target), false);
});
