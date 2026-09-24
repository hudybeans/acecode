import { pickNativePreviewFile, hasNativePreviewFilePicker } from './desktopPreviewFilePicker.js';
import { isDesktopShell } from './desktopShellMode.js';
import { requestPathPick } from './pathPickerHost.js';

export const TOOLCHAIN_FIELDS = [
  { id: 'python', label: 'Python 工具', detail: 'uv / ruff / mypy' },
  { id: 'node', label: 'Node.js 工具', detail: 'pnpm / npm / tsx' },
  { id: 'csharp', label: 'C# 工具', detail: 'dotnet SDK / Roslyn' },
];

export function toolchainPillState(item) {
  if (!item?.dir) return { label: '使用 PATH', tone: 'muted' };
  return item.exists ? { label: '已配置', tone: 'ok' } : { label: '目录不存在', tone: 'danger' };
}

export function terminalPath(config, id = config?.default_shell) {
  return config?.shell_paths?.[id]
    || (config?.resolved?.id === id ? config.resolved.program : '')
    || config?.candidates?.find((item) => item.id === id)?.detected_path || '';
}

export function shouldOfferCleanup(status) {
  return status?.redirect_active === true && !!status?.cleanup?.previous_dir
    && Number(status.cleanup.size_bytes) > 100 * 1024 * 1024;
}

export function migrationPercent(job) {
  if (job?.state === 'done') return 100;
  return job?.total_bytes > 0
    ? Math.min(100, Math.max(0, Math.floor(job.copied_bytes / job.total_bytes * 100))) : 0;
}

// 迁移进度轮询间隔与连续失败上限。3 次(约 2 秒)能容忍迁移期间的单次抖动,
// 又不至于让界面长时间停在「迁移中」、所有设置项被禁用。
export const MIGRATION_POLL_INTERVAL_MS = 750;
export const MIGRATION_POLL_MAX_FAILURES = 3;

export function migrationFailureMessage(job) {
  const detail = typeof job?.error === 'string' ? job.error.trim() : '';
  return detail ? `迁移失败：${detail}` : '迁移失败';
}

function isMigrationNotFound(error) {
  return error?.status === 404
    || error?.code === 'MIGRATION_NOT_FOUND'
    || error?.body?.error === 'MIGRATION_NOT_FOUND';
}

// 一次迁移进度轮询的判定。输入是本次请求的结果(next 或 error)与此前的连续失败次数,
// 输出一个由组件执行的动作:
//   replace      用服务端返回的 job 整体替换(outcome.job)
//   clear        job 置 null(daemon 已重启,任务不存在)
//   keep         瞬时失败,不动 job(组件用函数式更新,不会用闭包里的旧 job 回退进度)
//   mark-unknown 连续失败达到上限,停止轮询并把 job 标为 unknown
// stop 为真时组件不再安排下一次轮询;refreshDirectory 为真时组件在轮询之外单独刷新目录状态。
export function migrationPollOutcome({ next, error, failures = 0 } = {}) {
  const outcome = { action: 'keep', stop: false, failures: 0, message: '', refreshDirectory: false, job: null };
  if (error) {
    if (isMigrationNotFound(error)) {
      return { ...outcome, action: 'clear', stop: true, message: environmentError({ code: 'MIGRATION_NOT_FOUND' }) };
    }
    const count = Math.max(0, Number(failures) || 0) + 1;
    if (count >= MIGRATION_POLL_MAX_FAILURES) {
      return {
        ...outcome,
        action: 'mark-unknown',
        stop: true,
        failures: count,
        message: `无法获取迁移进度：${environmentError(error)}`,
      };
    }
    return { ...outcome, failures: count };
  }
  if (!next || typeof next !== 'object') {
    return { ...outcome, action: 'clear', stop: true };
  }
  const base = { ...outcome, action: 'replace', job: next };
  if (next.state === 'running') return base;
  if (next.state === 'done') return { ...base, stop: true, refreshDirectory: true };
  if (next.state === 'failed') return { ...base, stop: true, message: migrationFailureMessage(next) };
  // idle / 缺 state 等未知状态:停止轮询,防止无限请求。
  return { ...base, stop: true };
}

