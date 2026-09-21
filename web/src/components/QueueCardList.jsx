// InputBar 上方的"排队卡片栈"。
// 排队消息(QUEUED / SENDING / FAILED)从聊天 transcript 中独立出来,
// 作为 InputBar 紧邻上方的垂直卡片列表呈现:每张卡片自带删除按钮,
// FAILED 状态额外露出"重试"按钮;COMPLETED / CANCELLED 完全不显示。
// 设计上参考 Codex 的待发送草稿堆,与已发送 user 气泡视觉明显区分。
//
// 设计约束(取自 design.md):
//  - 空 items 时返回 null,不渲染任何容器
//  - max-height: 30vh + overflow,避免吃掉聊天可见区
//  - 卡片整体不变色 hover,按钮自身才有 hover
//  - SENDING 短暂窗口卡片仍渲染但 opacity-60,接力到 transcript 由 WS 帧驱动
//  - 队列暂停(用户中断了回合)时卡片栈顶部多一条横幅:「由于你中断了当前响应,
//    队列已暂停」+ 右侧「继续」按钮;横幅只在有卡片时出现,与卡片同栈滚动

import { useEffect, useMemo, useState } from 'react';
import { clsx } from '../lib/format.js';
import { buildQueueCardItem, buildQueuePausedBanner } from '../lib/queueCardItem.js';
import { Modal } from './Modal.jsx';
import { VsIcon } from './Icon.jsx';
import { RichComposer } from './RichComposer.jsx';
import { composerContentAttachments } from '../lib/composerContent.js';
import { useSlashCommands } from './SlashCommandsContext.jsx';

function QueueCardEditDialog({ card, onClose, onSave }) {
  const [draft, setDraft] = useState(card.editText || '');
  const [content, setContent] = useState(card.composerContent);
  const { commands } = useSlashCommands();
  const resources = useMemo(() => composerContentAttachments(card.composerContent), [card.composerContent]);
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 || composerContentAttachments(content).length > 0 || card.hasContexts || (!content && card.hasExtras);

  useEffect(() => {
    setDraft(card.editText || '');
    setContent(card.composerContent);
  }, [card.queuedId, card.editText, card.composerContent]);

  const submit = (event) => {
    event.preventDefault();
    if (!canSave) return;
    onSave?.(card.queuedId, draft, content);
    onClose?.();
  };

  return (
    <Modal
      onClose={onClose}
      width={520}
      labelledBy="queue-card-edit-title"
    >
      <form onSubmit={submit} className="ace-modal-form">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3.5">
          <VsIcon name="edit" size={16} className="shrink-0 text-fg-mute" />
          <h2 id="queue-card-edit-title" className="text-[14px] font-semibold text-fg">编辑排队消息</h2>
        </div>
        <div className="min-h-0 overflow-y-auto ace-scrollbar px-4 py-4">
          <RichComposer
            value={draft}
            composerContent={content}
            attachments={resources}
            commands={commands}
            submitOnEnter={false}
            aria-label="排队消息内容"
            onChange={(text, nextContent) => { setDraft(text); setContent(nextContent); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSave) {
                event.preventDefault();
                event.currentTarget.closest('form')?.requestSubmit();
              }
            }}
            className="min-h-[180px] w-full resize-none rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[13px] leading-5 text-fg outline-none transition focus:border-accent"
          />
          <div className="mt-1.5 text-[11px] text-fg-mute">Ctrl+Enter 保存</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-surface-hi"
          >
            取消
          </button>
          <button
            type="submit"
            data-ace-dialog-primary="true"
            disabled={!canSave}
            className="flex h-8 min-w-[64px] items-center justify-center rounded-md bg-accent px-3 text-[12px] text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QueueCard({ card, onCancel, onRetry, onGuide, onEdit, guideDisabled }) {
  const { queuedId, content, statusKind, statusLabel, dimmed, showRetry, canEdit, canGuide } = card;
  return (
    <div
      role="listitem"
      data-queue-card-state={statusKind}
      className={clsx(
        'ace-queue-card relative flex shrink-0 items-center gap-2 pl-3 pr-2 py-2 text-[13px]',
        dimmed && 'ace-queue-card-dimmed',
      )}
    >
      <span
        className="ace-queue-card-content flex-1 min-w-0 truncate"
        title={content}
      >
        {content}
      </span>
      <span
        className={clsx(
          'ace-queue-card-status shrink-0 text-[11px]',
          statusKind === 'failed' && 'is-failed',
        )}
        title={statusKind === 'failed' ? statusLabel : undefined}
      >
        {statusLabel}
      </span>
      {showRetry && (
        <button
          type="button"
          aria-label="重试发送"
          onClick={() => onRetry?.(queuedId)}
          className="ace-queue-card-action shrink-0 px-1.5 h-6 rounded text-[11px]"
        >
          重试
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          aria-label="编辑排队消息"
          onClick={() => onEdit?.(queuedId)}
          className="ace-queue-card-edit shrink-0 w-6 h-6 rounded flex items-center justify-center"
          title="编辑刚刚发出的内容"
        >
          <VsIcon name="edit" size={12} />
        </button>
      )}
      {canGuide && (
        <button
          type="button"
          aria-label="将排队消息插入当前回合"
          onClick={() => onGuide?.(queuedId)}
          disabled={guideDisabled}
          className="ace-queue-card-guide shrink-0 h-6 px-2 rounded-full flex items-center gap-1 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
          title="在当前回合的下一次模型调用前加入这条消息"
        >
          <span>插话</span>
          <VsIcon name="glyphUp" size={10} />
        </button>
      )}
      <button
        type="button"
        aria-label="取消排队"
        onClick={() => onCancel?.(queuedId)}
        className="ace-queue-card-close shrink-0 w-6 h-6 rounded flex items-center justify-center"
        title="取消"
      >
        <VsIcon name="close" size={12} />
      </button>
    </div>
  );
}

