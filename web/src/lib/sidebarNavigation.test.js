import assert from 'node:assert/strict';
import {
  DEFAULT_SIDEBAR_SECTION_EXPANSION,
  DEFAULT_SIDEBAR_EXTENSION_PREFS,
  SIDEBAR_CUSTOM_ITEMS,
  SIDEBAR_DISCLOSURE_ICON,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_SECTION_IDS,
  SIDEBAR_SECTION_LABELS,
  sidebarSectionCounts,
  sidebarSectionIsVisible,
  sidebarSectionTitle,
  sidebarExtensionDropIndex,
  sidebarExtensionLayout,
  moveSidebarExtension,
  normalizeSidebarExtensionPrefs,
  toggleSidebarExtensionPinned,
  validateSidebarExtensionPrefs,
  validateSidebarSectionExpansion,
} from './sidebarNavigation.js';

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

test('sidebar fixed navigation keeps the confirmed order and callbacks', () => {
  assert.deepEqual(SIDEBAR_NAV_ITEMS, [
    { id: 'new-task', label: '新建任务', icon: 'newSession', callback: 'onNewTask' },
    { id: 'new-loop', label: '定时任务', icon: 'alarm', callback: 'onNewLoop' },
    { id: 'extensions', label: '扩展', icon: 'extension', action: 'extensions' },
  ]);
});

test('sidebar custom settings keep the restored order', () => {
  assert.deepEqual(SIDEBAR_CUSTOM_ITEMS, [
    { id: 'models', label: '模型', icon: 'brain', settingsSection: 'models' },
    { id: 'mcp', label: 'MCP 服务器', icon: 'mcp', settingsSection: 'mcp' },
    { id: 'skills', label: '技能', icon: 'lightbulb', settingsSection: 'skills' },
    { id: 'experts', label: '专家组件', icon: 'expert', action: 'experts' },
  ]);
});

// 场景:首次使用 / 存储为空。期望:全部条目按默认顺序出现在「扩展」弹出菜单里,
// 侧栏上不额外固定任何条目。
test('extension prefs default to every item in the popup menu', () => {
  assert.deepEqual(DEFAULT_SIDEBAR_EXTENSION_PREFS, { order: ['models', 'mcp', 'skills', 'experts'], pinned: [] });
  const layout = sidebarExtensionLayout(DEFAULT_SIDEBAR_EXTENSION_PREFS);
  assert.deepEqual(layout.menu.map((item) => item.id), ['models', 'mcp', 'skills', 'experts']);
  assert.deepEqual(layout.pinned, []);
  assert.deepEqual(layout.entries.map((entry) => entry.pinned), [false, false, false, false]);
});

// 场景:localStorage 里是旧版本 / 被手改过的数据(未知 id、重复 id、缺条目、非数组)。
// 期望:未知与重复被丢弃,缺失条目按默认顺序追加到末尾,pinned 顺序跟随 order;
// 结构不对时整体回退默认,弹出菜单不会因此缺项或崩溃。
test('extension prefs normalize stale or malformed storage', () => {
  assert.deepEqual(
    normalizeSidebarExtensionPrefs({ order: ['skills', 'ghost', 'skills', 'models'], pinned: ['models', 'ghost', 'skills'] }),
    { order: ['skills', 'models', 'mcp', 'experts'], pinned: ['skills', 'models'] },
  );
  assert.deepEqual(normalizeSidebarExtensionPrefs(null), { order: ['models', 'mcp', 'skills', 'experts'], pinned: [] });
  assert.deepEqual(normalizeSidebarExtensionPrefs({ order: 'x', pinned: [] }), { order: ['models', 'mcp', 'skills', 'experts'], pinned: [] });
  assert.equal(validateSidebarExtensionPrefs({ order: [], pinned: [] }), true);
  assert.equal(validateSidebarExtensionPrefs({ order: [] }), false);
  assert.equal(validateSidebarExtensionPrefs([]), false);
});

// 场景:在「自定义」对话框里勾选 / 取消勾选。期望:勾选的条目从弹出菜单移到侧栏
// 主导航,两边都保持用户排定的相对顺序;再次点击恢复原状。
test('toggling an extension moves it between the sidebar and the popup menu', () => {
  const pinnedSkills = toggleSidebarExtensionPinned(DEFAULT_SIDEBAR_EXTENSION_PREFS, 'skills');
  assert.deepEqual(pinnedSkills.pinned, ['skills']);
  let layout = sidebarExtensionLayout(pinnedSkills);
  assert.deepEqual(layout.pinned.map((item) => item.id), ['skills']);
  assert.deepEqual(layout.menu.map((item) => item.id), ['models', 'mcp', 'experts']);
  const both = toggleSidebarExtensionPinned(pinnedSkills, 'models');
  assert.deepEqual(both.pinned, ['models', 'skills']);
  layout = sidebarExtensionLayout(toggleSidebarExtensionPinned(both, 'skills'));
  assert.deepEqual(layout.pinned.map((item) => item.id), ['models']);
  assert.deepEqual(toggleSidebarExtensionPinned(both, 'ghost'), both);
});

