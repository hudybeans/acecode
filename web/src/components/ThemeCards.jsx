import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { clsx } from '../lib/format.js';
import { EVA_THEME_ID, themeDownloadPercent, themeJobActive, themePackageSize } from '../lib/themePackages.js';

const EVA_PREVIEW_SWATCHES = ['#E9DEFA', '#F9F5FE', '#B7EF65'];

export function ThemeCards({ options, selected, onSelect, downloads }) {
  const [confirmation, setConfirmation] = useState(null);
  const entry = downloads?.entry;
  const job = downloads?.job;
  const busy = themeJobActive(job);
  const canDownload = (!entry?.installed || entry?.update_available) && !busy;

  const selectEva = async () => {
    let current = entry;
    if (!current) {
      current = await downloads?.controller.refresh({ notify: true });
    }
    if (!current) return;
    if (current.installed && !current.update_available) void onSelect(EVA_THEME_ID);
    else setConfirmation(current);
  };

  return (
    <>
      <div className="ace-theme-cards">
        {options.map((option) => (
          <div key={option.key} className={clsx('ace-theme-card', selected === option.key && 'is-selected')}>
            <button type="button" aria-pressed={selected === option.key}
              onClick={() => onSelect(option.key)} className="ace-theme-card-choice">
              <div className={clsx('ace-theme-card-swatches', `ace-theme-preview-${option.key}`)} aria-hidden="true">
                <span className="ace-theme-preview-bg" /><span className="ace-theme-preview-surface" /><span className="ace-theme-preview-accent" />
              </div>
              <span className="ace-theme-card-name">{option.label}</span>
            </button>
          </div>
        ))}
        <div className={clsx('ace-theme-card ace-downloadable-theme', selected === EVA_THEME_ID && 'is-selected')}>
          <img className="ace-theme-card-background" src="/themes/eva-01-thumbnail.png" alt="EVA 初号机背景缩略图" draggable="false" />
          <button type="button" className={clsx('ace-theme-card-choice', canDownload && 'can-download')} aria-pressed={selected === EVA_THEME_ID}
            aria-label="EVA 初号机" aria-busy={busy || downloads?.loading} onClick={selectEva} disabled={busy || downloads?.loading}>
            <div className="ace-theme-card-swatches" aria-hidden="true">
              {EVA_PREVIEW_SWATCHES.map((fallback, index) => <span key={index} style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(entry?.swatches?.[index]) ? entry.swatches[index] : fallback }} />)}
            </div>
            <span className="ace-theme-card-name">EVA 初号机</span>
            <span className="ace-theme-card-state">{entry?.update_available ? '可更新' : selected === EVA_THEME_ID && entry?.installed ? '使用中' : entry?.installed ? '已下载' : '未下载'}</span>
            {canDownload && (
              <span className="ace-theme-card-download-cover" aria-hidden="true">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                </svg>
              </span>
            )}
          </button>
          {busy && (
            <div className="ace-theme-card-download" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span>{job.state === 'installing' ? '正在校验并安装…' : `下载中 ${themeDownloadPercent(job)}%`}</span>
                <button type="button" onClick={() => downloads.controller.cancel()} className="opacity-80 hover:opacity-100 underline underline-offset-2">取消下载</button>
              </div>
              <div className="ace-theme-progress" role="progressbar" aria-label="EVA 主题下载进度"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={themeDownloadPercent(job)}>
                <span style={{ width: `${themeDownloadPercent(job)}%` }} />
              </div>
              <div>{themePackageSize(job.bytes_downloaded)} / {themePackageSize(job.bytes_total)}</div>
            </div>
          )}
        </div>
      </div>
      {confirmation && (
        <Modal width={400} layerClassName="z-[400]" labelledBy="theme-download-title" onClose={() => setConfirmation(null)}>
          <div className="p-5">
            <h3 id="theme-download-title" className="text-base font-semibold">下载 EVA 初号机主题</h3>
            <p className="mt-3 text-sm text-fg-2">需要下载 {themePackageSize(confirmation.package.bytes)}，下载完成后自动应用。</p>
            {confirmation.installed && (
              <button type="button" className="mt-3 text-sm text-accent hover:underline" onClick={() => {
                setConfirmation(null);
                void onSelect(EVA_THEME_ID);
              }}>使用已下载版本</button>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="px-3 py-1.5 rounded-md border border-border hover:bg-surface-hi" onClick={() => setConfirmation(null)}>取消</button>
              <button type="button" className="px-3 py-1.5 rounded-md bg-accent text-white" onClick={() => {
                const entry = confirmation;
                setConfirmation(null);
                void downloads.controller.install(entry);
              }}>下载并应用</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
