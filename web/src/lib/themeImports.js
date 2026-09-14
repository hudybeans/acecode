export const MAX_THEME_IMPORT_BYTES = 16 * 1024 * 1024;

export function themeWorkshopUrl(baseUrl) {
  const url = new URL(String(baseUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('主题工坊地址无效，请检查更新源设置');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/workshop`;
  url.search = '';
  url.hash = '';
  return url.href;
}

export function validateThemeImportFile(file) {
  if (!file || !/\.zip$/i.test(file.name) || !(file.size > 0) || file.size > MAX_THEME_IMPORT_BYTES) {
    throw new Error('请选择不超过 16 MB 的完整主题 ZIP');
  }
}

export function themeImportError(error) {
  const messages = {
    THEME_INVALID_PACKAGE: '主题包校验失败，请重新从 ACECode 导出完整主题 ZIP',
    THEME_PACKAGE_TOO_LARGE: '请选择不超过 16 MB 的完整主题 ZIP',
    THEME_VERSION_CONFLICT: '此主题版本已存在且内容不同，请更新版本后重新导出',
    THEME_IMPORT_CHANGED: '主题包已变化，请重新选择文件并确认预览',
    THEME_BUSY: '主题正在处理中，请稍后重试',
  };
  return messages[error?.code] || error?.message || '导入主题失败，请重试';
}
