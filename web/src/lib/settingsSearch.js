import { SETTINGS_NAV_ITEMS } from './settingsNavigation.js';
import { sourceCatalogs } from '../i18n/sourceCatalog.generated.js';

// Labels are also the destination anchors. Both catalog languages remain searchable.
export function settingsSearchEntries() {
  const fields = [
    ['general', '界面语言', 'language locale english chinese'],
    ['general', '工作模式', 'work mode coding daily'],
    ['general', '打开任务完成通知', 'notification completion sound'],
    ['general', '新手指引', 'onboarding getting started tour'],
    ['general', '权限模式', 'permission approval sandbox'],
    ['general', '默认打开目标', 'default open target editor'],
    ['general', '最大轮次', 'max turns limit'],
    ['general', '后台进程状态', 'background daemon process'],
    ['general', '关闭窗口时', 'close window tray exit'],
    ['general', '远程 Web 模式', 'remote web network port bind'],
    ['appearance', '主题', 'theme accent blue orange color'],
    ['appearance', '暗黑模式', 'dark light mode'],
    ['appearance', '字体大小', 'font size'],
    ['appearance', '显示任务时间', 'sidebar task time timestamp'],
    ['config', '升级服务 URL', 'upgrade update service url'],
    ['config', 'Python 工具', 'python uv ruff mypy path directory'],
    ['config', 'Node.js 工具', 'node nodejs npm pnpm tsx path directory'],
    ['config', 'C# 工具', 'csharp dotnet roslyn sdk path directory'],
    ['config', '终端类型', 'default terminal shell powershell pwsh cmd bash zsh fish'],
    ['config', '终端程序路径', 'terminal program executable path powershell pwsh'],
    ['config', '工作空间路径', 'workspace data directory path migrate backup'],
    ['personalization', '自定义指令', 'custom instructions prompt personalization'],
    ['skills', '工作区 Skill 目录', 'workspace skill directory'],
    ['mcp', '服务器配置', 'mcp server config json'],
    ['tools', '内置工具', 'builtin tools'],
    ['tools', 'Agent 浏览器', 'agent browser'],
    ['tools', '图像生成', 'image generation drawing'],
    ['archived', '归档列表', 'archived sessions restore delete'],
    ['usage', '每日用量趋势', 'daily tokens usage statistics'],
    ['usage', '模型用量明细', 'model tokens usage'],
    ['usage', '工作区用量', 'workspace usage'],
    ['feedback', '反馈内容', 'feedback message bug'],
    ['about', '当前版本', 'version upgrade'],
    ['about', 'Web 核心', 'webview browser engine'],
  ];
  const all = [
    ...fields.map(([section, label, aliases], index) => ({ id: `setting-${index}`, section, label, aliases })),
    ...SETTINGS_NAV_ITEMS.map((item) => ({ id: `section-${item.key}`, section: item.key, label: item.label, aliases: item.key })),
  ];
  const catalogs = Object.entries(sourceCatalogs['zh-CN']);
  return all.map((item) => {
    const source = catalogs.find(([key, zh]) => zh === item.label || sourceCatalogs['en-US'][key] === item.label);
    return { ...item, translations: source ? [source[1], sourceCatalogs['en-US'][source[0]]] : [],
      sectionLabel: SETTINGS_NAV_ITEMS.find((nav) => nav.key === item.section)?.label || item.section };
  });
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s._-]+/gu, ' ').trim();
}

export function searchSettings(entries, query) {
  const needle = normalize(query);
  if (!needle) return [];
  const words = needle.split(/\s+/u);
  return entries.map((item) => {
    const labels = [item.label, ...(item.translations || [])].map(normalize);
    const text = normalize([item.label, item.sectionLabel, item.aliases, ...(item.translations || [])].join(' '));
    const score = labels.some((label) => label === needle) ? 100
      : labels.some((label) => label.startsWith(needle)) ? 80
      : labels.some((label) => label.includes(needle)) ? 60
      : words.every((word) => text.includes(word)) ? 20 : 0;
    return { item, score };
  }).filter((entry) => entry.score).sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

export function locateSetting(root, result) {
  if (!root || !result) return null;
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const labels = [result.label, ...(result.translations || [])].map(normalize);
  let node;
  while ((node = walker.nextNode())) {
    const element = node.parentElement;
    if (!element || element.closest('select, option, button, textarea, [hidden]')) continue;
    if (labels.includes(normalize(node.textContent)) && element.getClientRects().length) return element;
  }
  return null;
}
