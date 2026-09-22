export const SIDEBAR_NAV_ITEMS = Object.freeze([
  Object.freeze({ id: 'new-task', label: '新建任务', icon: 'newSession', callback: 'onNewTask' }),
  Object.freeze({ id: 'new-loop', label: '定时任务', icon: 'alarm', callback: 'onNewLoop' }),
  Object.freeze({ id: 'extensions', label: '扩展', icon: 'extension', action: 'extensions' }),
]);

export const SIDEBAR_CUSTOM_ITEMS = Object.freeze([
  Object.freeze({ id: 'models', label: '模型', icon: 'brain', settingsSection: 'models' }),
  Object.freeze({ id: 'mcp', label: 'MCP 服务器', icon: 'mcp', settingsSection: 'mcp' }),
  Object.freeze({ id: 'skills', label: '技能', icon: 'lightbulb', settingsSection: 'skills' }),
  Object.freeze({ id: 'experts', label: '专家组件', icon: 'expert', action: 'experts' }),
]);

// 「扩展」弹出菜单的用户自定义:order 是全部条目的显示顺序,pinned 是被勾选、
// 直接固定在侧栏主导航里的条目(不再出现在弹出菜单中)。未勾选的条目按同一顺序
// 留在弹出菜单里。存储里缺失 / 未知的 id 都在 normalize 时修正,所以以后新增条目
// 会自动追加到末尾,删掉条目也不会让旧偏好把菜单弄坏。
export const DEFAULT_SIDEBAR_EXTENSION_PREFS = Object.freeze({
  order: Object.freeze(SIDEBAR_CUSTOM_ITEMS.map((item) => item.id)),
  pinned: Object.freeze([]),
});

const SIDEBAR_CUSTOM_ITEM_BY_ID = new Map(SIDEBAR_CUSTOM_ITEMS.map((item) => [item.id, item]));

function uniqueKnownIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of value) {
    if (typeof id !== 'string' || !SIDEBAR_CUSTOM_ITEM_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function validateSidebarExtensionPrefs(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Array.isArray(value.order) && Array.isArray(value.pinned);
}

export function normalizeSidebarExtensionPrefs(value) {
  if (!validateSidebarExtensionPrefs(value)) {
    return { order: [...DEFAULT_SIDEBAR_EXTENSION_PREFS.order], pinned: [] };
  }
  const order = uniqueKnownIds(value.order);
  for (const item of SIDEBAR_CUSTOM_ITEMS) {
    if (!order.includes(item.id)) order.push(item.id);
  }
  const pinnedSet = new Set(uniqueKnownIds(value.pinned));
  return { order, pinned: order.filter((id) => pinnedSet.has(id)) };
}

export function sidebarExtensionLayout(value) {
  const prefs = normalizeSidebarExtensionPrefs(value);
  const pinnedSet = new Set(prefs.pinned);
  const entries = prefs.order.map((id) => ({ item: SIDEBAR_CUSTOM_ITEM_BY_ID.get(id), pinned: pinnedSet.has(id) }));
  return {
    entries,
    pinned: entries.filter((entry) => entry.pinned).map((entry) => entry.item),
    menu: entries.filter((entry) => !entry.pinned).map((entry) => entry.item),
  };
}

export function toggleSidebarExtensionPinned(value, id) {
  const prefs = normalizeSidebarExtensionPrefs(value);
  if (!SIDEBAR_CUSTOM_ITEM_BY_ID.has(id)) return prefs;
  const pinnedSet = new Set(prefs.pinned);
  if (pinnedSet.has(id)) pinnedSet.delete(id);
  else pinnedSet.add(id);
  return { order: prefs.order, pinned: prefs.order.filter((entry) => pinnedSet.has(entry)) };
}

// 把 id 移到 toIndex(移除自身之后的下标,越界会被夹到两端)。位置不变时返回
// 规范化后的原顺序,调用方可以按 order 逐项比较决定要不要写回。
export function moveSidebarExtension(value, id, toIndex) {
  const prefs = normalizeSidebarExtensionPrefs(value);
  const from = prefs.order.indexOf(id);
  if (from < 0 || !Number.isFinite(toIndex)) return prefs;
  const order = prefs.order.filter((entry) => entry !== id);
  const target = Math.max(0, Math.min(Math.floor(toIndex), order.length));
  order.splice(target, 0, id);
  const pinnedSet = new Set(prefs.pinned);
  return { order, pinned: order.filter((entry) => pinnedSet.has(entry)) };
}

// 拖拽中按指针 y 算落点:数一数「其它行」里有几行的中线在指针之上。
// rows 为除被拖行以外、按当前显示顺序排列的 {top, bottom}。
export function sidebarExtensionDropIndex(rows, pointerY) {
  if (!Array.isArray(rows)) return 0;
  let index = 0;
  for (const row of rows) {
    if (pointerY > (row.top + row.bottom) / 2) index += 1;
  }
  return index;
}

export const SIDEBAR_SECTION_IDS = Object.freeze({
  PINNED: 'pinned',
  TASKS: 'tasks',
  WORKSPACES: 'workspaces',
});

export const SIDEBAR_SECTION_LABELS = Object.freeze({
  [SIDEBAR_SECTION_IDS.PINNED]: '置顶任务',
  [SIDEBAR_SECTION_IDS.TASKS]: '任务',
  [SIDEBAR_SECTION_IDS.WORKSPACES]: '工作区',
});

export const DEFAULT_SIDEBAR_SECTION_EXPANSION = Object.freeze({
  [SIDEBAR_SECTION_IDS.PINNED]: true,
  [SIDEBAR_SECTION_IDS.TASKS]: true,
  [SIDEBAR_SECTION_IDS.WORKSPACES]: true,
});

export const SIDEBAR_DISCLOSURE_ICON = Object.freeze({
  name: 'expandDown',
  size: 18,
});

export function validateSidebarSectionExpansion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(SIDEBAR_SECTION_IDS).every((id) => typeof value[id] === 'boolean');
}

export function sidebarSectionCounts({
  pinnedSessions = [],
  noWorkspaceSessions = [],
  workspaces = [],
} = {}) {
  return {
    [SIDEBAR_SECTION_IDS.PINNED]: Array.isArray(pinnedSessions) ? pinnedSessions.length : 0,
    [SIDEBAR_SECTION_IDS.TASKS]: Array.isArray(noWorkspaceSessions) ? noWorkspaceSessions.length : 0,
    [SIDEBAR_SECTION_IDS.WORKSPACES]: Array.isArray(workspaces) ? workspaces.length : 0,
  };
}

export function sidebarSectionIsVisible(count) {
  return Number.isFinite(count) && count > 0;
}

export function sidebarSectionTitle(sectionId, count) {
  const label = SIDEBAR_SECTION_LABELS[sectionId] || '';
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  return `${label} (${safeCount})`;
}
