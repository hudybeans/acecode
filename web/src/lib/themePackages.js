export const EVA_THEME_ID = 'eva-01';
export const THEME_COLOR_KEYS = Object.freeze([
  'bg', 'surface', 'surface-alt', 'surface-hi', 'shell-hi', 'shell-bg', 'border',
  'border-soft', 'fg', 'fg-2', 'fg-mute', 'accent', 'accent-bg', 'accent-soft',
  'ok', 'ok-bg', 'ok-border', 'warn', 'warn-bg', 'danger', 'danger-bg',
  'code-bg', 'code-fg', 'code-line', 'selection', 'on-selection', 'send-bg', 'send-fg',
]);

export function validThemeDefinition(value) {
  return value?.schema_version === 1 && value.id === EVA_THEME_ID && value.mode === 'light'
    && typeof value.version === 'string' && value.colors && typeof value.colors === 'object'
    && Object.keys(value.colors).length === THEME_COLOR_KEYS.length
    && THEME_COLOR_KEYS.every((key) => /^#[0-9a-f]{6}$/i.test(value.colors[key]));
}

export function themeCssProperties(definition, backgroundUrl) {
  if (!validThemeDefinition(definition)) throw new Error('主题配色数据无效');
  const result = {};
  for (const key of THEME_COLOR_KEYS) {
    const hex = definition.colors[key];
    result[`--ace-${key}`] = hex;
    result[`--ace-${key}-rgb`] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ');
  }
  // Only application-created blob URLs may become CSS image values.
  if (typeof backgroundUrl === 'string' && backgroundUrl.startsWith('blob:') && !/["()\s]/.test(backgroundUrl)) {
    result['--ace-home-background-image'] = `url("${backgroundUrl}")`;
  }
  return result;
}

export function themeDownloadConsent(entry) {
  if (entry?.id !== EVA_THEME_ID || !Number.isSafeInteger(entry?.package?.bytes)
      || entry.package.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(entry.package.sha256)
      || typeof entry.version !== 'string') throw new Error('暂时无法获取主题下载大小，请重试');
  return { confirm_download: true, version: entry.version, bytes: entry.package.bytes, sha256: entry.package.sha256 };
}

export function themeDownloadPercent(job) {
  if (!(job?.bytes_total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((job.bytes_downloaded || 0) / job.bytes_total * 100)));
}

export function themePackageSize(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / 1000000).toFixed(2)} MB`;
}

export function themeJobActive(job) { return ['downloading', 'installing'].includes(job?.state); }

export function themeErrorText(error) {
  const code = typeof error === 'string' ? error : error?.code;
  if (code === 'THEME_CONFIRMATION_REQUIRED') return '主题包已更新，请重新确认下载大小';
  if (code === 'THEME_INVALID_PACKAGE') return '主题包校验失败，请重新下载';
  if (code === 'THEME_NOT_INSTALLED') return '主题资源尚未下载或已损坏，请重新下载';
  if (code === 'THEME_CATALOG_UNAVAILABLE') return '暂时无法获取主题信息，请检查网络后重试';
  if (code === 'THEME_DOWNLOAD_BUSY') return '主题正在下载，请稍候';
  if (code === 'THEME_SAVE_FAILED') return '无法保存主题资源，请检查文件写入权限';
  return '主题下载或应用失败，请重试';
}

export function themeFailure(error, fallbackPath = '') {
  const path = error?.body?.error_path || error?.error_path || fallbackPath;
  return { message: themeErrorText(error?.error || error), path: typeof path === 'string' ? path : '' };
}

// The controller outlives Settings. A later selection revokes an older
// download's automatic application, while the useful local install can finish.
export function createThemeDownloadController({ api, prepare, apply, onChange, wait = () => new Promise((resolve) => setTimeout(resolve, 400)) }) {
  let active = true, revision = 0, polling = null, intent = null;
  let state = { entry: null, loading: false, error: '', failure: null, job: { state: 'idle' } };
  const patch = (value) => { state = { ...state, ...value }; if (active) onChange?.(state); };
  const report = (error, notify = false, path = state.entry?.package?.url || state.entry?.package?.path || '') => {
    const failure = themeFailure(error, path);
    patch({ error: failure.message, ...(notify ? { failure } : {}) });
  };
  const consumeJob = async (job, notify = false) => {
    patch({ job });
    if (job.state === 'completed') {
      // A passive refresh can replay completion of an older version. It must
      // not clear an update offered by a newer catalogue.
      patch({ entry: state.entry ? {
        ...state.entry,
        installed: true,
        installed_version: job.version || state.entry.installed_version,
        update_available: job.version === state.entry.version ? false : state.entry.update_available,
      } : null, error: '' });
      const pending = intent;
      if (pending && pending.revision === revision && pending.id === job.id && pending.version === job.version) {
        intent = null;
        await prepare(job.id, { refresh: true });
        if (active && pending.revision === revision) await apply(job.id);
      }
    } else if (job.state === 'failed') { intent = null; report(job, notify); }
    else if (job.state === 'cancelled') intent = null;
  };
  const poll = () => {
    if (polling) return polling;
    polling = (async () => {
      while (active && themeJobActive(state.job)) {
        await wait();
        if (!active) return;
        await consumeJob(await api.getThemeJob(), true);
      }
    })().catch((error) => { if (active) report(error, true); })
      .finally(() => { polling = null; });
    return polling;
  };
  return {
    state: () => state,
    dismissFailure() { patch({ failure: null }); },
    activate() { active = true; },
    dispose() { active = false; revision += 1; intent = null; },
    async refresh({ notify = false } = {}) {
      const notifyFailure = notify || themeJobActive(state.job);
      patch({ loading: true });
      try {
        const catalog = await api.getThemes(true);
        const entry = catalog?.themes?.find((item) => item.id === EVA_THEME_ID) || null;
        themeDownloadConsent(entry);
        patch({ entry, loading: false, error: '' });
        await consumeJob(catalog.job || { state: 'idle' }, themeJobActive(state.job));
        if (themeJobActive(state.job)) void poll();
        return entry;
      } catch (error) { patch({ loading: false }); report(error, notifyFailure); return null; }
    },
    async select(id) {
      const selected = ++revision;
      intent = null;
      try {
        if (id === EVA_THEME_ID) await prepare(id);
        if (active && selected === revision) await apply(id);
      } catch (error) { report(error, true); }
    },
    async install(entry) {
      const selected = ++revision;
      intent = { id: entry.id, version: entry.version, revision: selected };
      try {
        patch({ error: '', failure: null, job: { id: entry.id, state: 'downloading', bytes_downloaded: 0, bytes_total: entry.package.bytes } });
        const job = await api.installTheme(entry.id, themeDownloadConsent(entry));
        // Even a very fast install is observed by polling once so the same
        // completion path applies the theme and respects the selection revision.
        patch({ job: { ...job, state: themeJobActive(job) ? job.state : 'installing' } });
        void poll();
      } catch (error) {
        intent = null;
        patch({ job: { state: 'failed' } });
        report(error, true, entry.package?.url || entry.package?.path);
      }
    },
    async cancel() {
      revision += 1; intent = null;
      try { await api.cancelThemeInstall(); if (themeJobActive(state.job)) void poll(); }
      catch (error) { report(error, true); }
    },
  };
}
