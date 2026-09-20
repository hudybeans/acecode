// TopBar:compact window chrome, navigation and panel controls.

import { useEffect, useRef } from 'react';
import { clsx } from '../lib/format.js';
import { shouldInsetMacTopBar } from '../lib/desktopShellMode.js';
import { NavigationArrowIcon, PanelToggleIcon, VsIcon } from './Icon.jsx';
import { isTopBarDragBackdrop, isTopBarDragExcludedTarget, topBarWindowControlAt, topBarWindowDragAction } from '../lib/topBarWindowDrag.js';
import {
  WindowControls,
  isInteractiveTarget,
  nativePointerEvent,
  useFramelessWindowState,
} from './WindowControls.jsx';

function QuickBtn({
  title,
  onClick,
  children,
  disabled = false,
  className = '',
  pressed = null,
  panelToggle = false,
  ...buttonProps
}) {
  const isToggle = typeof pressed === 'boolean';

  return (
    <button
      {...buttonProps}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isToggle ? pressed : undefined}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'ace-topbar-action rounded-md bg-surface-hi/0 text-fg-2 flex items-center justify-center text-[14px] transition',
        isToggle && (panelToggle ? 'ace-topbar-panel-toggle' : 'ace-topbar-toggle-btn'),
        disabled ? 'opacity-35 cursor-not-allowed' : 'hover:bg-surface-hi hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TopBar({
  onOpenSearch,
  onToggleConsole,
  consoleAvailable = false,
  consoleOpen = false,
  rightPanelCollapsed = false,
  onToggleRightPanel,
  sidebarCollapsed = false,
  sidebarWidth,
  onToggleSidebar,
  onGoBack,
  onGoForward,
  canGoBack = false,
  canGoForward = false,
  updateStatus = null,
  updateStarting = false,
  updateRunning = false,
  updateReady = false,
  updateProgress = 0,
  onStartUpdate,
  sessionTitleRef,
  sessionActionsRef,
}) {
  const { framelessDesktop, isMaximized, isFullscreen } = useFramelessWindowState();
  const topBarRef = useRef(null);
  const updateAvailable = !!updateStatus?.update_available;
  const boundedUpdateProgress = Number.isFinite(Number(updateProgress))
    ? Math.max(0, Math.min(100, Math.round(Number(updateProgress))))
    : 0;
  const updateLabel = updateReady ? '已更新' : updateRunning ? '更新中' : '更新';
  const updateTitle = updateAvailable
    ? updateReady
      ? '升级已安装，点击查看重启选项'
      : updateRunning
      ? `升级正在进行，${boundedUpdateProgress}%，点击查看进度`
      : `发现新版 v${updateStatus.latest_version || ''}, 点击升级`
    : '';

  useEffect(() => {
    if (!framelessDesktop) return undefined;
    let backdropDragTarget = null;
    let backdropWindowControl = null;
    const onWindowDragMouseDown = (event) => {
      const action = topBarWindowDragAction(
        event,
        topBarRef.current?.getBoundingClientRect(),
        isInteractiveTarget(event.target) || isTopBarDragExcludedTarget(event.target),
      );
      if (!action) return;
      event.preventDefault();
      if (isTopBarDragBackdrop(event.target)) {
        backdropDragTarget = event.target;
        event.stopImmediatePropagation();
      }
      if (action === 'maximize' && typeof window.aceDesktop_toggleMaximizeWindow === 'function') {
        window.aceDesktop_toggleMaximizeWindow();
      } else {
        window.aceDesktop_startWindowDrag(nativePointerEvent(event));
      }
    };
    const onBackdropMouseDown = (event) => {
      // Native dragging can consume mouseup; do not retain its click guard
      // when the next independent press starts.
      backdropDragTarget = null;
      backdropWindowControl = null;
      if (!isTopBarDragBackdrop(event.target) || isInteractiveTarget(event.target)) return;
      const control = topBarWindowControlAt(event, topBarRef.current);
      if (control) {
        backdropDragTarget = event.target;
        backdropWindowControl = control;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      onWindowDragMouseDown(event);
    };
    const onBackdropClick = (event) => {
      const dragTarget = backdropDragTarget;
      const control = backdropWindowControl;
      backdropDragTarget = null;
      backdropWindowControl = null;
      if (dragTarget && event.target === dragTarget) {
        const activateControl = control && topBarWindowControlAt(event, topBarRef.current) === control;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (activateControl) control.click();
      }
    };
    // Modal backdrops may dismiss on mousedown or click. Consume only their
    // title-bar gestures before those handlers, without lifting UI above them.
    document.addEventListener('mousedown', onBackdropMouseDown, true);
    document.addEventListener('click', onBackdropClick, true);
    // Bubble after content handlers, so consumed tab/resize gestures stay local.
    document.addEventListener('mousedown', onWindowDragMouseDown);
    return () => {
      document.removeEventListener('mousedown', onBackdropMouseDown, true);
      document.removeEventListener('click', onBackdropClick, true);
      document.removeEventListener('mousedown', onWindowDragMouseDown);
    };
  }, [framelessDesktop]);

  return (
    <div
      ref={topBarRef}
      className={clsx(
        'ace-topbar px-2 flex items-center gap-1 bg-surface relative z-10 shrink-0',
        framelessDesktop && 'ace-desktop-frameless-topbar',
        shouldInsetMacTopBar(isFullscreen) && 'ace-desktop-macos-topbar',
      )}
      style={{ '--ace-topbar-sidebar-width': sidebarCollapsed ? '0px' : `${sidebarWidth || 0}px` }}
    >
      <div className="ace-topbar-navigation flex items-center gap-1">
        <QuickBtn
          title={sidebarCollapsed ? '展开项目栏' : '收起项目栏'}
          onClick={onToggleSidebar}
          pressed={!sidebarCollapsed}
          panelToggle
          className="ml-[8px]"
        >
          <PanelToggleIcon side="left" size={16} expanded={!sidebarCollapsed} />
        </QuickBtn>
        <QuickBtn title="后退" onClick={onGoBack} disabled={!canGoBack}>
          <NavigationArrowIcon direction="back" size={16} />
        </QuickBtn>
        <QuickBtn title="前进" onClick={onGoForward} disabled={!canGoForward}>
          <NavigationArrowIcon direction="forward" size={16} />
        </QuickBtn>
        <QuickBtn title="搜索任务" onClick={onOpenSearch}>
          <VsIcon name="search" size={16} />
        </QuickBtn>
      </div>
      <div ref={sessionTitleRef} className="ace-topbar-session-title min-w-0 flex-1" />
      {updateAvailable && (
        <button
          type="button"
          title={updateTitle}
          aria-label={updateTitle || '更新'}
          onClick={onStartUpdate}
          disabled={updateStarting}
          className={clsx(
            'ace-topbar-update-button relative min-w-[44px] overflow-hidden px-3 rounded-full text-[12px] font-semibold leading-none shadow-sm transition',
            updateRunning ? 'bg-transparent text-accent' : 'bg-accent text-white',
            'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20',
            updateStarting && 'opacity-60 cursor-not-allowed hover:opacity-60',
          )}
        >
          <span className={updateRunning ? 'invisible' : ''}>{updateLabel}</span>
          {updateRunning && (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-accent"
                style={{ clipPath: `inset(0 ${100 - boundedUpdateProgress}% 0 0)` }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-accent"
              >
                {updateLabel}
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-white"
                style={{ clipPath: `inset(0 ${100 - boundedUpdateProgress}% 0 0)` }}
              >
                {updateLabel}
              </span>
            </>
          )}
        </button>
      )}
      <div className="ace-topbar-controls ml-auto flex items-center shrink-0">
        <div className="ace-topbar-functions flex items-center gap-1">
          <div ref={sessionActionsRef} className="ace-topbar-session-actions flex items-center empty:hidden" />
          {consoleAvailable && (
            <QuickBtn
              title={consoleOpen ? '关闭控制台 (Ctrl+`)' : '打开控制台 (Ctrl+`)'}
              onClick={onToggleConsole}
              pressed={consoleOpen}
              panelToggle
              className="ace-topbar-console-toggle"
            >
              <PanelToggleIcon side="bottom" size={16} expanded={consoleOpen} />
            </QuickBtn>
          )}
          <QuickBtn
            title={rightPanelCollapsed ? '展开整个右侧面板' : '收起整个右侧面板'}
            onClick={onToggleRightPanel}
            pressed={!rightPanelCollapsed}
            panelToggle
            aria-expanded={!rightPanelCollapsed}
          >
            <PanelToggleIcon side="right" size={16} expanded={!rightPanelCollapsed} />
          </QuickBtn>
        </div>
        {framelessDesktop && <WindowControls isMaximized={isMaximized} />}
      </div>
    </div>
  );
}
