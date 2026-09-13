import { requestPathPick } from './pathPickerHost.js';

function parseBridgeJson(raw) {
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  return text ? JSON.parse(text) : null;
}

function absolutePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (/^[A-Za-z]:[\\/]/u.test(path) || /^\\\\/u.test(path) || path.startsWith('/')) {
    return path;
  }
  return '';
}

export function hasNativePreviewFilePicker(win = globalThis.window) {
  return typeof win?.aceDesktop_pickPreviewFile === 'function';
}

export function parseNativePreviewFilePickerResult(raw) {
  const body = parseBridgeJson(raw);
  if (!body || typeof body !== 'object') throw new Error('原生选择器返回无效结果');
  if (body.ok === false) throw new Error(String(body.error || '原生选择器不可用'));
  if (body.cancelled === true) return { cancelled: true, path: '' };

  const path = absolutePath(body.path);
  if (!path) throw new Error('无法获取文件路径');
  return { cancelled: false, path };
}

export async function pickNativePreviewFile(cwd = '', win = globalThis.window) {
  if (!hasNativePreviewFilePicker(win)) throw new Error('原生选择器不可用');
  const raw = await win.aceDesktop_pickPreviewFile({ cwd: String(cwd || '') });
  return parseNativePreviewFilePickerResult(raw);
}

// 侧面板「打开文件」的选择链路(openspec add-web-path-picker):Desktop 壳走专用原生
// 文件对话框;没有 bridge 的页面走 web 路径选择器的文件模式,起始于会话工作目录。
// 两条路径返回同一形状 { cancelled, path },调用方不用区分来源。
export async function pickPreviewFile(cwd = '', {
  win = globalThis.window,
  webPicker = requestPathPick,
  api,
} = {}) {
  if (hasNativePreviewFilePicker(win)) return pickNativePreviewFile(cwd, win);
  const picked = await webPicker({ mode: 'file', initialPath: String(cwd || ''), purpose: 'preview', api });
  return typeof picked?.path === 'string' && picked.path
    ? { cancelled: false, path: picked.path }
    : { cancelled: true, path: '' };
}
