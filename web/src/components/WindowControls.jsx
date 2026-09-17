// WindowControls:frameless desktop 模式下的标题栏窗口控制三连
// (minimize / maximize ↔ restore / close)。从 TopBar 抽出,SettingsPage 等
// 全屏覆盖 TopBar 的页面也复用,避免每处重写。
//
// 用法:
//   const { isMaximized, framelessDesktop } = useFramelessWindowState();
//   {framelessDesktop && (
//     <WindowControls isMaximized={isMaximized} />
//   )}

import { VsIcon } from './Icon.jsx';
import { useEffect, useState } from 'react';
import { clsx } from '../lib/format.js';
import { isMacDesktopShell } from '../lib/desktopShellMode.js';

export function isFramelessDesktop() {
  return typeof window !== 'undefined'
    && window.__ACECODE_FRAMELESS_WINDOW__ === true
    && typeof window.aceDesktop_startWindowDrag === 'function';
}

export function isInteractiveTarget(target) {
  return !!target?.closest?.('button,a,input,textarea,select,[contenteditable="true"],[role="button"],[data-ace-no-window-drag="true"]');
}

export function nativePointerEvent(event) {
  return {
    button: (event?.button ?? 0) + 1,
    screenX: event?.screenX ?? 0,
    screenY: event?.screenY ?? 0,
    time: Math.max(0, Math.floor(event?.timeStamp ?? 0)),
  };
}

// 监听 native 推送的 maximize 状态。多个组件可同时挂(WndProc 每次都遍历 webview
// 找全局回调,这里覆盖式注册 — 期望同一时刻只有一个 SettingsPage 或 TopBar 在
// 监听;切走时 cleanup 还原 null)。
export function useFramelessWindowState() {
  const framelessDesktop = isFramelessDesktop();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!framelessDesktop) return undefined;
    let cancelled = false;
    const fetchInitial = async () => {
      if (typeof window.aceDesktop_isWindowMaximized !== 'function') return;
      try {
        const raw = await window.aceDesktop_isWindowMaximized();
        const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!cancelled) {
          setIsMaximized(!!(r && r.maximized));
          setIsFullscreen(!!(r && r.fullscreen));
        }
      } catch {
        // bind 偶发抛错 → 保留默认 false
      }
    };
    fetchInitial();

    const prev = window.aceDesktop_onMaximizeStateChanged;
    const prevFullscreen = window.aceDesktop_onFullscreenStateChanged;
    window.aceDesktop_onMaximizeStateChanged = (m) => {
      setIsMaximized(!!m);
      // 也通知前一个监听者(链式),避免 TopBar 与 SettingsPage 共存时丢事件
      if (typeof prev === 'function') prev(m);
    };
    window.aceDesktop_onFullscreenStateChanged = (fullscreen) => {
      setIsFullscreen(!!fullscreen);
      if (typeof prevFullscreen === 'function') prevFullscreen(fullscreen);
    };

    return () => {
      cancelled = true;
      // 还原前一个回调,而不是 delete — 防止 SettingsPage 关闭后 TopBar 失联
      window.aceDesktop_onMaximizeStateChanged = prev || undefined;
      window.aceDesktop_onFullscreenStateChanged = prevFullscreen || undefined;
    };
  }, [framelessDesktop]);

  return { framelessDesktop, isMaximized, isFullscreen };
}

const WINDOW_GLYPHS = Object.freeze({
  minimize: 'Minimize',
  maximize: 'Maximize',
  restore: 'Restore',
  close: 'close',
});

function WindowGlyph({ type }) {
  return <VsIcon name={WINDOW_GLYPHS[type] || 'close'} size={14} />;
}

export function WindowControl({ type, title, onClick }) {
  return (
    <button
      type="button"
      data-ace-no-window-drag="true"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={clsx('ace-window-control', type === 'close' && 'ace-window-control-close')}
    >
      <WindowGlyph type={type} />
    </button>
  );
}

// 三连组合 — 用得多就直接用这个,不用三连各自写一遍。
export function WindowControls({ isMaximized }) {
  // macOS keeps AppKit's native traffic lights in the transparent title bar.
  if (isMacDesktopShell()) return null;

  return (
    <div className="ace-window-controls" data-ace-no-window-drag="true">
      <WindowControl type="minimize" title="最小化" onClick={() => window.aceDesktop_minimizeWindow?.()} />
      <WindowControl
        type={isMaximized ? 'restore' : 'maximize'}
        title={isMaximized ? '还原' : '最大化'}
        onClick={() => window.aceDesktop_toggleMaximizeWindow?.()}
      />
      <WindowControl type="close" title="关闭" onClick={() => window.aceDesktop_closeWindow?.()} />
    </div>
  );
}
