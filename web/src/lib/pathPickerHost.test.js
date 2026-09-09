import assert from 'node:assert/strict';
import {
  cancelPathPick,
  currentPathPickRequest,
  hasPathPickerHost,
  requestPathPick,
  resetPathPickerHostForTests,
  resolvePathPick,
  subscribePathPickRequests,
} from './pathPickerHost.js';

async function test(name, fn) {
  resetPathPickerHostForTests();
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  } finally {
    resetPathPickerHostForTests();
  }
}

// 场景:App 里没有挂 PathPickerHost(例如某个嵌入页面)就调了 requestPathPick。
// 期望:直接 reject,而不是返回一个永远不结算的 Promise。
await test('rejects when no host is mounted', async () => {
  assert.equal(hasPathPickerHost(), false);
  await assert.rejects(requestPathPick({ mode: 'folder' }), /路径选择器不可用/);
});

// 场景:正常流程。期望:订阅者立即收到带 id 与 options 的请求快照;弹窗确认后 Promise
// 结算为 { path, kind };结算后订阅者收到 null,当前请求被清空。
await test('resolves the pending request with the picked path', async () => {
  const seen = [];
  const unsubscribe = subscribePathPickRequests((request) => seen.push(request));
  const promise = requestPathPick({ mode: 'folder', initialPath: 'C:/repo' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.mode, 'folder');
  assert.equal(seen[0].options.initialPath, 'C:/repo');
  assert.deepEqual(currentPathPickRequest(), seen[0]);

  assert.equal(resolvePathPick(seen[0].id, { path: 'C:/repo/src', kind: 'dir' }), true);
  assert.deepEqual(await promise, { path: 'C:/repo/src', kind: 'dir' });
  assert.equal(seen[1], null);
  assert.equal(currentPathPickRequest(), null);
  unsubscribe();
});

// 场景:用户按 Esc / 取消。期望:Promise 结算为 null;缺 path 的结果也按取消处理。
await test('cancel and path-less results settle as null', async () => {
  subscribePathPickRequests(() => {});
  const first = requestPathPick({ mode: 'file' });
  assert.equal(cancelPathPick(currentPathPickRequest().id), true);
  assert.equal(await first, null);

  const second = requestPathPick({ mode: 'file' });
  assert.equal(resolvePathPick(currentPathPickRequest().id, { kind: 'file' }), true);
  assert.equal(await second, null);
});

// 场景:弹窗已开着时又来了一个请求(例如双击按钮)。期望:第二个请求立刻以 null 结束,
// 第一个不受影响;过期 id 的 resolve 返回 false 且不动当前请求。
await test('second concurrent request is refused and stale ids are ignored', async () => {
  subscribePathPickRequests(() => {});
  const first = requestPathPick({ mode: 'folder' });
  const firstId = currentPathPickRequest().id;
  assert.equal(await requestPathPick({ mode: 'folder' }), null);
  assert.equal(currentPathPickRequest().id, firstId);

  assert.equal(resolvePathPick(firstId + 100, { path: 'C:/x', kind: 'dir' }), false);
  assert.equal(currentPathPickRequest().id, firstId);

  assert.equal(resolvePathPick(firstId, { path: 'C:/y', kind: 'dir' }), true);
  assert.deepEqual(await first, { path: 'C:/y', kind: 'dir' });
});

// 场景:一个订阅者抛异常。期望:其它订阅者照常收到通知,Promise 照常结算。
await test('a throwing subscriber does not break the others', async () => {
  const seen = [];
  subscribePathPickRequests(() => { throw new Error('boom'); });
  subscribePathPickRequests((request) => seen.push(request));
  const promise = requestPathPick({ mode: 'folder' });
  assert.equal(seen.length, 1);
  resolvePathPick(seen[0].id, { path: '/tmp', kind: 'dir' });
  assert.deepEqual(await promise, { path: '/tmp', kind: 'dir' });
});
