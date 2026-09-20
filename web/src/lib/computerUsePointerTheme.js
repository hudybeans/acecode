import { normalizeThemeBackgroundColor } from './desktopWindowBackground.js';

// Read the same resolved token used by the preview, including installed themes.
// Theme packages already restrict colors to hex; never maintain a second palette.
export function computerUsePointerColor(win = globalThis.window, doc = globalThis.document) {
  if (!win || !doc?.documentElement) return null;
  try {
    return normalizeThemeBackgroundColor(win.getComputedStyle(doc.documentElement).getPropertyValue('--ace-accent'));
  } catch { return null; }
}

// Installed once in the authenticated app, not only while Settings is open.
// The store serializes these color patches with user style/enable changes.
export function observeComputerUsePointerTheme(store, win = globalThis.window, doc = globalThis.document) {
  if (!win || !doc?.documentElement) return () => {};
  let active = true;
  let frame = null;
  let refreshPending = false;
  const synchronize = async (refresh) => {
    try {
      if (!active || !computerUsePointerColor(win, doc)) return;
      if ((refresh || !store.getSnapshot().snapshot) && !await store.load()) {
        if (active) await store.syncPointerColor(computerUsePointerColor(win, doc), { defer: true });
        return;
      }
      if (!active) return;
      // Loading settings may outlast several theme changes. Only send the latest.
      const color = computerUsePointerColor(win, doc);
      if (color) await store.syncPointerColor(color);
    } catch { /* The shared settings store owns actionable save errors/retry. */ }
  };
  const schedule = (refresh = false) => {
    refreshPending ||= refresh;
    if (!active || frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      const refresh = refreshPending;
      refreshPending = false;
      void synchronize(refresh);
    });
  };
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => schedule()) : null;
  observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-theme', 'style'] });
  const focused = () => schedule(true);
  win.addEventListener('focus', focused);
  schedule(true);
  return () => {
    active = false;
    observer?.disconnect();
    win.removeEventListener('focus', focused);
    if (frame !== null) win.cancelAnimationFrame(frame);
  };
}
