import { Modal } from './Modal.jsx';

export function ThemeDownloadFailureDialog({ failure, onClose }) {
  if (!failure) return null;
  return (
    <Modal width={460} layerClassName="z-[400]" labelledBy="theme-download-failure-title" onClose={onClose}>
      <div className="p-5">
        <h3 id="theme-download-failure-title" className="text-base font-semibold">主题操作失败</h3>
        <p className="mt-3 text-[13px] leading-relaxed">{failure.message}</p>
        {failure.path && <p className="mt-2 break-all text-[12px] text-fg-mute">{failure.path}</p>}
        <div className="mt-5 flex justify-end">
          <button type="button" data-ace-dialog-primary="true" className="rounded-md bg-accent px-3 py-1.5 text-white" onClick={onClose}>知道了</button>
        </div>
      </div>
    </Modal>
  );
}
