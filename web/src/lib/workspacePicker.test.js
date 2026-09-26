import assert from 'node:assert/strict';
import {
  parseWorkspacePickerResult,
  pickExistingWorkspace,
} from './workspacePicker.js';
import {
  currentPathPickRequest,
  resetPathPickerHostForTests,
  resolvePathPick,
  subscribePathPickRequests,
} from './pathPickerHost.js';

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

await test('parses desktop picker JSON and cancellation results', async () => {
  assert.deepEqual(parseWorkspacePickerResult('{"hash":"abc","cwd":"C:/repo"}'), {
    hash: 'abc',
    cwd: 'C:/repo',
  });
  assert.equal(parseWorkspacePickerResult('null'), null);
  assert.equal(parseWorkspacePickerResult(null), null);
});

// 场景:Desktop 壳(有 bridge)。期望:走原生对话框,web 选择器不被调用,返回值顺带补注册。
await test('desktop picker registers and returns the selected workspace', async () => {
  const calls = [];
  const workspace = await pickExistingWorkspace({
    api: {
      registerWorkspace: async (cwd) => { calls.push(cwd); },
    },
    desktopBridge: {
      aceDesktop_addWorkspace: async () => JSON.stringify({
        hash: 'workspace-hash',
        cwd: 'C:/existing',
        name: 'existing',
      }),
    },
    webPicker: async () => { throw new Error('unexpected web picker'); },
  });

  assert.equal(workspace.hash, 'workspace-hash');
  assert.deepEqual(calls, ['C:/existing']);
});

// 场景:普通浏览器 / 兼容模式 / 远程 Web(无 bridge)。期望:弹 web 选择器(文件夹模式、
// purpose=workspace、透传 api),选中后用现有注册接口注册并返回工作区;daemon 的原生
// REST 对话框一律不碰。
await test('web picker registers the chosen directory through the workspace endpoint', async () => {
  const pickerCalls = [];
  const registered = [];
  const api = {
    registerWorkspace: async (cwd) => {
      registered.push(cwd);
      return { hash: 'web-hash', cwd, name: 'existing' };
    },
    pickWorkspaceFolder: async () => { throw new Error('native REST picker must not be used'); },
  };
  const workspace = await pickExistingWorkspace({
    api,
    desktopBridge: {},
    webPicker: async (options) => {
      pickerCalls.push(options);
      return { path: 'C:/Users/shao/existing', kind: 'dir' };
    },
  });
  assert.equal(pickerCalls.length, 1);
  assert.equal(pickerCalls[0].mode, 'folder');
  assert.equal(pickerCalls[0].purpose, 'workspace');
  assert.equal(pickerCalls[0].api, api);
  assert.deepEqual(registered, ['C:/Users/shao/existing']);
  assert.deepEqual(workspace, { hash: 'web-hash', cwd: 'C:/Users/shao/existing', name: 'existing' });
});

// 场景:用户在 web 选择器里取消。期望:返回 null,不注册任何东西。
await test('web picker cancellation preserves a null result without registering', async () => {
  const registered = [];
  const workspace = await pickExistingWorkspace({
    api: { registerWorkspace: async (cwd) => { registered.push(cwd); return { hash: 'x' }; } },
    desktopBridge: {},
    webPicker: async () => null,
  });
  assert.equal(workspace, null);
  assert.deepEqual(registered, []);
});

// 场景:注册接口失败(例如目录在选完之后被删)。期望:错误原样抛给调用方提示。
await test('web picker propagates registration failures', async () => {
  await assert.rejects(
    pickExistingWorkspace({
      api: { registerWorkspace: async () => { throw new Error('registration failed'); } },
      desktopBridge: {},
      webPicker: async () => ({ path: '/home/me/repo', kind: 'dir' }),
    }),
    /registration failed/,
  );
});

await test('desktop registration failure does not hide a valid picker result', async () => {
  let webPickerCalls = 0;
  const workspace = await pickExistingWorkspace({
    api: { registerWorkspace: async () => { throw new Error('already registered'); } },
    desktopBridge: {
      aceDesktop_addWorkspace: async () => ({ hash: 'abc', cwd: 'C:/repo' }),
    },
    webPicker: async () => { webPickerCalls += 1; return null; },
  });
  assert.equal(workspace.hash, 'abc');
  assert.equal(webPickerCalls, 0);
});

