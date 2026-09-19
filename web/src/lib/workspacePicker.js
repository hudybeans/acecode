// 「添加项目 / 打开现有目录」的选择链路(openspec add-web-path-picker):
//   有 Desktop bridge → 优先原生目录对话框(aceDesktop_addWorkspace,壳内已顺带注册);
//   原生失败或没有 bridge(普通浏览器、Edge --app 兼容模式、远程 Web)→ web 路径选择器,拿到路径后
//   走现有的 POST /api/workspaces 注册。daemon 的原生 REST 对话框不再被这条链路调用。
//   原生取消直接结束,不再弹出 web 选择器(openspec fallback-workspace-picker-to-web)。
import { requestPathPick } from './pathPickerHost.js';

function desktopBridgeOrNull(desktopBridge) {
  if (desktopBridge !== undefined) return desktopBridge;
  return typeof window === 'undefined' ? null : window;
}
export function parseWorkspacePickerResult(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

export async function pickExistingWorkspace({ api, desktopBridge, webPicker = requestPathPick } = {}) {
  if (!api) throw new Error('workspace picker api required');

  const bridge = desktopBridgeOrNull(desktopBridge);
  if (typeof bridge?.aceDesktop_addWorkspace === 'function') {
    try {
      const workspace = parseWorkspacePickerResult(await bridge.aceDesktop_addWorkspace());
      if (workspace == null) return null;
      if (!workspace?.error && workspace?.hash) {
        if (workspace.cwd) {
          try {
            await api.registerWorkspace(workspace.cwd);
          } catch {
            // The desktop bridge may already have registered this directory.
          }
        }
        return workspace;
      }
    } catch {
      // Native picker/bridge failures (including malformed JSON) fall back to the web picker.
    }
  }

  const picked = await webPicker({ mode: 'folder', purpose: 'workspace', api });
  if (!picked?.path) return null;
  const workspace = await api.registerWorkspace(picked.path);
  if (workspace?.error) throw new Error(String(workspace.error));
  if (!workspace?.hash) return null;
  return workspace;
}
