let instanceSequence = 0;
let eventSequence = 0;
const run = Date.now().toString(36);

// Deliberately accept only numeric/boolean metadata, never draft text or IDs.
export function createComposerDiagnostic(component, win = globalThis.window, now = Date.now) {
  const instance = ++instanceSequence;
  let windowStart = now();
  let count = 0;
  let suppressed = 0;
  return (event, fields = {}) => {
    try {
      if (typeof win?.aceDesktop_logFromWeb !== 'function') return;
      const time = now();
      if (time - windowStart >= 60000) { windowStart = time; count = 0; }
      if (count >= 120) { suppressed += 1; return; }
      count += 1;
      const safe = Object.fromEntries(Object.entries(fields).filter(([, value]) => (
        typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
      )));
      const record = { run, instance, seq: ++eventSequence, time, component, event, suppressed, ...safe };
      suppressed = 0;
      Promise.resolve(win.aceDesktop_logFromWeb('info', `[composer-diagnostic] ${JSON.stringify(record)}`)).catch(() => {});
    } catch { /* Diagnostics must not affect editing or sending. */ }
  };
}
