import { fileSourcePath } from './composerFileTransfer.js';
import { isDesktopShell } from './desktopShellMode.js';
import { parseNativeFilesystemItemsResult } from './desktopContextPicker.js';
import {
  desktopHostOs,
  hasNativeFilesystemClipboard,
  hasNativeFilesystemMaterializer,
  localPathsFromUriList,
  materializeNativeFilesystemPaths,
  readNativeClipboardFilesystemItems,
} from './desktopFilesystemTransfer.js';

const MAX_LOCAL_DATA_BYTES = 25 * 1024 * 1024;

async function storeLocalFiles(files, win) {
  if (typeof win?.aceDesktop_storeContextFiles !== 'function') {
    throw new Error('当前桌面版本无法保存文件，请更新客户端后重试');
  }
  const payload = [];
  for (const file of files) {
    if (file.size > MAX_LOCAL_DATA_BYTES) throw new Error('无本地路径的文件数据不能超过 25 MiB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    payload.push({ name: file.name || 'clipboard-file', data_base64: btoa(binary) });
  }
  return parseNativeFilesystemItemsResult(await win.aceDesktop_storeContextFiles(payload));
}

// Acquisition differs by host; classification and the returned insertion
// contract do not. Never infer a local path from ordinary clipboard text.
export async function resolveComposerFileIntake({
  source, files = [], paths = [], uriList = '', items = null,
} = {}, win = globalThis.window) {
  if (items) return { kind: 'paths', items };
  const list = Array.from(files || []).filter(Boolean);
  const desktop = isDesktopShell(win) || hasNativeFilesystemMaterializer(win)
    || hasNativeFilesystemClipboard(win);
  if (!desktop) return list.length ? { kind: 'upload', files: list } : { kind: 'none' };

  const localPaths = paths.length ? paths : localPathsFromUriList(uriList, desktopHostOs(win));
  if (localPaths.length) {
    const result = await materializeNativeFilesystemPaths(localPaths, win);
    return { kind: 'paths', items: result.items };
  }
  if (source === 'paste' && hasNativeFilesystemClipboard(win)) {
    const result = await readNativeClipboardFilesystemItems(win);
    if (result.filesystemItems) return { kind: 'paths', items: result.items };
  }
  if (!list.length) return { kind: 'none' };

  // A trusted source path always wins, including for local image files.
  // Keep mixed batches in source order without sending known files as bytes.
  const resolved = [];
  for (const file of list) {
    const path = fileSourcePath(file);
    const result = path
      ? await materializeNativeFilesystemPaths([path], win)
      : await storeLocalFiles([file], win);
    resolved.push(...result.items);
  }
  return { kind: 'paths', items: resolved };
}