// 场景:拖拽排序。期望:toIndex 是移除自身之后的下标,越界夹到两端;
// 被固定条目的顺序同步跟随新 order。
test('moving an extension reorders both the menu and pinned items', () => {
  const prefs = { order: ['models', 'mcp', 'skills', 'experts'], pinned: ['models', 'experts'] };
  assert.deepEqual(moveSidebarExtension(prefs, 'experts', 0), {
    order: ['experts', 'models', 'mcp', 'skills'], pinned: ['experts', 'models'],
  });
  assert.deepEqual(moveSidebarExtension(prefs, 'models', 99).order, ['mcp', 'skills', 'experts', 'models']);
  assert.deepEqual(moveSidebarExtension(prefs, 'models', -3).order, ['models', 'mcp', 'skills', 'experts']);
  assert.deepEqual(moveSidebarExtension(prefs, 'ghost', 1), prefs);
});

// 场景:拖动时计算落点。rows 是除被拖行以外的其它行;指针越过某行中线才算排到它后面,
// 这样行与行之间不会在边界上来回抖动。
test('drop index counts the other rows whose midpoint is above the pointer', () => {
  const rows = [{ top: 0, bottom: 32 }, { top: 32, bottom: 64 }, { top: 64, bottom: 96 }];
  assert.equal(sidebarExtensionDropIndex(rows, -10), 0);
  assert.equal(sidebarExtensionDropIndex(rows, 15), 0);
  assert.equal(sidebarExtensionDropIndex(rows, 17), 1);
  assert.equal(sidebarExtensionDropIndex(rows, 60), 2);
  assert.equal(sidebarExtensionDropIndex(rows, 200), 3);
  assert.equal(sidebarExtensionDropIndex(null, 20), 0);
});

test('sidebar sections use confirmed labels and default expanded state', () => {
  assert.deepEqual(SIDEBAR_SECTION_LABELS, {
    pinned: '置顶',
    tasks: '任务',
    workspaces: '工作区',
  });
  assert.deepEqual(DEFAULT_SIDEBAR_SECTION_EXPANSION, {
    pinned: true,
    tasks: true,
    workspaces: true,
  });
  assert.equal(validateSidebarSectionExpansion(DEFAULT_SIDEBAR_SECTION_EXPANSION), true);
  assert.equal(validateSidebarSectionExpansion({ pinned: true, tasks: true }), false);
  assert.equal(validateSidebarSectionExpansion({ pinned: true, tasks: true, workspaces: 'yes' }), false);
});

test('sidebar section counts separate pinned tasks, no-workspace tasks, and workspaces', () => {
  const counts = sidebarSectionCounts({
    pinnedSessions: [{ id: 'p1' }, { id: 'p2' }],
    noWorkspaceSessions: [{ id: 'n1' }],
    workspaces: [{ hash: 'w1' }, { hash: 'w2' }, { hash: 'w3' }],
  });
  assert.deepEqual(counts, { pinned: 2, tasks: 1, workspaces: 3 });
  assert.equal(sidebarSectionTitle(SIDEBAR_SECTION_IDS.PINNED, counts.pinned), '置顶 (2)');
  assert.equal(sidebarSectionTitle(SIDEBAR_SECTION_IDS.TASKS, counts.tasks), '任务 (1)');
  assert.equal(sidebarSectionTitle(SIDEBAR_SECTION_IDS.WORKSPACES, counts.workspaces), '工作区 (3)');
  assert.deepEqual(sidebarSectionCounts(), { pinned: 0, tasks: 0, workspaces: 0 });
});

test('sidebar sections render only when their count is positive', () => {
  assert.equal(sidebarSectionIsVisible(0), false);
  assert.equal(sidebarSectionIsVisible(-1), false);
  assert.equal(sidebarSectionIsVisible(Number.NaN), false);
  assert.equal(sidebarSectionIsVisible(undefined), false);
  assert.equal(sidebarSectionIsVisible(1), true);
  assert.equal(sidebarSectionIsVisible(400), true);
});

test('sidebar disclosure uses the shared rounded chevron at the existing size', () => {
  assert.deepEqual(SIDEBAR_DISCLOSURE_ICON, {
    name: 'expandDown',
    size: 18,
  });
});