const nativeFailures = [
  ['error response', async () => ({ error: 'picker unavailable' })],
  ['JSON error response', async () => JSON.stringify({ error: 'zenity/kdialog unavailable' })],
  ['rejected bridge call', async () => { throw new Error('bridge rejected'); }],
  ['synchronous bridge exception', () => { throw new Error('bridge unavailable'); }],
  ['invalid JSON', async () => '{invalid'],
  ['missing workspace identity', async () => ({ cwd: '/home/me/repo' })],
];

for (const [name, nativePicker] of nativeFailures) {
  await test(`desktop ${name} falls back to the web folder picker once`, async () => {
    const calls = [];
    const api = {
      registerWorkspace: async (cwd) => {
        calls.push(['register', cwd]);
        return { hash: 'fallback-hash', cwd };
      },
      pickWorkspaceFolder: async () => { throw new Error('native REST picker must not be used'); },
    };
    const workspace = await pickExistingWorkspace({
      api,
      desktopBridge: {
        aceDesktop_addWorkspace: () => { calls.push('native'); return nativePicker(); },
      },
      webPicker: async (options) => {
        calls.push('web');
        assert.deepEqual(options, { mode: 'folder', purpose: 'workspace', api });
        return { path: '/home/me/fallback', kind: 'dir' };
      },
    });
    assert.deepEqual(workspace, { hash: 'fallback-hash', cwd: '/home/me/fallback' });
    assert.deepEqual(calls, ['native', 'web', ['register', '/home/me/fallback']]);
  });
}

await test('desktop cancellation never opens a second picker or registers a directory', async () => {
  for (const result of [null, undefined, 'null', ' null ', '', '  ']) {
    const calls = [];
    const workspace = await pickExistingWorkspace({
      api: { registerWorkspace: async () => { calls.push('register'); } },
      desktopBridge: { aceDesktop_addWorkspace: async () => result },
      webPicker: async () => { calls.push('web'); return null; },
    });
    assert.equal(workspace, null);
    assert.deepEqual(calls, []);
  }
});

await test('cancelling the fallback picker ends the operation without registration', async () => {
  const calls = [];
  const workspace = await pickExistingWorkspace({
    api: { registerWorkspace: async () => { calls.push('register'); } },
    desktopBridge: {
      aceDesktop_addWorkspace: async () => { calls.push('native'); return { error: 'picker unavailable' }; },
    },
    webPicker: async () => { calls.push('web'); return null; },
  });
  assert.equal(workspace, null);
  assert.deepEqual(calls, ['native', 'web']);
});

for (const failure of ['web picker', 'registration rejection', 'registration error response']) {
  await test(`fallback propagates ${failure} without retrying either picker`, async () => {
    const calls = [];
    const error = new Error(failure);
    await assert.rejects(pickExistingWorkspace({
      api: {
        registerWorkspace: async () => {
          calls.push('register');
          if (failure === 'registration error response') return { error: error.message };
          throw error;
        },
      },
      desktopBridge: {
        aceDesktop_addWorkspace: async () => { calls.push('native'); return { error: 'picker unavailable' }; },
      },
      webPicker: async () => {
        calls.push('web');
        if (failure === 'web picker') throw error;
        return { path: '/home/me/repo', kind: 'dir' };
      },
    }), (actual) => {
      assert.equal(actual.message, error.message);
      if (failure !== 'registration error response') assert.equal(actual, error);
      return true;
    });
    assert.deepEqual(calls, failure === 'web picker' ? ['native', 'web'] : ['native', 'web', 'register']);
  });
}

await test('native failure reaches the mounted path picker host and registers its selection', async () => {
  resetPathPickerHostForTests();
  const requests = [];
  const unsubscribe = subscribePathPickRequests((request) => requests.push(request));
  const registered = [];
  const api = {
    registerWorkspace: async (cwd) => {
      registered.push(cwd);
      return { hash: 'host-hash', cwd };
    },
  };
  try {
    const result = pickExistingWorkspace({
      api,
      desktopBridge: { aceDesktop_addWorkspace: async () => ({ error: 'picker unavailable' }) },
    });
    await Promise.resolve();
    const request = currentPathPickRequest();
    assert.ok(request);
    assert.deepEqual(request.options, { mode: 'folder', purpose: 'workspace', api });
    assert.deepEqual(registered, []);
    assert.equal(resolvePathPick(request.id, { path: '/home/me/from-host', kind: 'dir' }), true);
    assert.deepEqual(await result, { hash: 'host-hash', cwd: '/home/me/from-host' });
    assert.deepEqual(registered, ['/home/me/from-host']);
    assert.deepEqual(requests, [request, null]);
    assert.equal(currentPathPickRequest(), null);
  } finally {
    unsubscribe();
    resetPathPickerHostForTests();
  }
});
