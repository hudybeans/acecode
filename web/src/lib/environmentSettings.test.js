import assert from 'node:assert/strict';
import {
  MIGRATION_POLL_MAX_FAILURES, applyMigrationPollOutcome, migrationFailureMessage, migrationPercent, migrationPollOutcome,
  migrationSkippedFilesHint,
  pickEnvironmentPath, shouldOfferCleanup, terminalPath, toolchainPillState,
} from './environmentSettings.js';
import { ApiError } from './api.js';
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
// ---- 迁移进度轮询判定(fix feedback YTB-12741:迁移出错后界面卡死)----
// 回归背景:修复前轮询在 catch 里仍 750ms 后重试,而服务端因 GBK 错误文本每次都 500,
// 界面永远停在「正在迁移工作空间…」,所有设置项被禁用,只能重启 ACECode。

// 场景:服务端返回 running。期望:整体替换 job、继续轮询、失败计数清零。
{
  const running = { state: 'running', copied_bytes: 10, total_bytes: 100 };
  const outcome = migrationPollOutcome({ next: running, failures: 2 });
  assert.equal(outcome.action, 'replace');
  assert.equal(outcome.stop, false);
  assert.equal(outcome.failures, 0);
  assert.equal(outcome.message, '');
  assert.equal(outcome.refreshDirectory, false);
  assert.equal(applyMigrationPollOutcome({ state: 'running', copied_bytes: 5 }, outcome), running);
}

// 场景:服务端返回 done。期望:停止轮询,并要求组件在轮询之外单独刷新目录状态。
{
  const outcome = migrationPollOutcome({ next: { state: 'done', restart_required: true } });
  assert.equal(outcome.action, 'replace');
  assert.equal(outcome.stop, true);
  assert.equal(outcome.refreshDirectory, true);
  assert.equal(outcome.message, '');
}

// 场景:服务端返回 failed 且带错误文本。期望:停止轮询,提示以「迁移失败：」开头并带上服务端错误。
{
  const outcome = migrationPollOutcome({ next: { state: 'failed', error: 'cannot copy x: 系统找不到指定的路径。' } });
  assert.equal(outcome.action, 'replace');
  assert.equal(outcome.stop, true);
  assert.ok(outcome.message.startsWith('迁移失败：'));
  assert.ok(outcome.message.includes('系统找不到指定的路径'));
}

// 场景:服务端返回 idle 或缺少 state 的未知形态。期望:停止轮询,防止对未知状态无限请求。
for (const next of [{ state: 'idle' }, {}]) {
  const outcome = migrationPollOutcome({ next });
  assert.equal(outcome.stop, true);
  assert.equal(outcome.action, 'replace');
}

// 场景:daemon 已重启,/migration 返回 404 MIGRATION_NOT_FOUND。期望:清空 job 并停止,提示重新发起迁移。
{
  const error = new ApiError(404, { error: 'MIGRATION_NOT_FOUND', message: 'no data directory migration has been started' });
  const outcome = migrationPollOutcome({ error, failures: 1 });
  assert.equal(outcome.action, 'clear');
  assert.equal(outcome.stop, true);
  assert.equal(outcome.message, '迁移任务已不存在，请重新发起迁移');
  assert.equal(applyMigrationPollOutcome({ state: 'running' }, outcome), null);
}

// 场景:单次 500(迁移期间的瞬时抖动)。期望:动作为 keep、继续轮询、失败计数 +1、不弹错误。
{
  const outcome = migrationPollOutcome({ error: new ApiError(500, { error: 'INTERNAL_ERROR', message: 'boom' }), failures: 0 });
  assert.equal(outcome.action, 'keep');
  assert.equal(outcome.stop, false);
  assert.equal(outcome.failures, 1);
  assert.equal(outcome.message, '');
}

// 场景:连续第 3 次请求失败(上限 3 次约 2 秒,容忍单次抖动又不长时间假死)。
// 期望:放弃轮询,标为 unknown 解除禁用,提示以「无法获取迁移进度：」开头。
{
  assert.equal(MIGRATION_POLL_MAX_FAILURES, 3);
  let failures = 0;
  let outcome;
  for (let i = 0; i < MIGRATION_POLL_MAX_FAILURES; i += 1) {
    outcome = migrationPollOutcome({ error: new ApiError(500, { error: 'INTERNAL_ERROR', message: 'boom' }), failures });
    failures = outcome.failures;
    if (i < MIGRATION_POLL_MAX_FAILURES - 1) assert.equal(outcome.action, 'keep');
  }
  assert.equal(outcome.action, 'mark-unknown');
  assert.equal(outcome.stop, true);
  assert.ok(outcome.message.startsWith('无法获取迁移进度：'));
  // 网络层错误(没有 status)同样计数。
  const networkOutcome = migrationPollOutcome({ error: new TypeError('Failed to fetch'), failures: 2 });
  assert.equal(networkOutcome.action, 'mark-unknown');
}

// 场景:瞬时失败后组件用函数式更新应用 keep。期望:原样返回 prev 对象,copied_bytes 不回退。
// 守住的问题:effect 闭包里的旧 job 覆盖新进度,进度条往回跳。
{
  const prev = { state: 'running', copied_bytes: 80, total_bytes: 100 };
  assert.equal(applyMigrationPollOutcome(prev, { action: 'keep' }), prev);
  // mark-unknown 只改 state,其余字段保留;prev 为 null 时保持 null。
  assert.deepEqual(applyMigrationPollOutcome(prev, { action: 'mark-unknown' }),
    { state: 'unknown', copied_bytes: 80, total_bytes: 100 });
  assert.equal(prev.state, 'running');
  assert.equal(applyMigrationPollOutcome(null, { action: 'mark-unknown' }), null);
}

// 场景:failed 但服务端 error 为空。期望:退回通用文案「迁移失败」。
assert.equal(migrationFailureMessage({ state: 'failed', error: '' }), '迁移失败');
assert.equal(migrationFailureMessage({ state: 'failed', error: 'disk full' }), '迁移失败：disk full');
console.log('[pass] migration poll outcome stops on failure and never rolls progress back');
// 场景:迁移完成,服务端 skipped_files 为 0 / 缺失 / 大于 0。
// 期望:只有大于 0 时才给出 Agent Browser 可能需要重新登录的提示,其余情况为空串(不显示小字)。
assert.equal(migrationSkippedFilesHint({ state: 'done', skipped_files: 0 }), '');
assert.equal(migrationSkippedFilesHint({ state: 'done' }), '');
assert.equal(migrationSkippedFilesHint(null), '');
assert.equal(migrationSkippedFilesHint({ state: 'done', skipped_files: 2 }),
  'Agent Browser 的部分浏览器数据未能复制，重启后可能需要重新登录');
console.log('[pass] migration skipped-files hint only appears when browser profile files were skipped');
