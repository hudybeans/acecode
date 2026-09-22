import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api.js';
import { clsx } from '../lib/format.js';
import {
  DEFAULT_TOOL_PREAMBLE_STATE,
  TOOL_PREAMBLE_MODES,
  TOOL_PREAMBLE_MODE_SIDECAR,
  TOOL_PREAMBLE_SIDECAR_WAIT_MAX_MS,
  TOOL_PREAMBLE_SIDECAR_WAIT_MIN_MS,
  buildToolPreambleUpdate,
  normalizeToolPreambleState,
  toolPreambleStatusText,
} from '../lib/toolPreamble.js';
import { VsIcon } from './Icon.jsx';
import { Modal, Toggle } from './Modal.jsx';

// 圈圈问号:hover / 聚焦时浮出说明,点击可钉住;Esc 或失焦收起。
// 放在单选卡片右侧,点击时不冒泡到卡片(否则会顺手切换选项)。
function HelpTip({ label, text }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tipId = useId();
  const visible = hovered || pinned;
  return (
    <span
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`${label}：查看说明`}
        aria-expanded={visible}
        aria-describedby={visible ? tipId : undefined}
        data-tool-preamble-help={label}
        className="flex h-5 w-5 items-center justify-center rounded-full text-fg-mute outline-none transition hover:text-fg focus-visible:ring-1 focus-visible:ring-accent/60"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            setPinned((value) => !value);
          } else if (event.key === 'Escape' && visible) {
            event.stopPropagation();
            setPinned(false);
            setHovered(false);
          }
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
      >
        <VsIcon name="help" size={14} className="block" />
      </button>
      {visible && (
        <div
          id={tipId}
          role="tooltip"
          data-tool-preamble-help-text="true"
          className="ace-shadow-lg absolute right-0 top-6 z-20 w-72 rounded-md border border-border bg-surface px-3 py-2 text-left text-[12px] leading-relaxed text-fg"
          onClick={(event) => event.stopPropagation()}
        >
          {text}
        </div>
      )}
    </span>
  );
}

function ToolPreambleConfigModal({ state, busy, onClose, onSave }) {
  const [mode, setMode] = useState(state.mode);
  const [sidecarModel, setSidecarModel] = useState(state.sidecarModel);
  const [sidecarWaitMs, setSidecarWaitMs] = useState(String(state.sidecarWaitMs));
  const titleId = useId();

  const submit = () => {
    if (busy) return;
    onSave({ mode, sidecarModel, sidecarWaitMs });
  };
  const select = (nextMode) => setMode(nextMode);

  return (
    <Modal onClose={onClose} width={520} labelledBy={titleId}>
      <div className="px-5 pb-3 pt-4">
        <h3 id={titleId} className="text-[15px] font-semibold text-fg">工具前言</h3>
        <p className="mt-1 text-[12px] text-fg-mute">选择标题的来源。三种方式只能启用一种，保存后对新的工具调用立即生效。</p>
      </div>
      <div className="px-5 pb-2" role="radiogroup" aria-label="工具前言来源">
        {TOOL_PREAMBLE_MODES.map((entry) => {
          const selected = mode === entry.id;
          return (
            <div
              key={entry.id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              data-tool-preamble-mode={entry.id}
              onClick={() => select(entry.id)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  select(entry.id);
                }
              }}
              className={clsx(
                'mb-2 flex cursor-pointer items-start justify-between gap-3 rounded-md border px-3.5 py-2.5 outline-none transition focus-visible:ring-1 focus-visible:ring-accent/60',
                selected ? 'border-accent bg-accent-bg' : 'border-border bg-surface hover:bg-surface-hi',
              )}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={clsx(
                    'mt-1 h-3.5 w-3.5 shrink-0 rounded-full border',
                    selected ? 'border-accent bg-accent' : 'border-border bg-surface-alt',
                  )}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-fg">{entry.label}</div>
                  <div className="mt-0.5 text-[11px] text-fg-mute">{entry.summary}</div>
                  {selected && entry.id === TOOL_PREAMBLE_MODE_SIDECAR && (
                    <div
                      className="mt-2 flex flex-col gap-2"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <label className="flex items-center gap-2 text-[12px]">
                        <span className="w-16 text-right text-fg-mute">旁路模型</span>
                        <select
                          value={sidecarModel}
                          onChange={(event) => setSidecarModel(event.target.value)}
                          className="h-7 rounded-md border border-border bg-surface-alt px-2 text-[12px] text-fg outline-none transition focus:border-accent"
                        >
                          <option value="">沿用会话模型</option>
                          {state.savedModels.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-[12px]">
                        <span className="w-16 text-right text-fg-mute">最长等待</span>
                        <input
                          type="number"
                          min={TOOL_PREAMBLE_SIDECAR_WAIT_MIN_MS}
                          max={TOOL_PREAMBLE_SIDECAR_WAIT_MAX_MS}
                          step={100}
                          value={sidecarWaitMs}
                          onChange={(event) => setSidecarWaitMs(event.target.value)}
                          className="h-7 w-20 rounded-md border border-border bg-surface-alt px-2 text-center text-[12px] text-fg outline-none transition focus:border-accent"
                        />
                        <span className="text-fg-mute">毫秒，超时的标题只在当前页面显示</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
              <HelpTip label={entry.label} text={entry.help} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 px-5 pb-4 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-3 py-1 text-[12px] hover:bg-surface-hi"
        >
          取消
        </button>
        <button
          type="button"
          data-ace-dialog-primary="true"
          disabled={busy}
          onClick={submit}
          className="rounded bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-60"
        >
          保存
        </button>
      </div>
    </Modal>
  );
}

export function ToolPreambleSettings() {
  const [state, setState] = useState(DEFAULT_TOOL_PREAMBLE_STATE);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    api.getToolPreamble()
      .then((payload) => {
        if (cancelled) return;
        setState(normalizeToolPreambleState(payload));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError('加载工具前言配置失败');
      });
    return () => { cancelled = true; };
  }, [reload]);

  const save = async (patch) => {
    if (!loaded || busy) return false;
    setBusy(true);
    setError('');
    try {
      const payload = await api.setToolPreamble(buildToolPreambleUpdate(patch));
      setState(normalizeToolPreambleState(payload));
      return true;
    } catch {
      setError('保存工具前言配置失败，请重试');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-tool-preamble-settings="true">
      <div className="text-[14px] font-semibold mb-1">工具前言</div>
      <p className="text-[12px] text-fg-mute mb-3">在每批工具调用上方显示一句「正在做什么」的标题，代替笼统的「正在处理」。默认关闭。</p>
      <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 rounded-md bg-surface border border-border mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-normal text-fg">启用工具前言</div>
          <div className="text-[11px] text-fg-mute mt-0.5">当前：{toolPreambleStatusText(state)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            disabled={!loaded || busy}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-surface-hi disabled:opacity-50"
          >
            配置
          </button>
          <Toggle
            on={state.enabled}
            onChange={(next) => save({ enabled: next })}
            disabled={!loaded || busy}
            ariaLabel="启用工具前言"
          />
        </div>
      </div>
      {error && (
        <div role="alert" className="text-[12px] text-danger mt-2">
          {error}
          <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}
            className="ml-2 underline disabled:opacity-50">重试</button>
        </div>
      )}
      {configOpen && (
        <ToolPreambleConfigModal
          state={state}
          busy={busy}
          onClose={() => setConfigOpen(false)}
          onSave={async (draft) => {
            const ok = await save(draft);
            if (ok) setConfigOpen(false);
          }}
        />
      )}
    </div>
  );
}
