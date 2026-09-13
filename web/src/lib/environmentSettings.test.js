import assert from 'node:assert/strict';
import { migrationPercent, pickEnvironmentPath, shouldOfferCleanup, terminalPath, toolchainPillState } from './environmentSettings.js';
assert.equal(shouldOfferCleanup({ redirect_active: true, cleanup: { previous_dir: '/old', size_bytes: 100 * 1024 * 1024 } }), false);
assert.equal(shouldOfferCleanup({ redirect_active: true, cleanup: { previous_dir: '/old', size_bytes: 100 * 1024 * 1024 + 1 } }), true);
assert.equal(shouldOfferCleanup({ redirect_active: false, cleanup: { previous_dir: '/old', size_bytes: 1000e6 } }), false);
assert.equal(migrationPercent({ total_bytes: 100, copied_bytes: 40 }), 40);
assert.equal(terminalPath({ default_shell: 'cmd', shell_paths: { cmd: '/explicit' }, resolved: { id: 'cmd', program: '/fallback' } }), '/explicit');
assert.equal(toolchainPillState({ dir: '/missing', exists: false }).tone, 'danger');
const calls = [];
const client = { pickSettingsFile: async () => { calls.push('rest'); return { path: '/rest' }; }, pickSettingsFolder: async () => null };
assert.equal(await pickEnvironmentPath('file', client, { win: { aceDesktop_pickPreviewFile: async () => { calls.push('native'); return { ok: true, path: '/native' }; } } }), '/native');
assert.deepEqual(calls, ['native']);
// Desktop 壳(有 bridge 但没有专用文件选择器)仍走 daemon 的原生 REST 对话框。
const shellWin = { aceDesktop_openInExplorer() {} };
assert.equal(await pickEnvironmentPath('file', client, { win: shellWin }), '/rest');
assert.equal(await pickEnvironmentPath('folder', client, { win: shellWin }), null);
assert.equal(await pickEnvironmentPath('file', client, { win: { aceDesktop_pickPreviewFile: async () => ({ ok: true, cancelled: true }) } }), null);

// 场景:没有 Desktop bridge(普通浏览器 / 兼容模式 / 远程 Web)。期望:走 web 路径选择器,
// 目录模式起始目录为空、文件模式起始于当前值所在目录;取消返回 null;REST 原生对话框不被调用。
const restCallsBeforeWeb = calls.filter((call) => call === 'rest').length;
const webCalls = [];
const webPicker = async (options) => {
  webCalls.push(options);
  return { path: options.mode === 'file' ? '/picked/pwsh' : '/picked', kind: options.mode === 'file' ? 'file' : 'dir' };
};
assert.equal(await pickEnvironmentPath('folder', client, { win: {}, webPicker }), '/picked');
assert.equal(await pickEnvironmentPath('file', client, { win: {}, webPicker, initialFilePath: '/usr/local/bin/pwsh' }), '/picked/pwsh');
assert.deepEqual(webCalls.map((options) => [options.mode, options.initialPath, options.purpose]), [
  ['folder', '', 'settings'],
  ['file', '/usr/local/bin/', 'settings'],
]);
assert.equal(await pickEnvironmentPath('folder', client, { win: {}, webPicker: async () => null }), null);
assert.equal(calls.filter((call) => call === 'rest').length, restCallsBeforeWeb);

for (const [initialFilePath, expectedDirectory] of [
  ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:/Program Files/PowerShell/7/'],
  ['C:\\pwsh.exe', 'C:/'],
  ['\\\\server\\tools\\pwsh.exe', '//server/tools/'],
  ['/usr/local/bin/pwsh', '/usr/local/bin/'],
  ['  C:/工具/pwsh.exe  ', 'C:/工具/'],
  ['pwsh.exe', ''],
  ['C:pwsh.exe', ''],
  ['', ''],
]) {
  let request;
  const result = await pickEnvironmentPath('file', client, {
    initialFilePath,
    win: { aceDesktop_pickPreviewFile: async (payload) => {
      request = payload;
      return { ok: true, cancelled: true };
    } },
  });
  assert.deepEqual(request, { cwd: expectedDirectory });
  assert.equal(result, null);
}
const restCallsBeforeFailure = calls.filter((call) => call === 'rest').length;
await assert.rejects(() => pickEnvironmentPath('file', client, {
  win: { aceDesktop_pickPreviewFile: async () => ({ ok: false, error: 'native failure' }) },
}), /native failure/);
assert.equal(calls.filter((call) => call === 'rest').length, restCallsBeforeFailure);
console.log('[pass] environment settings, cleanup threshold, and picker behavior');
console.log('[pass] terminal browsing forwards absolute parent directories and keeps cancellation quiet');
console.log('[pass] native picker errors do not launch a second picker through REST');
