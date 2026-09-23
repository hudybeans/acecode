import assert from 'node:assert/strict';
import {
  WORKSPACE_ICONS,
  WORKSPACE_ICON_COLORS,
  filterWorkspaceIcons,
  isDefaultWorkspaceIcon,
  resolveWorkspaceIcon,
  workspaceIconColorValue,
} from './workspaceIcons.js';

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (err) {
    console.error(`[fail] ${name}`);
    throw err;
  }
}

// 场景:图标表与色板是写进 workspace.json 的键。期望:与后端 is_valid_workspace_icon
// 的字符集一致(id [a-z0-9-]{1,40},color [a-z0-9-]{0,24}),且 id 不重复 —— 否则
// 前端选得出、后端存不进(400)。图二的 30 个图标与 8 个颜色都在。
test('图标与颜色键满足后端字符集约束', () => {
  assert.equal(WORKSPACE_ICONS.length, 30);
  assert.equal(WORKSPACE_ICON_COLORS.length, 8);
  const ids = new Set();
  for (const icon of WORKSPACE_ICONS) {
    assert.match(icon.id, /^[a-z0-9-]{1,40}$/);
    assert.equal(ids.has(icon.id), false, `duplicate icon id ${icon.id}`);
    ids.add(icon.id);
    assert.ok(icon.body.startsWith('<'), `icon ${icon.id} has svg body`);
  }
  for (const color of WORKSPACE_ICON_COLORS) {
    assert.match(color.id, /^[a-z0-9-]{0,24}$/);
  }
  assert.equal(WORKSPACE_ICONS[0].id, 'folder');
  assert.equal(WORKSPACE_ICON_COLORS[0].id, 'default');
});

// 场景:后端返回 icon 为 null / 未知 id / 未知颜色。期望:null 与未知 id 视为未设置;
// 未知颜色退回默认色;默认色取文字颜色(空值)。
test('解析后端图标字段', () => {
  assert.equal(resolveWorkspaceIcon(null), null);
  assert.equal(resolveWorkspaceIcon({ id: 'rocket', color: 'red' }), null);
  assert.deepEqual(resolveWorkspaceIcon({ id: 'brain', color: 'violet' }), { id: 'brain', color: 'default' });
  assert.equal(workspaceIconColorValue('default'), '');
  assert.equal(workspaceIconColorValue('nope'), '');
  assert.equal(workspaceIconColorValue('blue'), '#0a84ff');
});

// 场景:判断是否等价于「未设置」。期望:只有文件夹 + 默认色才是;换色或换图都不是。
test('默认图标判定', () => {
  assert.equal(isDefaultWorkspaceIcon(null), true);
  assert.equal(isDefaultWorkspaceIcon({ id: 'folder', color: 'default' }), true);
  assert.equal(isDefaultWorkspaceIcon({ id: 'folder', color: 'red' }), false);
  assert.equal(isDefaultWorkspaceIcon({ id: 'music', color: 'default' }), false);
});

// 场景:搜索框输入。期望:空查询返回全部;按中文名、英文关键词不区分大小写匹配;
// 多个词须全部命中。
test('搜索图标按名称与关键词过滤', () => {
  assert.equal(filterWorkspaceIcons('').length, WORKSPACE_ICONS.length);
  assert.deepEqual(filterWorkspaceIcons('音乐').map((icon) => icon.id), ['music']);
  assert.deepEqual(filterWorkspaceIcons('TERMINAL').map((icon) => icon.id), ['terminal']);
  assert.deepEqual(filterWorkspaceIcons('fitness gym').map((icon) => icon.id), ['dumbbell']);
  assert.deepEqual(filterWorkspaceIcons('zzz-not-found'), []);
});
