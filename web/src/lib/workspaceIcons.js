// 「编辑项目」的图标表与色板。图形取自 Lucide(ISC 许可)的 24×24 描边路径;壶铃、
// 地球仪、莲花、盆栽、星号等几款 Lucide 没有同款的,按同样的线宽手绘近似。
// 后端只把 id / color 当不透明的键存进 workspace.json(字符集 [a-z0-9-]),新增图标
// 只改这里。body 是 <svg> 的内部标记,全部为本文件内的静态常量。

export const DEFAULT_WORKSPACE_ICON_ID = 'folder';
export const DEFAULT_WORKSPACE_ICON_COLOR = 'default';

export const WORKSPACE_ICON_COLORS = Object.freeze([
  { id: 'default', label: '默认', value: '' },
  { id: 'red', label: '红色', value: '#ff4d4a' },
  { id: 'orange', label: '橙色', value: '#ff6b1f' },
  { id: 'yellow', label: '黄色', value: '#ffc400' },
  { id: 'green', label: '绿色', value: '#12b24c' },
  { id: 'blue', label: '蓝色', value: '#0a84ff' },
  { id: 'purple', label: '紫色', value: '#9b57f5' },
  { id: 'pink', label: '粉色', value: '#ff66aa' },
]);

export const WORKSPACE_ICONS = Object.freeze([
  {
    id: 'folder',
    label: '文件夹',
    keywords: 'folder directory project',
    body: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>',
  },
  {
    id: 'dollar',
    label: '钱币',
    keywords: 'dollar money finance coin',
    body: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  },
  {
    id: 'book',
    label: '书',
    keywords: 'book read docs',
    body: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  },
  {
    id: 'graduation-cap',
    label: '学士帽',
    keywords: 'graduation cap school education study',
    body: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  },
  {
    id: 'pencil',
    label: '铅笔',
    keywords: 'pencil edit write',
    body: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  },
  {
    id: 'pen-tool',
    label: '钢笔',
    keywords: 'pen tool design vector',
    body: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
  },
  {
    id: 'braces',
    label: '代码',
    keywords: 'braces code json curly',
    body: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  },
  {
    id: 'terminal',
    label: '终端',
    keywords: 'terminal shell console command',
    body: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  },
  {
    id: 'music',
    label: '音乐',
    keywords: 'music note audio song',
    body: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  },
  {
    id: 'popcorn',
    label: '爆米花',
    keywords: 'popcorn movie cinema film',
    body: '<path d="M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4"/><path d="M10 22 9 8"/><path d="m14 22 1-14"/><path d="M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z"/>',
  },
  {
    id: 'pencil-ruler',
    label: '尺规',
    keywords: 'pencil ruler design draw',
    body: '<path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m18 16 2-2"/><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  },
  {
    id: 'palette',
    label: '调色板',
    keywords: 'palette art paint color',
    body: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  },
  {
    id: 'stethoscope',
    label: '听诊器',
    keywords: 'stethoscope medical health doctor',
    body: '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  },
  {
    id: 'asterisk',
    label: '星号',
    keywords: 'asterisk star symbol',
    body: '<path d="M10 4.5A2 2 0 0 1 14 4.5L14 8.54L17.5 6.52A2 2 0 0 1 19.5 9.98L16 12L19.5 14.02A2 2 0 0 1 17.5 17.48L14 15.46L14 19.5A2 2 0 0 1 10 19.5L10 15.46L6.5 17.48A2 2 0 0 1 4.5 14.02L8 12L4.5 9.98A2 2 0 0 1 6.5 6.52L10 8.54Z"/>',
  },
  {
    id: 'lotus',
    label: '莲花',
    keywords: 'lotus flower yoga calm',
    body: '<path d="M12 20.5c-2.8-2.5-3.6-6.4-2.2-10.4.5-1.5 1.2-2.8 2.2-4 1 1.2 1.7 2.5 2.2 4 1.4 4 .6 7.9-2.2 10.4Z"/><path d="M10.6 20.3C6.8 19.8 4 16.6 3.8 11c2.6.4 4.6 1.6 5.9 3.3"/><path d="M13.4 20.3c3.8-.5 6.6-3.7 6.8-9.3-2.6.4-4.6 1.6-5.9 3.3"/><path d="M8 20c-3.2.2-5.8-1.5-6.5-4.6 1.6-.5 3.2-.4 4.6.1"/><path d="M16 20c3.2.2 5.8-1.5 6.5-4.6-1.6-.5-3.2-.4-4.6.1"/>',
  },
  {
    id: 'briefcase',
    label: '公文包',
    keywords: 'briefcase work business job',
    body: '<path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"/><rect width="20" height="14" x="2" y="6" rx="3"/>',
  },
  {
    id: 'chart',
    label: '图表',
    keywords: 'chart bar analytics data stats',
    body: '<path d="M4 20v-7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7"/><path d="M9 20V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v15"/><path d="M14 20v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/><path d="M3 20h18"/>',
  },
  {
    id: 'kettlebell',
    label: '壶铃',
    keywords: 'kettlebell fitness workout weight',
    body: '<path d="M8.5 8.3 7.9 6A3.2 3.2 0 0 1 11 2.8h2A3.2 3.2 0 0 1 16.1 6l-.6 2.3"/><path d="M6.2 21A8 8 0 1 1 17.8 21Z"/>',
  },
  {
    id: 'dumbbell',
    label: '哑铃',
    keywords: 'dumbbell gym fitness workout',
    body: '<rect x="5" y="6" width="3" height="12" rx="1"/><rect x="16" y="6" width="3" height="12" rx="1"/><path d="M8 12h8"/><path d="M5 9H3.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H5"/><path d="M19 9h1.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H19"/>',
  },
  {
    id: 'notebook',
    label: '笔记本',
    keywords: 'notebook notes journal',
    body: '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/>',
  },
  {
    id: 'scale',
    label: '天平',
    keywords: 'scale balance law justice',
    body: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  },
  {
    id: 'globe-stand',
    label: '地球仪',
    keywords: 'globe stand geography earth school',
    body: '<circle cx="11" cy="9" r="6"/><path d="M16.66 3.34A8 8 0 0 1 5.34 14.66"/><path d="M11 17v4"/><path d="M7 21h8"/>',
  },
  {
    id: 'plane',
    label: '飞机',
    keywords: 'plane travel flight trip',
    body: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  },
  {
    id: 'globe',
    label: '地球',
    keywords: 'globe world web internet',
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  },
  {
    id: 'wrench',
    label: '扳手',
    keywords: 'wrench tool settings fix',
    body: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  },
  {
    id: 'paw',
    label: '爪印',
    keywords: 'paw pet animal dog cat',
    body: '<circle cx="5.5" cy="10.5" r="1.8"/><circle cx="9.3" cy="6" r="1.8"/><circle cx="14.7" cy="6" r="1.8"/><circle cx="18.5" cy="10.5" r="1.8"/><path d="M12 12.5c-2.8 0-5.5 3.2-5.5 5.6 0 1.6 1.2 2.4 2.6 2.4 1.2 0 1.9-.6 2.9-.6s1.7.6 2.9.6c1.4 0 2.6-.8 2.6-2.4 0-2.4-2.7-5.6-5.5-5.6Z"/>',
  },
  {
    id: 'flask',
    label: '烧瓶',
    keywords: 'flask lab science chemistry experiment',
    body: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
  },
  {
    id: 'brain',
    label: '大脑',
    keywords: 'brain mind think ai idea',
    body: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
  },
  {
    id: 'heart',
    label: '爱心',
    keywords: 'heart love favorite like',
    body: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  },
  {
    id: 'plant',
    label: '盆栽',
    keywords: 'plant pot sprout garden leaf',
    body: '<path d="M5 12h14v2.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="m6.5 15.5 1.3 5.1a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9l1.3-5.1"/><path d="M12 12V7"/><path d="M12 9c0-3 2-5 5.5-5 0 3-2 5-5.5 5Z"/><path d="M12 10.5C12 8 10.2 6.3 7 6.3c0 2.6 1.8 4.2 5 4.2Z"/>',
  },
]);

const ICON_BY_ID = new Map(WORKSPACE_ICONS.map((icon) => [icon.id, icon]));
const COLOR_BY_ID = new Map(WORKSPACE_ICON_COLORS.map((color) => [color.id, color]));

export function workspaceIconById(id) {
  return ICON_BY_ID.get(String(id || '')) || null;
}

// 未知颜色键(手改过的 workspace.json、以后删掉的颜色)一律退回默认色。
export function workspaceIconColorValue(colorId) {
  return COLOR_BY_ID.get(String(colorId || ''))?.value || '';
}

export function isKnownWorkspaceIconColor(colorId) {
  return COLOR_BY_ID.has(String(colorId || ''));
}

// 后端返回的 icon 字段 → 可渲染的 {id, color};未设置 / 未知图标 → null,
// 调用方显示默认的展开 / 折叠文件夹图标。
export function resolveWorkspaceIcon(icon) {
  if (!icon || typeof icon !== 'object') return null;
  const found = workspaceIconById(icon.id);
  if (!found) return null;
  const color = isKnownWorkspaceIconColor(icon.color) ? icon.color : DEFAULT_WORKSPACE_ICON_COLOR;
  return { id: found.id, color };
}

// 默认图标 + 默认色等价于「没设置」:保存时省略,侧栏保留展开 / 折叠两态图标。
export function isDefaultWorkspaceIcon(icon) {
  const resolved = resolveWorkspaceIcon(icon);
  return !resolved
    || (resolved.id === DEFAULT_WORKSPACE_ICON_ID && resolved.color === DEFAULT_WORKSPACE_ICON_COLOR);
}

// 搜索图标:按本地化后的名称与英文关键词做不区分大小写的子串匹配;空查询返回全部。
export function filterWorkspaceIcons(query, icons = WORKSPACE_ICONS) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return icons.slice();
  return icons.filter((icon) => {
    const haystack = `${icon.label} ${icon.keywords} ${icon.id}`.toLowerCase();
    return needle.split(/\s+/).every((part) => haystack.includes(part));
  });
}
