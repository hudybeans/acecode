import { Modal } from './Modal.jsx';

export function ThemeDownloadFailureDialog({ failure, onClose }) {
  if (!failure) return null;
  return (
    <Modal width={460} layerClassName="z-[400]" labelledBy="theme-download-failure-title" onClose={onClose}>
      <div className="p-5">
        <h3 id="theme-download-failure-title" className="text-base font-semibold">主题下载失败</h3>
        <p className="mt-3 break-all text-[13px] leading-relaxed">{failure.path || '主题资源'} 下载失败</p>
        <p className="mt-2 text-[12px] text-fg-mute">{failure.message}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-white" onClick={onClose}>知道了</button>
        </div>
      </div>
    </Modal>
  );
}
