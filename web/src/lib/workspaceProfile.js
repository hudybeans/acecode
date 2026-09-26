// 「编辑项目」对话框的纯逻辑:草稿、附加文件夹增删、保存载荷。组件只负责渲染。
// 主文件夹(workspace.cwd)不在草稿里 —— 它不可移除、不可修改。
import {
  DEFAULT_WORKSPACE_ICON_COLOR,
  DEFAULT_WORKSPACE_ICON_ID,
  isDefaultWorkspaceIcon,
  resolveWorkspaceIcon,
} from './workspaceIcons.js';

function looksLikeWindowsPath(path) {
  return /^[a-zA-Z]:/.test(path) || path.includes('\\');
}

// 比较用的键:统一正斜杠、去尾分隔符;Windows 路径大小写不敏感。与后端
// normalize_workspace_extra_folders 的去重口径一致。
export function workspaceFolderKey(path) {
  const raw = String(path || '').trim();
  let key = raw.replace(/\\/g, '/');
  while (key.length > 1 && key.endsWith('/')) key = key.slice(0, -1);
  return looksLikeWindowsPath(raw) ? key.toLowerCase() : key;
}

// 行内显示的文件夹名:路径最后一段;盘符根显示成 `C:`。
export function workspaceFolderName(path) {
  let clean = String(path || '').trim();
  while (clean.length > 1 && /[\\/]$/.test(clean)) clean = clean.slice(0, -1);
  const base = clean.split(/[\\/]/).pop() || '';
  if (base) return base;
  return clean || '';
}

export function createWorkspaceProfileDraft(workspace = {}) {
  const icon = resolveWorkspaceIcon(workspace.icon) || {
    id: DEFAULT_WORKSPACE_ICON_ID,
    color: DEFAULT_WORKSPACE_ICON_COLOR,
  };
  const extraFolders = Array.isArray(workspace.extra_folders)
    ? workspace.extra_folders.filter((folder) => typeof folder === 'string' && folder.trim())
    : [];
  return {
    name: String(workspace.name || ''),
    icon,
    extraFolders,
  };
}

// 添加一个附加文件夹:主文件夹本身或已在列表里的静默忽略(返回原数组)。
export function addWorkspaceFolder(extraFolders, mainFolder, path) {
  const folder = String(path || '').trim();
  if (!folder) return extraFolders;
  const key = workspaceFolderKey(folder);
  if (mainFolder && workspaceFolderKey(mainFolder) === key) return extraFolders;
  if (extraFolders.some((existing) => workspaceFolderKey(existing) === key)) return extraFolders;
  return [...extraFolders, folder];
}

export function removeWorkspaceFolder(extraFolders, path) {
  const key = workspaceFolderKey(path);
  return extraFolders.filter((folder) => workspaceFolderKey(folder) !== key);
}

export function canSaveWorkspaceProfile(draft) {
  return !!String(draft?.name || '').trim();
}

// PUT /api/workspaces/:hash 的请求体。默认图标 + 默认色发 null,等价于「未设置」。
export function workspaceProfileSavePayload(draft) {
  return {
    name: String(draft?.name || '').trim(),
    icon: isDefaultWorkspaceIcon(draft?.icon) ? null : { id: draft.icon.id, color: draft.icon.color },
    extra_folders: Array.isArray(draft?.extraFolders) ? draft.extraFolders.slice() : [],
  };
}
