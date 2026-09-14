import { isAiColorTheme, isDownloadableColorTheme, isInstalledColorTheme, NATIONAL_DAY_THEME_ID } from './colorTheme.js';

export { NATIONAL_DAY_THEME_ID };
export const EVA_THEME_ID = 'eva-01';
export const BUILTIN_THEME_CARDS = Object.freeze([
  { id: NATIONAL_DAY_THEME_ID, name: '国庆节', thumbnail: '/themes/national-day-2026-thumbnail.png', swatches: ['#FFF8F2', '#FFFFFF', '#D9272E'] },
  { id: EVA_THEME_ID, name: 'EVA 初号机', thumbnail: '/themes/eva-01-thumbnail.png', swatches: ['#E9DEFA', '#F9F5FE', '#B7EF65'] },
]);
export const THEME_COLOR_KEYS = Object.freeze([
  'bg', 'surface', 'surface-alt', 'surface-hi', 'shell-hi', 'shell-bg', 'border',
  'border-soft', 'fg', 'fg-2', 'fg-mute', 'accent', 'accent-bg', 'accent-soft',
  'ok', 'ok-bg', 'ok-border', 'warn', 'warn-bg', 'danger', 'danger-bg',
  'code-bg', 'code-fg', 'code-line', 'selection', 'on-selection', 'send-bg', 'send-fg',
]);

export function validThemeHexColor(value) {
  return typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

export function validThemeAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => {
    if (key === 'logo_color' || key === 'home_title_color') return validThemeHexColor(entry);
    return key === 'extend_to_titlebar' && typeof entry === 'boolean';
  });
}

export function validThemeDefinition(value) {
  const identity = value?.id === EVA_THEME_ID ? value.mode === 'light'
    : (value?.id === NATIONAL_DAY_THEME_ID || isAiColorTheme(value?.id)) && typeof value.name === 'string' && !!value.name.trim()
      && ['light', 'dark'].includes(value.mode);
  return value?.schema_version === 1 && identity
    && typeof value.version === 'string' && !!value.version && value.colors && typeof value.colors === 'object'
    && Object.keys(value.colors).length === THEME_COLOR_KEYS.length
    && THEME_COLOR_KEYS.every((key) => validThemeHexColor(value.colors[key]))
    && (!Object.hasOwn(value, 'appearance') || validThemeAppearance(value.appearance));
}

export function resolveThemeAppearance(definition) {
  if (!validThemeDefinition(definition)) throw new Error('主题配色数据无效');
  const appearance = definition.appearance || {};
  const legacyEvaTitlebar = definition.id === EVA_THEME_ID && !Object.hasOwn(appearance, 'extend_to_titlebar');
  const extendToTitlebar = appearance.extend_to_titlebar ?? definition.id === EVA_THEME_ID;
  return {
    logoColor: appearance.logo_color ?? null,
    homeTitleColor: appearance.home_title_color ?? definition.colors.fg,
    extendToTitlebar,
    whiteTitlebarControls: extendToTitlebar && (definition.mode === 'dark' || legacyEvaTitlebar),
  };
}

