// 「编辑项目」的图标表与色板。每个图标有两态,与侧栏项目行的折叠 / 展开对应:
// closed = 折叠(未展开),open = 展开(打开的文件夹、翻开的书、起飞的飞机、盛开的莲花……);
// 选图标网格里被选中的那一格也显示 open。两态都是 24×24 纯描边(fill="none",不许
// 出现实心填充),线宽由 WorkspaceIcon 统一给,与侧栏默认文件夹(VS 图标)同一粗细。
// 图形大多取自 Lucide(ISC 许可),文件夹两态按侧栏默认的 FolderClosed / FolderOpened
// 放大,其余 Lucide 没有同款的按同样的线宽手绘;缩放 / 旋转过的坐标已烘焙成静态值。
// 后端只把 id / color 当不透明的键存进 workspace.json(字符集 [a-z0-9-]),新增图标
// 只改这里。closed / open 是 <svg> 的内部标记,全部为本文件内的静态常量。

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
    closed: '<path d="M3.94 3.75L9.53 3.75Q10.18 3.75 10.57 4.27L12 6.48Q12.39 7 13.04 7L20.06 7Q21.75 7 21.75 8.69L21.75 18.96Q21.75 20.65 20.06 20.65L3.94 20.65Q2.25 20.65 2.25 18.95L2.25 5.43Q2.25 3.75 3.94 3.75Z"/>',
    open: '<path d="M2.25 16.09L2.25 5.43Q2.25 3.75 3.94 3.75L9.53 3.75Q10.18 3.75 10.57 4.27L12 6.48Q12.39 7 13.04 7L18.89 7Q20.45 7 20.45 8.95"/><path d="M6.15 10.25L20.45 10.25Q21.88 10.25 21.62 11.68L19.93 19.21Q19.67 20.65 18.11 20.65L3.81 20.65Q2.38 20.65 2.64 19.21L4.33 11.68Q4.59 10.25 6.15 10.25Z"/>',
  },
  {
    id: 'dollar',
    label: '钱币',
    keywords: 'dollar money finance coin',
    closed: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
    open: '<circle cx="9.5" cy="14.5" r="7.5"/><path d="M16.9 15.74A7 7 0 1 0 8.26 7.1"/><path d="M11.98 12.02L8.26 12.02A1.24 1.24 0 1 0 8.26 14.5L10.74 14.5A1.24 1.24 0 1 1 10.74 16.98L7.02 16.98"/><path d="M9.5 18.22L9.5 10.78"/>',
  },
  {
    id: 'book',
    label: '书',
    keywords: 'book read docs',
    closed: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
    open: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  },
  {
    id: 'graduation-cap',
    label: '学士帽',
    keywords: 'graduation cap school education study',
    closed: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    open: '<path d="M18.84 10.54A.86 .86 -14 0 0 18.44 9.01L10.47 7.54A1.72 1.72 -14 0 0 9.09 7.88L2.75 12.92A.86 .86 -14 0 0 3.13 14.45L11.09 15.93A1.72 1.72 -14 0 0 12.48 15.58Z"/><path d="M19.13 9.65L20.38 14.66"/><path d="M6.3 15.07L7.03 17.99A5.16 2.58 -14 0 0 17.04 15.49L16.31 12.57"/><path d="M19.5 2.5v3"/><path d="M18 4h3"/><path d="M4 3.5v2"/><path d="M3 4.5h2"/>',
  },
  {
    id: 'pencil',
    label: '铅笔',
    keywords: 'pencil edit write',
    closed: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    open: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/><path d="M13 21h8"/>',
  },
  {
    id: 'pen-tool',
    label: '钢笔',
    keywords: 'pen tool design vector',
    closed: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
    open: '<path d="M18.17 22.08A.7 .7 0 0 1 17.18 22.08L16.07 20.97A.7 .7 0 0 1 16.07 19.98L19.98 16.07A.7 .7 0 0 1 20.97 16.07L22.08 17.18A.7 .7 0 0 1 22.08 18.17Z"/><path d="M19.78 16.28L18.82 11.47A.7 .7 0 0 0 18.29 10.92L9.44 8.6A.7 .7 0 0 0 8.6 9.44L10.92 18.29A.7 .7 0 0 0 11.47 18.82L16.28 19.78"/><path d="M8.79 8.79L13.89 13.89"/><circle cx="14.88" cy="14.88" r="1.4"/><path d="M8.6 8.6C6.2 6.2 3.2 9.8 2.5 21.5"/>',
  },
  {
    id: 'braces',
    label: '代码',
    keywords: 'braces code json curly',
    closed: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    open: '<path d="M7 3H6a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M17 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/><path d="M9 8.5h6"/><path d="M11 12h4"/><path d="M11 15.5h2.5"/>',
  },
  {
    id: 'terminal',
    label: '终端',
    keywords: 'terminal shell console command',
    closed: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
    open: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M3 8h18"/><path d="m7 12 2 2-2 2"/><path d="M11 16h5"/>',
  },
  {
    id: 'music',
    label: '音乐',
    keywords: 'music note audio song',
    closed: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    open: '<path d="M7.08 19.06L7.08 8.92L16.44 7.36L16.44 17.5"/><circle cx="4.74" cy="19.06" r="2.34"/><circle cx="14.1" cy="17.5" r="2.34"/><path d="M18.2 4a4.5 4.5 0 0 1 0 6.4"/><path d="M20.6 2a7.6 7.6 0 0 1 0 10.4"/>',
  },
  {
    id: 'popcorn',
    label: '爆米花',
    keywords: 'popcorn movie cinema film',
    closed: '<path d="M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4"/><path d="M10 22 9 8"/><path d="m14 22 1-14"/><path d="M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z"/>',
    open: '<path d="M16.8 11.1A1.6 1.6 0 0 0 16.8 7.9A1.6 1.6 0 0 0 13.6 7.9A1.6 1.6 0 0 0 10.4 7.9A1.6 1.6 0 0 0 7.2 7.9A1.6 1.6 0 0 0 7.2 11.1"/><path d="M10.4 22.3L9.6 11.1"/><path d="M13.6 22.3L14.4 11.1"/><path d="M18.4 11.1C18.8 11.1 19.12 11.42 19.04 11.9L16.96 21.5C16.88 21.9 16.4 22.3 16 22.3L8 22.3C7.52 22.3 7.12 21.98 7.04 21.5L4.96 11.9C4.88 11.42 5.2 11.1 5.6 11.1Z"/><circle cx="6" cy="3.6" r="1.6"/><circle cx="18.6" cy="3.2" r="1.6"/><path d="M12 1.6v2"/><path d="M3 7.2l1.2.4"/><path d="M21.3 6.6l-1.3.6"/>',
  },
  {
    id: 'pencil-ruler',
    label: '尺规',
    keywords: 'pencil ruler design draw',
    closed: '<path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m18 16 2-2"/><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    open: '<path d="m12.99 6.74 1.93 3.44"/><path d="M19.136 12a10 10 0 0 1-14.271 0"/><path d="m21 21-2.16-3.84"/><path d="m3 21 8.02-14.26"/><circle cx="12" cy="5" r="2"/>',
  },
  {
    id: 'palette',
    label: '调色板',
    keywords: 'palette art paint color',
    closed: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/>',
    open: '<path d="M10 22A.8 .8 0 0 1 10 6A8 7.2 0 0 1 18 13.2A4 4 0 0 1 14 17.2L12.2 17.2A1.4 1.4 0 0 0 11.08 19.44L11.32 19.76A1.4 1.4 0 0 1 10.2 22Z"/><circle cx="11.2" cy="9.6" r=".4"/><circle cx="14.4" cy="12.8" r=".4"/><circle cx="5.6" cy="14.4" r=".4"/><circle cx="7.2" cy="10.4" r=".4"/><path d="m21.5 2.5-5 5"/><path d="M16.5 7.5c-1.4 0-2.5 1.1-2.5 2.5 1.4 0 2.5-1.1 2.5-2.5Z"/>',
  },
  {
    id: 'stethoscope',
    label: '听诊器',
    keywords: 'stethoscope medical health doctor',
    closed: '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
    open: '<path d="M9.68 3L9.68 4.84"/><path d="M4.16 3L4.16 4.84"/><path d="M4.16 3.92L3.24 3.92A1.84 1.84 0 0 0 1.4 5.76L1.4 9.44A5.52 5.52 0 0 0 12.44 9.44L12.44 5.76A1.84 1.84 0 0 0 10.6 3.92L9.68 3.92"/><path d="M6.92 14.96A5.52 5.52 0 0 0 17.96 14.96L17.96 12.2"/><circle cx="17.96" cy="10.36" r="1.84"/><path d="M21.4 7.4a4.2 4.2 0 0 1 0 5.2"/>',
  },
  {
    id: 'asterisk',
    label: '星号',
    keywords: 'asterisk star symbol',
    closed: '<path d="M10 4.5A2 2 0 0 1 14 4.5L14 8.54L17.5 6.52A2 2 0 0 1 19.5 9.98L16 12L19.5 14.02A2 2 0 0 1 17.5 17.48L14 15.46L14 19.5A2 2 0 0 1 10 19.5L10 15.46L6.5 17.48A2 2 0 0 1 4.5 14.02L8 12L4.5 9.98A2 2 0 0 1 6.5 6.52L10 8.54Z"/>',
    open: '<path d="M12 8.4L12 2.4"/><path d="M15.12 10.2L20.31 7.2"/><path d="M15.12 13.8L20.31 16.8"/><path d="M12 15.6L12 21.6"/><path d="M8.88 13.8L3.69 16.8"/><path d="M8.88 10.2L3.69 7.2"/>',
  },
  {
    id: 'lotus',
    label: '莲花',
    keywords: 'lotus flower yoga calm',
    closed: '<path d="M12 20.5c-2.8-2.5-3.6-6.4-2.2-10.4.5-1.5 1.2-2.8 2.2-4 1 1.2 1.7 2.5 2.2 4 1.4 4 .6 7.9-2.2 10.4Z"/><path d="M10.4 20.3C7.4 19.5 5.6 16.6 5.4 12.2c1.8.3 3.3 1.2 4.3 2.4"/><path d="M13.6 20.3c3-.8 4.8-3.7 5-8.1-1.8.3-3.3 1.2-4.3 2.4"/>',
    open: '<path d="M12 20.5c-2.8-2.5-3.6-6.4-2.2-10.4.5-1.5 1.2-2.8 2.2-4 1 1.2 1.7 2.5 2.2 4 1.4 4 .6 7.9-2.2 10.4Z"/><path d="M10.6 20.3C6.8 19.8 4 16.6 3.8 11c2.6.4 4.6 1.6 5.9 3.3"/><path d="M13.4 20.3c3.8-.5 6.6-3.7 6.8-9.3-2.6.4-4.6 1.6-5.9 3.3"/><path d="M8 20c-3.2.2-5.8-1.5-6.5-4.6 1.6-.5 3.2-.4 4.6.1"/><path d="M16 20c3.2.2 5.8-1.5 6.5-4.6-1.6-.5-3.2-.4-4.6.1"/>',
  },
  {
    id: 'briefcase',
    label: '公文包',
    keywords: 'briefcase work business job',
    closed: '<path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"/><rect width="20" height="14" x="2" y="6" rx="3"/>',
    open: '<path d="M2 12h20v6.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5Z"/><path d="M2.49 6.76L18.98 2.64A1.5 1.5 -14 0 1 20.8 3.74L21.04 4.71A1.5 1.5 -14 0 1 19.95 6.52L3.46 10.64A1.5 1.5 -14 0 1 1.64 9.54L1.4 8.57A1.5 1.5 -14 0 1 2.49 6.76Z"/><path d="M8.31 5.3L8.02 4.14A1 1 -14 0 1 8.75 2.93L11.66 2.2A1 1 -14 0 1 12.87 2.93L13.16 4.09"/>',
  },
  {
    id: 'chart',
    label: '图表',
    keywords: 'chart bar analytics data stats',
    closed: '<path d="M4 20v-7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7"/><path d="M9 20V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v15"/><path d="M14 20v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/><path d="M3 20h18"/>',
    open: '<path d="M4 20v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4"/><path d="M10 20v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6"/><path d="M16 20v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9"/><path d="M3 20h18"/><path d="m3.5 11 5-4.5 3.5 2.5 7-6"/><path d="M15.5 3H19v3.5"/>',
  },
  {
    id: 'kettlebell',
    label: '壶铃',
    keywords: 'kettlebell fitness workout weight',
    closed: '<path d="M8.5 8.3 7.9 6A3.2 3.2 0 0 1 11 2.8h2A3.2 3.2 0 0 1 16.1 6l-.6 2.3"/><path d="M6.2 21A8 8 0 1 1 17.8 21Z"/>',
    open: '<path d="M9.3 9.47L8.23 7.67A2.82 2.82 -16 0 1 10.08 4.21L11.77 3.73A2.82 2.82 -16 0 1 15.17 5.68L15.22 7.78"/><path d="M10.43 20.77A7.04 7.04 -16 1 1 20.25 17.96Z"/><path d="M2.5 10.5a9 9 0 0 0 1.6 7.5"/><path d="M4.8 7.5a7 7 0 0 0-.2 3"/>',
  },
  {
    id: 'dumbbell',
    label: '哑铃',
    keywords: 'dumbbell gym fitness workout',
    closed: '<rect x="5" y="6" width="3" height="12" rx="1"/><rect x="16" y="6" width="3" height="12" rx="1"/><path d="M8 12h8"/><path d="M5 9H3.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H5"/><path d="M19 9h1.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H19"/>',
    open: '<path d="M4.99 10.73L5.68 10.16A.9 .9 -40 0 1 6.95 10.27L12.73 17.16A.9 .9 -40 0 1 12.62 18.43L11.93 19.01A.9 .9 -40 0 1 10.67 18.9L4.88 12A.9 .9 -40 0 1 4.99 10.73Z"/><path d="M12.58 4.37L13.27 3.79A.9 .9 -40 0 1 14.53 3.9L20.32 10.8A.9 .9 -40 0 1 20.21 12.07L19.52 12.64A.9 .9 -40 0 1 18.25 12.53L12.47 5.64A.9 .9 -40 0 1 12.58 4.37Z"/><path d="M9.84 13.71L15.36 9.09"/><path d="M6.04 13.38L5 14.25A.9 .9 -40 0 0 4.89 15.52L7.21 18.27A.9 .9 -40 0 0 8.48 18.39L9.51 17.52"/><path d="M15.69 5.28L16.72 4.41A.9 .9 -40 0 1 17.99 4.53L20.31 7.28A.9 .9 -40 0 1 20.2 8.55L19.16 9.42"/><path d="M3 16.5 5 18.5"/><path d="M5.5 20.5 6.5 21.5"/><path d="M2 19.5l1 1"/>',
  },
  {
    id: 'notebook',
    label: '笔记本',
    keywords: 'notebook notes journal',
    closed: '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/>',
    open: '<rect x="2" y="4" width="8.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="8.5" height="16" rx="1.5"/><path d="M9.5 8h5"/><path d="M9.5 12h5"/><path d="M9.5 16h5"/><path d="M4.5 8h2.5"/><path d="M4.5 12h2.5"/><path d="M17 8h2.5"/><path d="M17 12h2.5"/>',
  },
  {
    id: 'scale',
    label: '天平',
    keywords: 'scale balance law justice',
    closed: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    open: '<path d="M3.61 8.83L5.57 8.41C7.53 8 10.25 6.39 12 5C14.16 5.56 17.31 5.92 19.26 5.5L21.22 5.09"/><path d="M2.55 17.4L5.55 9.4L8.55 17.4C7.68 18.05 6.63 18.4 5.55 18.4C4.47 18.4 3.42 18.05 2.55 17.4Z"/><path d="M16.2 14.5L19.2 6.5L22.2 14.5C21.33 15.15 20.28 15.5 19.2 15.5C18.12 15.5 17.07 15.15 16.2 14.5Z"/><path d="M7 21h10"/><path d="M12 3v18"/>',
  },
  {
    id: 'globe-stand',
    label: '地球仪',
    keywords: 'globe stand geography earth school',
    closed: '<circle cx="11" cy="9" r="6"/><path d="M16.66 3.34A8 8 0 0 1 5.34 14.66"/><path d="M11 17v4"/><path d="M7 21h8"/>',
    open: '<circle cx="11" cy="9" r="6"/><path d="M16.66 3.34A8 8 0 0 1 5.34 14.66"/><path d="M11 17v4"/><path d="M7 21h8"/><path d="M5 9h12"/><path d="M11 3a8.5 8.5 0 0 1 0 12"/><path d="M11 3a8.5 8.5 0 0 0 0 12"/>',
  },
  {
    id: 'plane',
    label: '飞机',
    keywords: 'plane travel flight trip',
    closed: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    open: '<path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z"/>',
  },
  {
    id: 'globe',
    label: '地球',
    keywords: 'globe world web internet',
    closed: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    open: '<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/>',
  },
  {
    id: 'wrench',
    label: '扳手',
    keywords: 'wrench tool settings fix',
    closed: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    open: '<path d="M12.72 5.5A.86 .86 0 0 0 12.72 6.7L14.1 8.08A.86 .86 0 0 0 15.3 8.08L18.54 4.84A5.16 5.16 0 0 1 11.72 11.66L5.77 17.61A1.82 1.82 0 0 1 3.19 15.03L9.14 9.08A5.16 5.16 0 0 1 15.96 2.26L12.73 5.49Z"/><path d="M21.5 12.5a8.5 8.5 0 0 1-8 8.5"/><path d="m16 18.8-2.5 2.2 2.4 1.9"/>',
  },
  {
    id: 'paw',
    label: '爪印',
    keywords: 'paw pet animal dog cat',
    closed: '<circle cx="5.5" cy="10.5" r="1.8"/><circle cx="9.3" cy="6" r="1.8"/><circle cx="14.7" cy="6" r="1.8"/><circle cx="18.5" cy="10.5" r="1.8"/><path d="M12 12.5c-2.8 0-5.5 3.2-5.5 5.6 0 1.6 1.2 2.4 2.6 2.4 1.2 0 1.9-.6 2.9-.6s1.7.6 2.9.6c1.4 0 2.6-.8 2.6-2.4 0-2.4-2.7-5.6-5.5-5.6Z"/>',
    open: '<circle cx="3.31" cy="15.59" r="1.01"/><circle cx="4.55" cy="12.54" r="1.01"/><circle cx="7.43" cy="11.6" r="1.01"/><circle cx="10.23" cy="13.34" r="1.01"/><path d="M7.11 15.53C5.62 16.02 4.74 18.19 5.15 19.47C5.43 20.32 6.21 20.54 6.95 20.3C7.59 20.09 7.86 19.65 8.39 19.47C8.93 19.3 9.4 19.5 10.04 19.29C10.79 19.05 11.29 18.42 11.01 17.56C10.6 16.29 8.6 15.05 7.11 15.53Z"/><circle cx="12.91" cy="6.39" r="1.01"/><circle cx="14.15" cy="3.34" r="1.01"/><circle cx="17.03" cy="2.4" r="1.01"/><circle cx="19.83" cy="4.14" r="1.01"/><path d="M16.71 6.33C15.22 6.82 14.34 8.99 14.75 10.27C15.03 11.12 15.81 11.34 16.55 11.1C17.19 10.89 17.46 10.45 17.99 10.27C18.53 10.1 19 10.3 19.64 10.09C20.39 9.85 20.89 9.22 20.61 8.36C20.2 7.09 18.2 5.85 16.71 6.33Z"/>',
  },
  {
    id: 'flask',
    label: '烧瓶',
    keywords: 'flask lab science chemistry experiment',
    closed: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
    open: '<path d="M13.72 4.8L13.72 9.96A1.72 1.72 0 0 0 13.93 10.79L18.67 19.45A1.72 1.72 0 0 1 17.16 22L6.84 22A1.72 1.72 0 0 1 5.33 19.45L10.07 10.79A1.72 1.72 0 0 0 10.28 9.96L10.28 4.8"/><path d="M7.23 15.98L16.77 15.98"/><path d="M8.99 4.8L15.01 4.8"/><circle cx="10.2" cy="17.9" r=".9"/><circle cx="13.9" cy="18.6" r=".6"/><circle cx="10.6" cy="2.4" r="1"/><circle cx="14" cy="1.9" r=".6"/>',
  },
  {
    id: 'brain',
    label: '大脑',
    keywords: 'brain mind think ai idea',
    closed: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
    open: '<path d="M12 8.8A2.4 2.4 0 1 0 7.2 8.9A3.2 3.2 0 0 0 5.18 13.52A3.2 3.2 0 0 0 5.63 18.79A3.2 3.2 0 1 0 12 19.2Z"/><path d="M12 8.8A2.4 2.4 0 1 1 16.8 8.9A3.2 3.2 0 0 1 18.82 13.52A3.2 3.2 0 0 1 18.37 18.79A3.2 3.2 0 1 1 12 19.2Z"/><path d="M14.4 15.2A3.6 3.6 0 0 1 12 12A3.6 3.6 0 0 1 9.6 15.2"/><path d="M16.48 10A2.4 2.4 0 0 0 16.8 8.9"/><path d="M7.2 8.9A2.4 2.4 0 0 0 7.52 10"/><path d="M5.18 13.52A3.2 3.2 0 0 1 5.65 13.2"/><path d="M18.35 13.2A3.2 3.2 0 0 1 18.82 13.52"/><path d="M7.2 19.2A3.2 3.2 0 0 1 5.63 18.79"/><path d="M18.37 18.79A3.2 3.2 0 0 1 16.8 19.2"/><path d="M12 1.2v1.6"/><path d="m5 3.2 1.1 1.1"/><path d="m19 3.2-1.1 1.1"/>',
  },
  {
    id: 'heart',
    label: '爱心',
    keywords: 'heart love favorite like',
    closed: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    open: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  },
  {
    id: 'plant',
    label: '盆栽',
    keywords: 'plant pot sprout garden leaf',
    closed: '<path d="M5 12h14v2.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="m6.5 15.5 1.3 5.1a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9l1.3-5.1"/><path d="M12 12V7"/><path d="M12 9c0-3 2-5 5.5-5 0 3-2 5-5.5 5Z"/><path d="M12 10.5C12 8 10.2 6.3 7 6.3c0 2.6 1.8 4.2 5 4.2Z"/>',
    open: '<path d="M5 12h14v2.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="m6.5 15.5 1.3 5.1a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9l1.3-5.1"/><path d="M12 12V7.5"/><path d="M12 10.8c.3-1.8 1.8-2.8 4-2.8-.2 1.9-1.8 2.8-4 2.8Z"/><path d="M12 10.8C11.7 9 10.2 8 8 8c.2 1.9 1.8 2.8 4 2.8Z"/><path d="M9.2 2.4 10.6 3.8 12 1.8l1.4 2 1.4-1.4v2.3a2.8 2.8 0 0 1-5.6 0Z"/>',
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
