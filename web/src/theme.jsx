// ThemeContext + persist + system preference fallback。
//
// 主题切换不是改 inline style 而是改 <html data-theme="dark|light">,所有
// 颜色由 CSS variables 驱动(见 styles/globals.css)。
//
// 持久化走 lib/usePreference.js — 与 view / sidePanelCollapsed / layout widths
// 共享同一份 try/catch 兜底逻辑。useTheme() 对外 API 不变。

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePreference } from './lib/usePreference.js';
import { api } from './lib/api.js';
import { EVA_THEME_ID, themeCssProperties, validThemeDefinition } from './lib/themePackages.js';
import { pushWindowBackgroundColor } from './lib/desktopWindowBackground.js';
import { desktopTaskbarBadge } from './lib/desktopTaskbarBadge.js';
import {
  effectiveAppearanceTheme,
  initialAppearancePreferences,
} from './lib/appearancePreferences.js';
import {
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  effectiveColorTheme,
  isValidColorTheme,
} from './lib/colorTheme.js';

const STORAGE_KEY = 'ace.theme';
const ThemeCtx = createContext({
  theme: 'light',
  colorTheme: DEFAULT_COLOR_THEME,
  toggle: () => {},
  set: () => {},
  setColorTheme: () => {},
  prepareTheme: async () => {},
});

function isValidTheme(v) { return v === 'system' || v === 'light' || v === 'dark'; }

export function ThemeProvider({ children }) {
  // Desktop 会在模块执行前注入稳定配置;普通 WebUI 则以系统/默认值起步。
  // 当前 origin 的 localStorage 仍作为首帧缓存,认证后由 App 用 daemon 配置校正。
  const initialAppearance = initialAppearancePreferences();
  const [themeMode, setTheme] = usePreference(
    STORAGE_KEY,
    initialAppearance.theme,
    isValidTheme,
  );
  const [colorTheme, setColorThemePreference] = usePreference(
    COLOR_THEME_STORAGE_KEY,
    initialAppearance.colorTheme,
    isValidColorTheme,
  );
  const [systemTheme, setSystemTheme] = useState(() => effectiveAppearanceTheme('system'));
  const [installedTheme, setInstalledTheme] = useState(null);
  const themeCache = useRef(new Map());
  const themeReloadRequired = useRef(new Set());
  const mounted = useRef(true);
  const prepareTheme = useCallback(async (id, { refresh = false } = {}) => {
    if (id !== EVA_THEME_ID) return null;
    refresh = refresh || themeReloadRequired.current.has(id);
    const previous = refresh ? themeCache.current.get(id) : null;
    if (refresh || !themeCache.current.has(id)) {
      const pending = (async () => {
        const definition = await api.getTheme(id);
        if (!validThemeDefinition(definition)) throw new Error('主题配色数据无效');
        const blob = await api.readThemeImage(id, 'background', definition.version);
        return { ...definition, backgroundUrl: URL.createObjectURL(blob) };
      })();
      themeCache.current.set(id, pending);
      // Keep the old image usable until its replacement is ready, then release
      // it even if the provider unmounts while either request is pending.
      if (previous) pending.then(() => previous.then((item) => URL.revokeObjectURL(item.backgroundUrl))).catch(() => {});
    }
    const pending = themeCache.current.get(id);
    try {
      const ready = await pending;
      if (mounted.current && themeCache.current.get(id) === pending) {
        themeReloadRequired.current.delete(id);
        setInstalledTheme(ready);
      }
      return ready;
    } catch (error) {
      if (themeCache.current.get(id) === pending) {
        if (previous) {
          themeCache.current.set(id, previous);
          themeReloadRequired.current.add(id);
        }
        else themeCache.current.delete(id);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const cache = themeCache.current;
      for (const pending of cache.values()) pending.then((item) => URL.revokeObjectURL(item.backgroundUrl)).catch(() => {});
      cache.clear();
      themeReloadRequired.current.clear();
    };
  }, []);
  useEffect(() => {
    if (colorTheme === EVA_THEME_ID) void prepareTheme(colorTheme).catch(() => {});
  }, [colorTheme, prepareTheme]);
  useEffect(() => {
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const changed = () => setSystemTheme(media.matches ? 'dark' : 'light');
    changed();
    media.addEventListener?.('change', changed);
    return () => media.removeEventListener?.('change', changed);
  }, []);
  const theme = colorTheme === EVA_THEME_ID ? 'light' : themeMode === 'system' ? systemTheme : themeMode;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-color-theme', colorTheme);
    const properties = installedTheme?.id === colorTheme
      ? themeCssProperties(installedTheme, installedTheme.backgroundUrl) : {};
    for (const [key, value] of Object.entries(properties)) root.style.setProperty(key, value);
    if (installedTheme?.id === colorTheme) root.setAttribute('data-installed-theme', colorTheme);
    else root.removeAttribute('data-installed-theme');
    // 两个主题维度落地后 --ace-bg 的 computed 值同步可读;把 body 底色推给
    // 桌面壳,native 换窗口打底色(快速 resize 的新暴露区域随主题,不闪黑/白)。
    // 非桌面壳环境内部 no-op。
    pushWindowBackgroundColor();
    desktopTaskbarBadge.refresh();
    return () => {
      for (const key of Object.keys(properties)) root.style.removeProperty(key);
      root.removeAttribute('data-installed-theme');
    };
  }, [colorTheme, theme, installedTheme]);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);
  const set    = useCallback((t) => setTheme(isValidTheme(t) ? t : 'system'), [setTheme]);
  const setColorTheme = useCallback(
    (value) => setColorThemePreference(effectiveColorTheme(value)),
    [setColorThemePreference],
  );

  return (
    <ThemeCtx.Provider value={{ theme, themeMode, colorTheme, toggle, set, setColorTheme, prepareTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() { return useContext(ThemeCtx); }
