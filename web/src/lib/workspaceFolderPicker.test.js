import assert from 'node:assert/strict';
import { pickWorkspaceFolder } from './workspaceFolderPicker.js';

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const unexpectedWebPicker = async () => {
  throw new Error('web picker should not be used');
};

// 场景:Desktop 壳里点「添加文件夹」。期望:走原生对话框 aceDesktop_pickFolder,
// 直接返回路径;不能调 aceDesktop_addWorkspace(那会把目录注册成新项目)。
await test('desktop bridge returns the picked folder without registering a workspace', async () => {
  const path = await pickWorkspaceFolder({
    desktopBridge: {
      aceDesktop_pickFolder: async () => ({ ok: true, cancelled: false, path: 'D:/shared/lib' }),
      aceDesktop_addWorkspace: async () => { throw new Error('must not register'); },
    },
    webPicker: unexpectedWebPicker,
  });
  assert.equal(path, 'D:/shared/lib');
});

// 场景:原生对话框里点了取消(桥接可能返回 JSON 字符串)。期望:返回 null,
// 且不再弹 web 选择器。
await test('native cancel ends without falling back to the web picker', async () => {
  const path = await pickWorkspaceFolder({
    desktopBridge: {
      aceDesktop_pickFolder: async () => JSON.stringify({ ok: true, cancelled: true }),
    },
    webPicker: unexpectedWebPicker,
  });
  assert.equal(path, null);
});

// 场景:原生对话框报错(例如 Linux 缺 zenity)。期望:退回 web 路径选择器。
await test('native failure falls back to the web picker', async () => {
  const calls = [];
  const path = await pickWorkspaceFolder({
    api: { name: 'api' },
    desktopBridge: {
      aceDesktop_pickFolder: async () => ({ ok: false, error: 'no picker' }),
    },
    webPicker: async (options) => {
      calls.push(options);
      return { path: 'E:/docs', kind: 'dir' };
    },
  });
  assert.equal(path, 'E:/docs');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'folder');
});

// 场景:普通浏览器 / 远程 Web(没有桥接)。期望:直接走 web 选择器;取消 → null。
await test('web mode uses the web picker', async () => {
  assert.equal(await pickWorkspaceFolder({
    desktopBridge: null,
    webPicker: async () => ({ path: '/srv/data', kind: 'dir' }),
  }), '/srv/data');
  assert.equal(await pickWorkspaceFolder({
    desktopBridge: null,
    webPicker: async () => null,
  }), null);
});
