import assert from 'node:assert/strict';
import {
  SESSION_HOVER_LIFECYCLE_ACTIONS,
  SESSION_HOVER_GIT_CACHE_TTL_MS,
  activeSessionHoverOwner,
  computeSessionHoverCardPosition,
  createSessionHoverLifecycleState,
  createSessionHoverGitInfoCache,
  reduceSessionHoverLifecycle,
  sessionHoverDetails,
  sessionHoverFocusIsVisible,
} from './sessionHoverDetails.js';

async function test(name, fn) {
  try {
    await fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// 场景:git 工作区的会话行悬停。期望:目录、分支、最近活动三样齐全,
// hasWorkspace 为真让卡片走目录分支而不是「无工作区」文案。
await test('workspace session exposes cwd and confirmed Git branch', () => {
  assert.deepEqual(
    sessionHoverDetails(
      { cwd: 'C:\repo', workspace_hash: 'workspace-a', updated_at: 1700000000000 },
      { is_repo: true, branch: 'feature/hover-details' },
    ),
    {
      cwd: 'C:\repo',
      hasWorkspace: true,
      branch: 'feature/hover-details',
      isGitRepository: true,
      updatedAt: 1700000000000,
    },
  );
});

// 场景:工作区不是 git 仓库,或者 git 探测还没回来。期望:仍然出卡片,只是没有
// 分支行 —— 非 git 工作区曾经整张卡片都不显示,这是回归点。
await test('non-Git and failed lookup states keep directory-only details', () => {
  assert.deepEqual(
    sessionHoverDetails({ cwd: '/work/project', updated_at: 5 }, { is_repo: false }),
    {
      cwd: '/work/project',
      hasWorkspace: true,
      branch: '',
      isGitRepository: false,
      updatedAt: 5,
    },
  );
  assert.deepEqual(
    sessionHoverDetails({ cwd: '/work/project', updated_at: 5 }),
    {
      cwd: '/work/project',
      hasWorkspace: true,
      branch: '',
      isGitRepository: false,
      updatedAt: 5,
    },
  );
});

// 场景:无工作区会话。期望:标记优先于任何残留 cwd(不能把私有路径漏出去),
// hasWorkspace 为假让卡片改出「无工作区」,时间行仍在。整张卡片不再消失。
await test('no-workspace sessions keep a card without leaking any stray cwd', () => {
  assert.deepEqual(
    sessionHoverDetails({ no_workspace: true, cwd: 'C:\private', updated_at: 9 }),
    { cwd: '', hasWorkspace: false, branch: '', isGitRepository: false, updatedAt: 9 },
  );
  assert.deepEqual(
    sessionHoverDetails({ noWorkspace: true, cwd: '/private', created_at: 3 }),
    { cwd: '', hasWorkspace: false, branch: '', isGitRepository: false, updatedAt: 3 },
  );
  // 只有空白字符的 cwd 同样按无工作区处理,但不该因此丢掉整张卡片。
  assert.deepEqual(
    sessionHoverDetails({ cwd: '   ' }),
    { cwd: '', hasWorkspace: false, branch: '', isGitRepository: false, updatedAt: null },
  );
  // 无工作区会话即使 git 探测意外返回仓库,也不能出分支行。
  assert.equal(
    sessionHoverDetails({ no_workspace: true }, { is_repo: true, branch: 'main' }).isGitRepository,
    false,
  );
  assert.equal(sessionHoverDetails(null), null);
});

await test('session hover lifecycle keeps one active owner and ignores stale exits', () => {
  let state = createSessionHoverLifecycleState();
  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.POINTER_ENTER,
    owner: 'row-a',
  });
  assert.equal(activeSessionHoverOwner(state), 'row-a');

  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.POINTER_ENTER,
    owner: 'row-b',
  });
  assert.equal(activeSessionHoverOwner(state), 'row-b');

  const afterStaleLeave = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.POINTER_LEAVE,
    owner: 'row-a',
  });
  assert.equal(afterStaleLeave, state);
  assert.equal(activeSessionHoverOwner(afterStaleLeave), 'row-b');
});

await test('pointer hover overrides keyboard owner and restores it on leave', () => {
  let state = createSessionHoverLifecycleState();
  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.KEYBOARD_ENTER,
    owner: 'keyboard-row',
  });
  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.POINTER_ENTER,
    owner: 'pointer-row',
  });
  assert.deepEqual(state, {
    pointerOwner: 'pointer-row',
    keyboardOwner: 'keyboard-row',
  });
  assert.equal(activeSessionHoverOwner(state), 'pointer-row');

  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.POINTER_LEAVE,
    owner: 'pointer-row',
  });
  assert.equal(activeSessionHoverOwner(state), 'keyboard-row');

  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.CLEAR_OWNER,
    owner: 'keyboard-row',
  });
  assert.deepEqual(state, createSessionHoverLifecycleState());
});