export function applyMigrationPollOutcome(prev, outcome) {
  switch (outcome?.action) {
    case 'replace': return outcome.job ?? null;
    case 'clear': return null;
    case 'mark-unknown': return prev ? { ...prev, state: 'unknown' } : prev;
    default: return prev;
  }
}

export function environmentError(error) {
  const code = error?.body?.error || error?.code;
  const messages = {
    TARGET_REQUIRED: '请选择新路径',
    TARGET_NOT_ABSOLUTE: '请输入完整的文件夹路径',
    TARGET_SAME_AS_CURRENT: '新路径与当前路径相同',
    TARGET_INSIDE_CURRENT: '新路径不能位于当前工作空间内',
    TARGET_CONTAINS_CURRENT: '新路径不能包含当前工作空间',
    TARGET_NOT_A_DIRECTORY: '请选择文件夹',
    TARGET_NOT_EMPTY: '请选择空文件夹',
    TARGET_NOT_WRITABLE: '无法写入所选文件夹',
    DIRECTORY_NOT_FOUND: '目录不存在',
    DIRECTORY_NOT_ABSOLUTE: '请输入完整的文件夹路径',
    SESSIONS_BUSY: '请等待正在运行的任务完成后再迁移',
    OTHER_INSTANCES_ACTIVE: '请关闭其他 ACECode 窗口后再迁移',
    CONSOLES_ACTIVE: '请关闭控制台终端后再迁移',
    DATA_DIR_MIGRATION_ACTIVE: '工作空间正在迁移，请等待完成并重启',
    MIGRATION_ACTIVE: '工作空间正在迁移，请等待完成并重启',
    MIGRATION_NOT_FOUND: '迁移任务已不存在，请重新发起迁移',
    PICKER_UNAVAILABLE: '当前环境不支持选择对话框，请手动输入路径',
    PERSIST_FAILED: '保存失败，请检查文件写入权限',
  };
  return messages[code] || error?.body?.message || error?.message || '操作失败';
}

// 当前值所在目录(带尾斜杠),作为选择器的起始目录;相对路径 / 空值 → ''。
function directoryOfPath(filePath) {
  const normalized = typeof filePath === 'string'
    ? filePath.trim().replace(/\\/g, '/') : '';
  return /^(?:[A-Za-z]:\/|\/)/.test(normalized)
    ? normalized.slice(0, normalized.lastIndexOf('/') + 1) : '';
}

// 设置页「浏览」的选择链路(openspec add-web-path-picker):
//   Desktop 壳选文件 → bridge 原生文件对话框;Desktop 壳选目录 → daemon 原生 REST 对话框;
//   没有 Desktop bridge(普通浏览器 / Edge --app 兼容模式 / 远程 Web)→ web 路径选择器,
//   不再请求 REST(那会在 daemon 所在机器的桌面上弹框并把请求挂死)。
export async function pickEnvironmentPath(kind, client, {
  initialFilePath = '',
  win = globalThis.window,
  webPicker = requestPathPick,
} = {}) {
  const directory = directoryOfPath(initialFilePath);
  if (kind === 'file' && hasNativePreviewFilePicker(win)) {
    const result = await pickNativePreviewFile(directory, win);
    return result.cancelled ? null : result.path;
  }
  if (isDesktopShell(win)) {
    const result = await (kind === 'file' ? client.pickSettingsFile() : client.pickSettingsFolder());
    return typeof result?.path === 'string' && result.path ? result.path : null;
  }
  const picked = await webPicker({
    mode: kind === 'file' ? 'file' : 'folder',
    initialPath: directory,
    purpose: 'settings',
  });
  return typeof picked?.path === 'string' && picked.path ? picked.path : null;
}
