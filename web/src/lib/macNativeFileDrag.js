export function fileDropDiagnostic(stage, fields = {}, win = globalThis.window) {
  // Callers supply only booleans, counts, ages, and outcomes. Never include paths,
  // input contents, key names, or exception payloads in diagnostics.
  const message = `[file-drop] ${stage} ${JSON.stringify(fields)}`;
  try {
    Promise.resolve(win?.aceDesktop_logFromWeb?.('info', message)).catch(() => {});
  } catch { /* Diagnostics must never affect input or drop behavior. */ }
}

export function nativeFileDropViewportPoint(location, viewport) {
  const xRatio = Number(location?.xRatio);
  const yRatio = Number(location?.yRatio);
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio) ||
      !Number.isFinite(width) || !Number.isFinite(height) ||
      xRatio < 0 || xRatio >= 1 || yRatio < 0 || yRatio >= 1 ||
      width <= 0 || height <= 0) return null;
  return { x: xRatio * width, y: yRatio * height };
}

export function nativeFileDropTarget(element) {
  if (!element?.closest) return null;
  if (element.closest('[data-ace-native-overlay]')) return null;
  const composer = element.closest('.ace-composer-card');
  if (composer) {
    if (composer.dataset?.nativeFileDropDisabled === 'true') return null;
    return { kind: 'composer' };
  }
  const terminal = element.closest('.ace-console-term');
  const tabId = terminal?.dataset?.tabId;
  if (terminal && tabId && terminal.style?.display !== 'none') {
    return { kind: 'console', tabId };
  }
  return null;
}

export function routeNativeFileDrop(payload, win = globalThis.window, doc = globalThis.document) {
  const paths = Array.isArray(payload?.paths) ? payload.paths : [];
  const point = nativeFileDropViewportPoint(payload?.location, {
    width: win?.innerWidth,
    height: win?.innerHeight,
  });
  if (paths.length === 0 || !point || !doc?.elementFromPoint) {
    fileDropDiagnostic('drop-result', {
      count: paths.length, accepted: false, target: 'none',
      reason: paths.length === 0 ? 'empty' : (!point ? 'invalid-coordinate' : 'hit-test-unavailable'),
    }, win);
    return false;
  }

  const target = nativeFileDropTarget(doc.elementFromPoint(point.x, point.y));
  if (!target) {
    fileDropDiagnostic('drop-result', {
      count: paths.length, accepted: false, target: 'none', reason: 'ineligible-target',
    }, win);
    return false;
  }
  if (target?.kind === 'composer' &&
      typeof win?.__aceComposerAcceptFileDrop === 'function') {
    win.__aceComposerAcceptFileDrop({ paths, nativeLocation: true });
    return true;
  }
  if (target?.kind === 'console' &&
      typeof win?.__aceConsoleAcceptFileDrop === 'function') {
    win.__aceConsoleAcceptFileDrop({ paths, nativeLocation: true, tabId: target.tabId });
    return true;
  }
  fileDropDiagnostic('drop-result', {
    count: paths.length, accepted: false, target: target.kind, reason: 'receiver-missing',
  }, win);
  return false;
}

export function installNativeFileDropRouter(win = globalThis.window, doc = globalThis.document) {
  if (!win) return () => {};
  const handler = (payload) => routeNativeFileDrop(payload, win, doc);
  win.__aceRouteNativeFileDrop = handler;
  return () => {
    if (win.__aceRouteNativeFileDrop !== handler) return;
    try { delete win.__aceRouteNativeFileDrop; }
    catch { win.__aceRouteNativeFileDrop = undefined; }
  };
}
