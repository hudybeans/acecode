// Retain the legacy minimum while allowing the full visible title bar to drag.
export const TOPBAR_WINDOW_DRAG_HEIGHT = 44;

export function topBarWindowDragAction(event, bounds, excluded = false) {
  if (!bounds || bounds.width <= 0 || !Number.isFinite(bounds.height) || bounds.height <= 0 || excluded
    || event.defaultPrevented || event.button !== 0) return null;
  const { clientX: x, clientY: y } = event;
  const dragHeight = Math.max(TOPBAR_WINDOW_DRAG_HEIGHT, bounds.height);
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x < bounds.left || x >= bounds.right
    || y < bounds.top || y >= bounds.top + dragHeight) return null;
  return event.detail >= 2 ? 'maximize' : 'drag';
}

// The extra strip belongs to content: never cover it with an input-catching layer.
export function isTopBarDragBackdrop(target) {
  return !!target?.matches?.('[data-ace-native-overlay="blocking"]');
}

export function isTopBarDragExcludedTarget(target) {
  if (!isTopBarDragBackdrop(target)
    && target?.closest?.('[data-ace-native-overlay],[role="dialog"]')) return true;
  return !!target?.closest?.(
    '[role="tab"],[role="separator"],'
    + '[draggable="true"],[tabindex],summary,.ace-resize-handle,.ace-console-resize-handle',
  );
}

export function topBarWindowControlAt(event, topBar) {
  if (!topBarWindowDragAction(event, topBar?.getBoundingClientRect(),
    isTopBarDragExcludedTarget(event.target))) return null;
  for (const control of topBar.querySelectorAll('.ace-window-control')) {
    const bounds = control.getBoundingClientRect();
    if (event.clientX >= bounds.left && event.clientX < bounds.right
      && event.clientY >= bounds.top && event.clientY < bounds.bottom) return control;
  }
  return null;
}
