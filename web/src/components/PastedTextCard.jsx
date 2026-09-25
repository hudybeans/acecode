// 「粘贴的文本」卡片:输入框上方的粘贴块与对话记录里的粘贴块共用同一外观。
// 内联块与文件块外观一致,只有副标题不同;状态必须可见(上传中 / 待上传 / 失败 / 丢失)。
//
// status:
//   ready      可打开;文件块副标题带大小
//   uploading  上传中,仍可打开(文本在内存 File 里)
//   deferred   来自旧输入历史、尚未上传(开始编辑或发送时才上传)
//   failed     上传失败,点击重试
//   lost       刷新前没传完、内存 File 已不在,只能删除
import { useTranslation } from 'react-i18next';
import { clsx, formatBytes } from '../lib/format.js';
import { VsIcon } from './Icon.jsx';

function subtitleFor(status, sizeBytes) {
  if (status === 'uploading') return '粘贴的文本 · 上传中…';
  if (status === 'deferred') return '粘贴的文本 · 待上传';
  if (status === 'failed') return '上传失败，点击重试';
  if (status === 'lost') return '上传未完成，请重新粘贴';
  const size = Number(sizeBytes);
  return Number.isFinite(size) && size > 0 ? `粘贴的文本 · ${formatBytes(size)}` : '粘贴的文本';
}

export function PastedTextCard({
  title,
  sizeBytes,
  status = 'ready',
  removable = false,
  onOpen,
  onRemove,
  onRetry,
}) {
  useTranslation();
  const warning = status === 'failed' || status === 'lost';
  const activate = () => {
    if (status === 'failed') onRetry?.();
    else if (status !== 'lost') onOpen?.();
  };
  const displayTitle = String(title || '') || '粘贴的文本';
  return (
    <div
      role="button"
      tabIndex={0}
      data-composer-pasted-text={status}
      title={displayTitle}
      aria-disabled={status === 'lost' ? 'true' : undefined}
      className={clsx(
        'group relative flex h-[52px] w-[200px] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface pl-2 text-left',
        removable ? 'pr-6' : 'pr-2',
        status === 'lost' ? 'cursor-default' : 'cursor-pointer hover:border-accent-soft',
      )}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-fg-mute">
        <VsIcon name="document" size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
        <span className="truncate text-[12px] font-medium text-fg">{displayTitle}</span>
        <span className={clsx('truncate text-[11px]', warning ? 'text-warn' : 'text-fg-mute')}>
          {subtitleFor(status, sizeBytes)}
        </span>
      </span>
      {removable ? (
        <button
          type="button"
          className="absolute right-[5px] top-[5px] w-[17px] h-[17px] rounded-full bg-black/75 hover:bg-black/85 text-white flex items-center justify-center"
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.();
          }}
          aria-label="移除粘贴的文本"
        >
          <VsIcon name="close" size={8} />
        </button>
      ) : null}
    </div>
  );
}