export function themeCssProperties(definition, backgroundUrl) {
  if (!validThemeDefinition(definition)) throw new Error('主题配色数据无效');
  const result = {};
  for (const key of THEME_COLOR_KEYS) {
    const hex = definition.colors[key];
    result[`--ace-${key}`] = hex;
    result[`--ace-${key}-rgb`] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ');
  }
  const appearance = resolveThemeAppearance(definition);
  result['--ace-home-title-color'] = appearance.homeTitleColor;
  if (appearance.logoColor) {
    result['--ace-logo-color'] = appearance.logoColor;
    result['--ace-logo-color-rgb'] = [1, 3, 5].map((start) => parseInt(appearance.logoColor.slice(start, start + 2), 16)).join(', ');
  }
  // Only application-created blob URLs may become CSS image values.
  if (typeof backgroundUrl === 'string' && backgroundUrl.startsWith('blob:') && !/["()\s]/.test(backgroundUrl)) {
    result['--ace-home-background-image'] = `url("${backgroundUrl}")`;
  }
  return result;
}

export function applyInstalledTheme(root, definition, backgroundUrl) {
  const properties = definition ? themeCssProperties(definition, backgroundUrl) : {};
  const appearance = definition ? resolveThemeAppearance(definition) : null;
  const hasBackground = !!properties['--ace-home-background-image'];
  const attributes = {
    'data-installed-theme': definition?.id,
    'data-theme-wallpaper': hasBackground ? 'true' : null,
    'data-theme-extend-to-titlebar': hasBackground ? String(appearance.extendToTitlebar) : null,
    'data-theme-titlebar-controls': hasBackground && appearance.whiteTitlebarControls ? 'white' : null,
    'data-theme-logo-color': appearance?.logoColor ? 'custom' : null,
  };
  for (const [key, value] of Object.entries(properties)) root.style.setProperty(key, value);
  for (const [key, value] of Object.entries(attributes)) {
    if (value) root.setAttribute(key, value);
    else root.removeAttribute(key);
  }
  return () => {
    for (const key of Object.keys(properties)) root.style.removeProperty(key);
    for (const key of Object.keys(attributes)) root.removeAttribute(key);
  };
}

export function themeDownloadConsent(entry) {
  if (!isDownloadableColorTheme(entry?.id) || !Number.isSafeInteger(entry?.package?.bytes)
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
  const detail = error?.body?.message || (!error?.code ? error?.message : '');
  const message = typeof detail === 'string' && detail ? detail : themeErrorText(error?.error || error);
  return { message, path: typeof path === 'string' ? path : '' };
}

export function localThemeEntries(catalog) {
  const seen = new Set();
  return (Array.isArray(catalog?.themes) ? catalog.themes : []).filter((entry) => {
    if (!isAiColorTheme(entry?.id) || entry.source !== 'local' || entry.installed !== true
        || typeof entry.name !== 'string' || !entry.name.trim() || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function releaseThemeResource(cache, id, revoke = (url) => URL.revokeObjectURL(url)) {
  const pending = cache.get(id);
  cache.delete(id);
  if (pending) Promise.resolve(pending).then((item) => revoke(item.backgroundUrl)).catch(() => {});
}

// The controller outlives Settings. A later selection revokes an older
// download's automatic application, while the useful local install can finish.
export function createThemeDownloadController({ api, prepare, apply, remove = (id) => api.deleteTheme(id), forget, onChange, wait = () => new Promise((resolve) => setTimeout(resolve, 400)) }) {
  let active = true, revision = 0, polling = null, intent = null;
  let startup = null, userIntent = false;
  const removedIds = new Set();
  let state = { entry: null, entries: [], localEntries: [], deletingId: '', loading: false, error: '', failure: null, job: { state: 'idle' } };
  const patch = (value) => { state = { ...state, ...value }; if (active) onChange?.(state); };
  const report = (error, notify = false, path = state.entry?.package?.url || state.entry?.package?.path || '', silent = false) => {
    if (silent) return;
    const failure = themeFailure(error, path);
    patch({ error: failure.message, ...(notify ? { failure } : {}) });
  };
  const consumeJob = async (job, notify = false) => {
    job = { automatic: state.job.automatic === true && state.job.id === job.id, ...job };
    patch({ job });
    if (job.state === 'completed') {
      // A passive refresh can replay completion of an older version. It must
      // not clear an update offered by a newer catalogue.
      const updated = (entry) => entry?.id === job.id ? {
        ...entry,
        installed: true,
        installed_version: job.version || entry.installed_version,
        update_available: job.version === entry.version ? false : entry.update_available,
      } : entry;
      patch({ entry: updated(state.entry), entries: state.entries.map(updated), error: '' });
      const pending = intent;
      if (pending && pending.revision === revision && pending.id === job.id && pending.version === job.version) {
        intent = null;
        await prepare(job.id, { refresh: true });
        if (active && pending.revision === revision) await apply(job.id, {
          silent: pending.automatic === true, expectedAppearance: pending.expectedAppearance,
        });
      }
    } else if (job.state === 'failed') { intent = null; report(job, notify, undefined, job.automatic); }
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
    })().catch((error) => {
      if (!active) return;
      intent = null;
      if (state.job.automatic) patch({ job: { ...state.job, state: 'failed' } });
      report(error, true, undefined, state.job.automatic);
    })
      .finally(() => { polling = null; });
    return polling;
  };
  return {
    state: () => state,
    dismissFailure() { patch({ failure: null }); },
    activate() { active = true; },
    dispose() { active = false; revision += 1; intent = null; },
    async refresh({ notify = false, id = EVA_THEME_ID, silent = false } = {}) {
      const notifyFailure = notify || themeJobActive(state.job);
      patch({ loading: true });
      try {
        const catalog = await api.getThemes(true);
        const entries = (catalog?.themes || []).filter((item) => isDownloadableColorTheme(item.id));
        const entry = entries.find((item) => item.id === EVA_THEME_ID) || null;
        // Local themes remain available when the remote catalogue is offline.
        // An installed EVA descriptor can also lack download metadata offline.
        for (const item of entries) if (!item.installed && item.available !== false) themeDownloadConsent(item);
        patch({ entry, entries, localEntries: localThemeEntries(catalog).filter((item) => !removedIds.has(item.id)), loading: false,
          error: catalog.catalog_error && !silent && (notify || !state.job.automatic) ? themeErrorText(catalog.catalog_error.error) : '' });
        await consumeJob(catalog.job || { state: 'idle' }, themeJobActive(state.job));
        if (themeJobActive(state.job)) void poll();
        return entries.find((item) => item.id === id) || null;
      } catch (error) { patch({ loading: false }); report(error, notifyFailure, undefined, silent || (!notify && state.job.automatic)); return null; }
    },
    applyStartupTheme(expectedAppearance) {
      if (startup) return startup;
      const selected = revision;
      const eligible = () => active && !userIntent && selected === revision && !themeJobActive(state.job);
      startup = (async () => {
        const claim = await api.claimStartupTheme();
        if (claim?.claimed !== true || claim.id !== NATIONAL_DAY_THEME_ID || !eligible()) return;
        const entry = await this.refresh({ id: NATIONAL_DAY_THEME_ID, silent: true });
        if (!entry || !eligible()) return;
        if (entry.installed) {
          await prepare(entry.id);
          if (eligible()) await apply(entry.id, { silent: true, expectedAppearance });
        } else if (entry.available !== false) {
          await this.install(entry, { automatic: true, expectedAppearance });
        }
      })().catch(() => {});
      return startup;
    },
    async select(id) {
      userIntent = true;
      if (state.deletingId === id || removedIds.has(id)) return;
      const selected = ++revision;
      intent = null;
      try {
        if (isInstalledColorTheme(id)) await prepare(id);
        if (active && selected === revision && state.deletingId !== id && !removedIds.has(id)) await apply(id);
      } catch (error) { report(error, true); }
    },
    beginCreation() {
      userIntent = true;
      intent = null;
      return ++revision;
    },
    async importLocal(file, digest, applyAfter = true) {
      userIntent = true;
      if (state.deletingId) throw new Error('主题正在处理中，请稍后重试');
      const selected = ++revision;
      intent = null;
      const result = await api.importTheme(file, digest);
      if (!isAiColorTheme(result?.id)) throw new Error('导入主题返回了无效结果，请刷新后重试');
      removedIds.delete(result.id);
      forget?.(result.id);
      await this.refresh();
      let applied = false;
      if (applyAfter && active && selected === revision) {
        await prepare(result.id, { refresh: true });
        if (active && selected === revision) { await apply(result.id); applied = true; }
      }
      return { ...result, applied };
    },
    async created(theme, selected) {
      if (!isAiColorTheme(theme?.id) || theme.apply !== true || removedIds.has(theme.id)) return;
      try {
        await this.refresh();
        if (!active || !Number.isSafeInteger(selected) || selected !== revision) return;
        await prepare(theme.id, { refresh: true });
        if (active && selected === revision && state.deletingId !== theme.id && !removedIds.has(theme.id)) await apply(theme.id);
      } catch (error) { report(error, true, theme.id); }
    },
    async remove(id) {
      if (!isAiColorTheme(id)) throw new Error('内置主题不能导出或删除');
      if (state.deletingId) throw new Error('主题正在处理中，请稍后重试');
      patch({ deletingId: id });
      try {
        const result = await remove(id);
        if (result?.deleted !== true || result.id !== id) throw new Error('删除主题返回了无效结果，请刷新后重试');
        removedIds.add(id);
        if (intent?.id === id) intent = null;
        forget?.(id);
        patch({ localEntries: state.localEntries.filter((item) => item.id !== id) });
        // Removing a local theme succeeds offline; never await the remote
        // catalogue before removing its card and releasing its image.
        void this.refresh();
        return result;
      } finally { patch({ deletingId: '' }); }
    },
    async install(entry, { automatic = false, expectedAppearance } = {}) {
      if (!automatic) userIntent = true;
      const selected = ++revision;
      intent = { id: entry.id, version: entry.version, revision: selected, automatic, expectedAppearance };
      try {
        patch({ error: '', failure: null, job: { id: entry.id, state: 'downloading', bytes_downloaded: 0, bytes_total: entry.package.bytes, automatic } });
        const consent = themeDownloadConsent(entry);
        const job = await api.installTheme(entry.id, automatic ? { ...consent, automatic: true } : consent);
        // Even a very fast install is observed by polling once so the same
        // completion path applies the theme and respects the selection revision.
        patch({ job: { automatic, ...job, state: themeJobActive(job) ? job.state : 'installing' } });
        void poll();
      } catch (error) {
        intent = null;
        patch({ job: { id: entry.id, state: 'failed', automatic } });
        report(error, true, entry.package?.url || entry.package?.path, automatic);
      }
    },
    async cancel() {
      revision += 1; intent = null;
      try { await api.cancelThemeInstall(); if (themeJobActive(state.job)) void poll(); }
      catch (error) { report(error, true); }
    },
  };
}