function QueuePausedBanner({ banner, onResume }) {
  return (
    <div
      role="status"
      data-queue-paused={banner.reason}
      className="ace-queue-card ace-queue-card-paused flex shrink-0 items-center gap-2 pl-3 pr-2 py-2 text-[13px]"
    >
      <VsIcon name="Pause" size={12} className="ace-queue-card-paused-icon shrink-0" />
      <span className="ace-queue-card-paused-text flex-1 min-w-0 truncate" title={banner.message}>
        {banner.message}
      </span>
      <button
        type="button"
        aria-label="继续发送排队的消息"
        onClick={() => onResume?.()}
        className="ace-queue-card-resume shrink-0 h-6 pl-1.5 pr-2 rounded-md flex items-center gap-1 text-[12px]"
        title={banner.resumeTitle}
      >
        <VsIcon name="run" size={11} />
        <span>{banner.resumeLabel}</span>
      </button>
    </div>
  );
}

export function QueueCardList({
  items, paused = null, onResume, onCancel, onRetry, onGuide, onSaveEdit, guideDisabled = false,
}) {
  const list = Array.isArray(items) ? items : [];
  const [editingId, setEditingId] = useState('');
  if (list.length === 0) return null;
  const cards = list.map(buildQueueCardItem).filter((c) => c.queuedId);
  if (cards.length === 0) return null;
  const editingCard = cards.find((card) => card.queuedId === editingId && card.canEdit) || null;
  const pausedBanner = buildQueuePausedBanner(paused);
  return (
    <>
      <div className="ace-queue-card-strip flex flex-col gap-1.5 px-2.5 pt-2 pb-1.5 max-h-[30vh] overflow-y-auto">
        {pausedBanner && <QueuePausedBanner banner={pausedBanner} onResume={onResume} />}
        <div
          role="list"
          aria-label="排队中的待发送消息"
          className="flex flex-col gap-1.5"
        >
          {cards.map((card) => (
            <QueueCard
              key={card.queuedId}
              card={card}
              onCancel={onCancel}
              onRetry={onRetry}
              onGuide={onGuide}
              onEdit={setEditingId}
              guideDisabled={guideDisabled}
            />
          ))}
        </div>
      </div>
      {editingCard && (
        <QueueCardEditDialog
          card={editingCard}
          onClose={() => setEditingId('')}
          onSave={onSaveEdit}
        />
      )}
    </>
  );
}

export default QueueCardList;
