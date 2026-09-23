import { useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { VsIcon } from './Icon.jsx';
import { toast } from './Toast.jsx';
import { WorkspaceIcon } from './WorkspaceIcon.jsx';
import { WorkspaceIconPicker } from './WorkspaceIconPicker.jsx';
import { pickWorkspaceFolder } from '../lib/workspaceFolderPicker.js';
import {
  addWorkspaceFolder,
  canSaveWorkspaceProfile,
  createWorkspaceProfileDraft,
  removeWorkspaceFolder,
  workspaceFolderName,
  workspaceProfileSavePayload,
} from '../lib/workspaceProfile.js';

function FolderRow({ path, onRemove }) {
  return (
    <div className="ace-edit-workspace-folder-row h-[38px] px-3 flex items-center gap-2.5 text-[13px] text-fg">
      <VsIcon name="folder" size={14} className="text-fg-mute shrink-0" />
      <span className="min-w-0 flex-1 truncate">{workspaceFolderName(path)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="移除"
          className="w-6 h-6 -mr-1 rounded flex items-center justify-center text-fg-mute hover:text-fg hover:bg-surface-hi shrink-0"
        >
          <VsIcon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

// 「编辑项目」:名称 + 图标 + 源文件夹。主文件夹(workspace.cwd)不可移除;附加文件夹
// 可自由添加 / 移除。所有改动点「保存」才落盘,取消 / Esc / × 直接放弃。
export function EditWorkspaceModal({ api, workspace, onClose, onSaved, onRemove }) {
  const iconButtonRef = useRef(null);
  const [draft, setDraft] = useState(() => createWorkspaceProfileDraft(workspace));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const mainFolder = String(workspace?.cwd || '');

  const addFolder = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const picked = await pickWorkspaceFolder({ api });
      if (picked) {
        setDraft((prev) => ({
          ...prev,
          extraFolders: addWorkspaceFolder(prev.extraFolders, mainFolder, picked),
        }));
      }
    } catch (error) {
      toast({ kind: 'err', text: error?.message || String(error) });
    } finally {
      setAdding(false);
    }
  };

  const save = async (event, close) => {
    event.preventDefault();
    if (saving || !canSaveWorkspaceProfile(draft)) return;
    setSaving(true);
    try {
      const saved = await api.updateWorkspace(workspace.hash, workspaceProfileSavePayload(draft));
      await onSaved?.(saved);
      close();
    } catch (error) {
      toast({ kind: 'err', text: '保存失败:' + (error?.message || '') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        onClose={onClose}
        width={440}
        dismissOnBackdrop={!saving}
        labelledBy="ace-edit-workspace-title"
      >
        {({ close }) => (
          <form onSubmit={(event) => save(event, close)} className="ace-modal-form ace-edit-workspace-dialog">
            <div className="px-5 pt-4 pb-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="ace-edit-workspace-title" className="text-[16px] font-semibold text-fg">编辑项目</h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="关闭"
                  className="w-7 h-7 -mr-1.5 rounded-md flex items-center justify-center text-fg-mute hover:text-fg hover:bg-surface-hi"
                >
                  <VsIcon name="close" size={16} />
                </button>
              </div>

              <div className="mt-3.5 h-[34px] rounded-md border border-border bg-surface flex items-stretch focus-within:border-fg-mute">
                <button
                  ref={iconButtonRef}
                  type="button"
                  aria-label="选择图标"
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen((open) => !open)}
                  className="w-[34px] shrink-0 flex items-center justify-center rounded-l-md border-r border-border text-fg hover:bg-surface-hi"
                >
                  <WorkspaceIcon id={draft.icon.id} color={draft.icon.color} size={15} />
                </button>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  maxLength={240}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="项目名称"
                  className="min-w-0 flex-1 px-2.5 bg-transparent text-[13px] text-fg outline-none"
                />
              </div>
              {pickerOpen && (
                <WorkspaceIconPicker
                  anchorRef={iconButtonRef}
                  value={draft.icon}
                  onChange={(icon) => setDraft((prev) => ({ ...prev, icon }))}
                  onClose={() => setPickerOpen(false)}
                />
              )}

              <div className="mt-4 text-[13px] font-medium text-fg">源文件夹</div>
              <div className="ace-edit-workspace-folders mt-2 rounded-md border border-border bg-surface divide-y divide-border">
                <FolderRow path={mainFolder} />
                {draft.extraFolders.map((folder) => (
                  <FolderRow
                    key={folder}
                    path={folder}
                    onRemove={() => setDraft((prev) => ({
                      ...prev,
                      extraFolders: removeWorkspaceFolder(prev.extraFolders, folder),
                    }))}
                  />
                ))}
                <button
                  type="button"
                  onClick={addFolder}
                  disabled={adding}
                  className="ace-edit-workspace-folder-row w-full h-[38px] px-3 flex items-center gap-2.5 text-left text-[13px] text-fg hover:bg-surface-hi rounded-b-md disabled:opacity-60"
                >
                  <VsIcon name="folderAdd" size={14} className="text-fg-mute shrink-0" />
                  <span>添加文件夹</span>
                </button>
              </div>
            </div>

            <div className="px-5 pb-4 flex items-center gap-2">
              {onRemove && (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  disabled={saving}
                  className="h-8 px-3 rounded-[5px] bg-danger/10 text-danger text-[12px] hover:opacity-80 disabled:opacity-50"
                >
                  移除本地项目
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="h-8 px-3 rounded-[5px] text-[12px] text-fg-mute hover:text-fg hover:bg-surface-hi disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                data-ace-dialog-primary="true"
                disabled={saving || !canSaveWorkspaceProfile(draft)}
                className="h-8 min-w-[60px] px-3.5 rounded-[5px] bg-fg text-bg text-[12px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving && <span className="ace-spinner w-3 h-3" />}
                保存
              </button>
            </div>
          </form>
        )}
      </Modal>
      {confirmingRemove && (
        <Modal onClose={() => setConfirmingRemove(false)} width={440} layerClassName="z-[400]">
          {({ close: closeConfirm }) => (
            <div className="p-4">
              <div className="text-[14px] font-semibold mb-2">移除本地项目</div>
              {/* 与右键菜单「从项目列表移除」同一句确认文案、同一个行为(不删磁盘文件)。 */}
              <div className="text-[12.5px] text-fg-mute leading-relaxed mb-4">仅从桌面项目列表移除，不会删除磁盘文件。继续？</div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-[12.5px] rounded-lg border border-border hover:bg-surface-hi"
                  onClick={closeConfirm}
                >
                  取消
                </button>
                <button
                  type="button"
                  data-ace-dialog-primary="true"
                  className="px-3 py-1.5 text-[12.5px] rounded-lg border border-danger/40 bg-danger-bg text-danger hover:opacity-80"
                  onClick={async () => {
                    setConfirmingRemove(false);
                    const removed = await onRemove?.(workspace);
                    if (removed !== false) onClose?.();
                  }}
                >
                  确认
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
