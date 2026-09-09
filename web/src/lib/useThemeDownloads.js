import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { createThemeDownloadController } from './themePackages.js';

export function useThemeDownloads({ enabled, prepare, apply }) {
  const callbacks = useRef({ prepare, apply });
  callbacks.current = { prepare, apply };
  const [state, setState] = useState({ entry: null, loading: false, error: '', job: { state: 'idle' } });
  const controller = useMemo(() => createThemeDownloadController({
    api,
    prepare: (id, options) => callbacks.current.prepare(id, options),
    apply: (id) => callbacks.current.apply(id),
    onChange: setState,
  }), []);
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => { if (enabled) void controller.refresh(); }, [controller, enabled]);
  return { ...state, controller };
}
