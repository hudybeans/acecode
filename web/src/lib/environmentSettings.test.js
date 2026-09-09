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
assert.equal(await pickEnvironmentPath('file', client, { win: {} }), '/rest');
assert.equal(await pickEnvironmentPath('folder', client, { win: {} }), null);
assert.equal(await pickEnvironmentPath('file', client, { win: { aceDesktop_pickPreviewFile: async () => ({ ok: true, cancelled: true }) } }), null);

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
