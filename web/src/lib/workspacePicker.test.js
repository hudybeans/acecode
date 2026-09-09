import assert from 'node:assert/strict';
import {
  parseWorkspacePickerResult,
  pickExistingWorkspace,
} from './workspacePicker.js';

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
  const workspace = await pickExistingWorkspace({
    api: { registerWorkspace: async () => { throw new Error('already registered'); } },
    desktopBridge: {
      aceDesktop_addWorkspace: async () => ({ hash: 'abc', cwd: 'C:/repo' }),
    },
  });
  assert.equal(workspace.hash, 'abc');
});

await test('visible desktop picker errors are propagated', async () => {
  await assert.rejects(
    pickExistingWorkspace({
      api: { registerWorkspace: async () => {} },
      desktopBridge: {
        aceDesktop_addWorkspace: async () => ({ error: 'picker unavailable' }),
      },
    }),
    /picker unavailable/,
  );
});
