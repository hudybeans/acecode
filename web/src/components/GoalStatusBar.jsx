import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clsx } from '../lib/format.js';
import { getGoalTrayState } from '../lib/goalControl.js';
import { Modal } from './Modal.jsx';
import { VsIcon } from './Icon.jsx';

function GoalIcon({ className = '' }) {
  return (
    <VsIcon name="Goal" size={16} className={className} />
  );
}

function PauseIcon({ className = '' }) {
  return (
    <VsIcon name="Pause" size={14} className={className} />
  );
}

function GoalActionButton({
  label,
  pending = false,
  disabled = false,
  onClick,
  children,
  danger = false,
  expanded,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      className={clsx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition',
        danger
          ? 'text-fg-mute hover:bg-danger-bg hover:text-danger'
          : 'text-fg-mute hover:bg-surface-hi hover:text-fg',
        disabled && 'cursor-wait opacity-50',
      )}
    >
      {pending ? <span className="ace-spinner text-[12px]" aria-hidden="true" /> : children}
    </button>
  );
}

function GoalEditModal({ objective, pending, onCancel, onSave }) {
  const [draft, setDraft] = useState(objective);
  const trimmed = draft.trim();
  const canSave = !pending && trimmed.length > 0 && trimmed !== objective;

  useEffect(() => {
    setDraft(objective);
  }, [objective]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    await onSave(trimmed);
  };

  return (
    <Modal
      onClose={onCancel}
      width={520}
      dismissOnBackdrop={!pending}
      dismissOnEscape={!pending}
      labelledBy="goal-edit-title"
    >
      <form onSubmit={submit} className="ace-modal-form">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3.5">
          <GoalIcon className="h-4 w-4 shrink-0 text-fg-mute" />
          <h2 id="goal-edit-title" className="text-[14px] font-semibold text-fg">编辑目标</h2>
        </div>
        <div className="min-h-0 overflow-y-auto ace-scrollbar px-4 py-4">
          <textarea
            rows={7}
            value={draft}
            disabled={pending}
            aria-label="目标"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSave) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-h-[180px] w-full resize-none rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[13px] leading-5 text-fg outline-none transition focus:border-accent disabled:opacity-60"
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-surface-hi disabled:cursor-wait disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            data-ace-dialog-primary="true"
            disabled={!canSave}
            className="flex h-8 min-w-[64px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[12px] text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            {pending && <span className="ace-spinner text-[12px]" aria-hidden="true" />}
            <span>保存</span>
            <span className="ace-action-shortcut-hint">Ctrl + Enter</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GoalStatusBar({ goal, onEdit, onStatusChange, onClear }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingAction, setPendingAction] = useState('');
  const [objectiveTruncated, setObjectiveTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const objectiveRef = useRef(null);
  const state = getGoalTrayState(goal, nowMs);
  const objective = state.goal?.objective || '';
  const goalIdentity = `${state.goal?.threadId || ''}:${state.goal?.goalId || ''}`;

  useEffect(() => {
    if (state.goal?.status !== 'active') return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.goal?.status, state.goal?.updatedAtMs, state.goal?.timeUsedSeconds]);

  useEffect(() => {
    setNowMs(Date.now());
    setPendingAction('');
    setExpanded(false);
    setEditOpen(false);
  }, [goalIdentity]);

  useLayoutEffect(() => {
    const element = objectiveRef.current;
    if (!element) return undefined;
    const measure = () => {
      setObjectiveTruncated(element.scrollWidth > element.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [objective]);

  if (!state.visible) return null;

  const runAction = async (action, callback) => {
    if (pendingAction || !callback) return false;
    setPendingAction(action);
    try {
      await callback();
      return true;
    } catch {
      return false;
    } finally {
      setPendingAction('');
    }
  };

  const saveObjective = async (nextObjective) => {
    const saved = await runAction('edit', () => onEdit?.(nextObjective));
    if (saved) setEditOpen(false);
  };

  const statusActionLabel = state.statusActionLabel;
  const mutationsDisabled = !!pendingAction;

  return (
    <div
      data-goal-status-bar="true"
      data-goal-status={state.goal.status || 'unknown'}
      className="ace-goal-status-bar"
      role="group"
      aria-label={`${state.label}：${objective}`}
    >
      <div className="ace-goal-status-row">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GoalIcon className="h-4 w-4 shrink-0 text-fg-mute" />
          <div className="flex min-w-0 flex-1 items-center text-[13px] leading-5" role="status">
            <span className="shrink-0 font-medium text-fg">{state.label}</span>
            <span
              ref={objectiveRef}
              className={clsx('ml-1 min-w-0 flex-1 truncate text-fg-mute', expanded && 'invisible')}
            >
              {objective}
            </span>
            <span className="ml-1.5 shrink-0 whitespace-nowrap text-[12px] tabular-nums text-fg-mute">
              {!expanded && !objectiveTruncated ? '· ' : ''}{state.progress}
            </span>
          </div>
        </div>

        <div className="ace-goal-status-actions">
          <GoalActionButton
            label="编辑目标"
            pending={pendingAction === 'edit'}
            disabled={mutationsDisabled}
            onClick={() => setEditOpen(true)}
          >
            <VsIcon name="edit" size={13} />
          </GoalActionButton>

          {state.statusAction && (
            <GoalActionButton
              label={statusActionLabel}
              pending={pendingAction === 'status'}
              disabled={mutationsDisabled}
              onClick={() => runAction(
                'status',
                () => onStatusChange?.(state.statusAction),
              )}
            >
              {state.statusAction === 'pause'
                ? <PauseIcon />
                : <VsIcon name="run" size={13} />}
            </GoalActionButton>
          )}

          <GoalActionButton
            label="清除目标"
            pending={pendingAction === 'clear'}
            disabled={mutationsDisabled}
            danger
            onClick={() => runAction('clear', onClear)}
          >
            <VsIcon name="delete" size={13} />
          </GoalActionButton>

          {objectiveTruncated && (
            <GoalActionButton
              label={expanded ? '隐藏完整目标' : '显示完整目标'}
              disabled={mutationsDisabled}
              expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <VsIcon
                name="expandRight"
                size={12}
                className={clsx('transition-transform', expanded && 'rotate-90')}
              />
            </GoalActionButton>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ace-goal-status-objective">{objective}</div>
      )}

      {editOpen && (
        <GoalEditModal
          objective={objective}
          pending={pendingAction === 'edit'}
          onCancel={() => {
            if (!pendingAction) setEditOpen(false);
          }}
          onSave={saveObjective}
        />
      )}
    </div>
  );
}
