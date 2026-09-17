import { createPortal } from 'react-dom';
import { VsIcon } from './Icon.jsx';
import { tr } from '../i18n/index.js';

// ChatView owns the session state; only its presentation moves into window chrome.
export function SessionTitleBar({ titleTarget, actionsTarget, title, workspaceLabel, remoteControlBound, children }) {
  const label = (
    <div className="ace-session-title flex items-center gap-2 min-w-0">
      <span className="ace-session-title-text flex min-w-0 items-center gap-1.5">
        {remoteControlBound && (
          <VsIcon name="computer" size={14} className="text-accent"
            alt={tr('remoteControl.connectedSession')} data-remote-control-session-icon="true" />
        )}
        <span className="text-[13px] font-semibold text-fg truncate" title={title}>{title}</span>
      </span>
      <span className="ace-session-workspace shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-medium border bg-surface-hi text-fg-mute border-transparent"
        title={workspaceLabel} data-session-workspace-label="true">
        {workspaceLabel}
      </span>
    </div>
  );
  const actions = <div className="ace-session-title-actions flex items-center gap-1 shrink-0">{children}</div>;
  if (titleTarget && actionsTarget) {
    return <>{createPortal(label, titleTarget)}{createPortal(actions, actionsTarget)}</>;
  }
  return <div className="ace-session-header h-9 px-3 flex items-center justify-between bg-surface shrink-0 gap-2">{label}{actions}</div>;
}
