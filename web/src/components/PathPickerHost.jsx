// 挂在 App 顶层的路径选择器宿主(openspec add-web-path-picker):订阅 lib/pathPickerHost.js
// 的请求队列,有请求时渲染 PathPickerModal,弹窗结束后结算 Promise。
// 上次确认的文件夹记在 localStorage(acecode.pathPicker.v1),文件夹模式下作为起始目录。
import { useEffect, useState } from 'react';
import { api as defaultApi } from '../lib/api.js';
import { usePreference } from '../lib/usePreference.js';
import {
  PATH_PICKER_PREFS_DEFAULTS,
  PATH_PICKER_PREFS_KEY,
  rememberedFolderAfterPick,
  validatePathPickerPrefs,
} from '../lib/pathPicker.js';
import {
  currentPathPickRequest,
  resolvePathPick,
  subscribePathPickRequests,
} from '../lib/pathPickerHost.js';
import { PathPickerModal } from './PathPickerModal.jsx';

export function PathPickerHost() {
  const [request, setRequest] = useState(() => currentPathPickRequest());
  const [prefs, setPrefs] = usePreference(
    PATH_PICKER_PREFS_KEY,
    PATH_PICKER_PREFS_DEFAULTS,
    validatePathPickerPrefs,
  );

  useEffect(() => subscribePathPickRequests(setRequest), []);

  if (!request) return null;
  const { id, options } = request;
  const handleResolve = (result) => {
    const folder = rememberedFolderAfterPick(result);
    if (folder) setPrefs({ lastFolder: folder });
    resolvePathPick(id, result);
  };

  return (
    <PathPickerModal
      key={id}
      api={options.api || defaultApi}
      mode={options.mode === 'file' ? 'file' : 'folder'}
      initialPath={options.initialPath || ''}
      lastFolder={prefs.lastFolder || ''}
      purpose={options.purpose || ''}
      onResolve={handleResolve}
    />
  );
}
