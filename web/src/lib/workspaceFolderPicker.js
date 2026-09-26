// 「编辑项目」里「添加文件夹」的选择链路:
//   有 Desktop bridge → 原生目录对话框(aceDesktop_pickFolder,只返回路径、不注册项目);
//   原生失败或没有 bridge(普通浏览器、Edge --app 兼容模式、远程 Web)→ web 路径选择器。
//   原生取消直接结束,不再弹 web 选择器(与 workspacePicker 同一约定)。
import { requestPathPick } from './pathPickerHost.js';

function desktopBridgeOrNull(desktopBridge) {
  if (desktopBridge !== undefined) return desktopBridge;
  return typeof window === 'undefined' ? null : window;
}

function parseBridgeResult(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

// 返回选中目录的绝对路径;null = 用户取消。
export async function pickWorkspaceFolder({ api, desktopBridge, webPicker = requestPathPick } = {}) {
  const bridge = desktopBridgeOrNull(desktopBridge);
  if (typeof bridge?.aceDesktop_pickFolder === 'function') {
    try {
      const result = parseBridgeResult(await bridge.aceDesktop_pickFolder());
      if (result && result.ok !== false) {
        if (result.cancelled || !result.path) return null;
        return String(result.path);
      }
    } catch {
      // 原生对话框 / 桥接失败(含返回了坏 JSON)退回 web 选择器。
    }
  }
  const picked = await webPicker({ mode: 'folder', api });
  return picked?.path ? String(picked.path) : null;
}
