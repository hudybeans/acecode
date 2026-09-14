export const COLOR_THEME_STORAGE_KEY = 'ace.colorTheme';
export const DEFAULT_COLOR_THEME = 'blue';
export const NATIONAL_DAY_THEME_ID = 'national-day-2026';
export const COLOR_THEME_VALUES = Object.freeze(['blue', 'orange', NATIONAL_DAY_THEME_ID, 'eva-01']);

const ALLOWED_COLOR_THEMES = new Set(COLOR_THEME_VALUES);

export function isAiColorTheme(value) {
  return typeof value === 'string' && value.length <= 64 && /^ai-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isInstalledColorTheme(value) {
  return isDownloadableColorTheme(value) || isAiColorTheme(value);
}

export function isDownloadableColorTheme(value) {
  return value === 'eva-01' || value === NATIONAL_DAY_THEME_ID;
}

export function isValidColorTheme(value) {
  return ALLOWED_COLOR_THEMES.has(value) || isAiColorTheme(value);
}

export function effectiveColorTheme(value) {
  return isValidColorTheme(value) ? value : DEFAULT_COLOR_THEME;
}