await test('clear-all removes both owners and is idempotent when already empty', () => {
  let state = {
    pointerOwner: 'pointer-row',
    keyboardOwner: 'keyboard-row',
  };
  state = reduceSessionHoverLifecycle(state, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.CLEAR_ALL,
  });
  assert.deepEqual(state, createSessionHoverLifecycleState());
  assert.equal(
    reduceSessionHoverLifecycle(state, { type: SESSION_HOVER_LIFECYCLE_ACTIONS.CLEAR_ALL }),
    state,
  );
});

await test('pointer modality clears keyboard ownership without hiding pointer hover', () => {
  const state = reduceSessionHoverLifecycle({
    pointerOwner: 'pointer-row',
    keyboardOwner: 'keyboard-row',
  }, {
    type: SESSION_HOVER_LIFECYCLE_ACTIONS.CLEAR_KEYBOARD,
  });
  assert.deepEqual(state, {
    pointerOwner: 'pointer-row',
    keyboardOwner: '',
  });
  assert.equal(activeSessionHoverOwner(state), 'pointer-row');
});

await test('focus intent excludes pointer focus and safely detects keyboard-visible focus', () => {
  const visibleTarget = { matches: (selector) => selector === ':focus-visible' };
  const hiddenTarget = { matches: () => false };
  const unsupportedTarget = { matches: () => { throw new SyntaxError('unsupported selector'); } };

  assert.equal(sessionHoverFocusIsVisible(visibleTarget), true);
  assert.equal(sessionHoverFocusIsVisible(hiddenTarget), false);
  assert.equal(sessionHoverFocusIsVisible(visibleTarget, { pointerInitiated: true }), false);
  assert.equal(sessionHoverFocusIsVisible({}, { pointerInitiated: false }), true);
  assert.equal(sessionHoverFocusIsVisible(unsupportedTarget), true);
});

await test('position prefers the right side and vertically centers when room exists', () => {
  assert.deepEqual(
    computeSessionHoverCardPosition({
      anchorRect: { left: 20, right: 220, top: 100, height: 30 },
      cardWidth: 320,
      cardHeight: 90,
      viewportWidth: 1200,
      viewportHeight: 800,
    }),
    { placement: 'right', left: 228, top: 70, maxHeight: 784 },
  );
});

await test('position flips left and clamps to viewport edges', () => {
  assert.deepEqual(
    computeSessionHoverCardPosition({
      anchorRect: { left: 800, right: 990, top: 760, height: 30 },
      cardWidth: 300,
      cardHeight: 120,
      viewportWidth: 1000,
      viewportHeight: 800,
    }),
    { placement: 'left', left: 492, top: 672, maxHeight: 784 },
  );
});

await test('Git cache deduplicates in-flight loads and expires by TTL', async () => {
  let timestamp = 1_000;
  let calls = 0;
  let resolveFirst;
  const cache = createSessionHoverGitInfoCache(
    async (cwd) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) => { resolveFirst = () => resolve({ is_repo: true, branch: cwd }); });
      }
      return { is_repo: true, branch: `reload-${cwd}` };
    },
    { now: () => timestamp },
  );

  const first = cache.get('/repo');
  const duplicate = cache.get('/repo');
  assert.equal(first, duplicate);
  await Promise.resolve();
  resolveFirst();
  assert.equal((await first).branch, '/repo');
  assert.equal(calls, 1);

  assert.equal((await cache.get('/repo')).branch, '/repo');
  assert.equal(calls, 1);

  timestamp += SESSION_HOVER_GIT_CACHE_TTL_MS + 1;
  assert.equal((await cache.get('/repo')).branch, 'reload-/repo');
  assert.equal(calls, 2);
});

await test('Git cache invalidates one cwd without evicting another', async () => {
  let calls = 0;
  const cache = createSessionHoverGitInfoCache(async (cwd) => ({
    is_repo: true,
    branch: `${cwd}-${++calls}`,
  }));

  assert.equal((await cache.get('/a')).branch, '/a-1');
  assert.equal((await cache.get('/b')).branch, '/b-2');
  cache.invalidate('/a');
  assert.equal((await cache.get('/a')).branch, '/a-3');
  assert.equal((await cache.get('/b')).branch, '/b-2');
});

await test('Git cache does not retain failures and skips empty cwd', async () => {
  let calls = 0;
  const cache = createSessionHoverGitInfoCache(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary failure');
    return { is_repo: false };
  });

  assert.equal(await cache.get(''), null);
  assert.equal(calls, 0);
  await assert.rejects(cache.get('/repo'), /temporary failure/);
  assert.deepEqual(await cache.get('/repo'), { is_repo: false });
  assert.equal(calls, 2);
});

console.log('sessionHoverDetails.test.js: all tests passed');
