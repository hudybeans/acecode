import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { environmentError, shouldOfferCleanup } from '../lib/environmentSettings.js';
import { Modal } from './Modal.jsx';

export function WorkspaceCleanupNotice({ enabled }) {
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api.getDataDirectory().then((status) => {
      if (!cancelled && shouldOfferCleanup(status)) setNotice(status.cleanup);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);
  if (!enabled || !notice) return null;
  const choose = async (action) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.cleanupDataDirectory(action); setNotice(null); }
    catch (err) { setError(environmentError(err)); }
    finally { setBusy(false); }
  };
  return <Modal width={470} onClose={() => {}} dismissOnBackdrop={false} dismissOnEscape={false}
    layerClassName="z-[430]" labelledBy="workspace-cleanup-title">
    <div className="p-5">
      <h3 id="workspace-cleanup-title" className="text-[15px] font-semibold">清理旧工作空间？</h3>
      <p className="text-[13px] text-fg-mute my-3">新工作空间已成功启动，可以删除旧备份以节省磁盘空间。</p>
      <p className="text-[12px] break-all select-text">{notice.previous_dir}</p>
      <p className="text-[12px] text-fg-mute mt-2">{(notice.size_bytes / 1024 / 1024).toFixed(1)} MB</p>
      {error && <p role="alert" className="text-danger text-[12px] mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-5">
        <button className="ace-settings-button" disabled={busy} onClick={() => choose('keep')}>保留</button>
        <button className="ace-settings-button ace-settings-primary" disabled={busy} onClick={() => choose('delete')}>删除旧数据</button>
      </div>
    </div>
  </Modal>;
}
