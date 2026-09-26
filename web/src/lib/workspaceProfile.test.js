import assert from 'node:assert/strict';
import {
  addWorkspaceFolder,
  canSaveWorkspaceProfile,
  createWorkspaceProfileDraft,
  removeWorkspaceFolder,
  workspaceFolderKey,
  workspaceFolderName,
  workspaceProfileSavePayload,
} from './workspaceProfile.js';

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (err) {
    console.error(`[fail] ${name}`);
    throw err;
  }
}

// 场景:打开从未编辑过的项目(后端 icon 为 null、没有 extra_folders)。
// 期望:草稿带默认文件夹图标 + 默认色,附加文件夹为空,名称原样。
test('新项目的编辑草稿使用默认图标与空附加文件夹', () => {
  const draft = createWorkspaceProfileDraft({ hash: 'h', cwd: 'C:/repo/acecode', name: 'acecode', icon: null });
  assert.deepEqual(draft, {
    name: 'acecode',
    icon: { id: 'folder', color: 'default' },
    extraFolders: [],
  });
});

// 场景:workspace.json 里存了已知图标 + 已删除的颜色键(手改 / 旧版本)。
// 期望:图标保留,颜色退回默认,而不是渲染一个不存在的颜色。
test('草稿对未知颜色回退默认色', () => {
  const draft = createWorkspaceProfileDraft({ icon: { id: 'music', color: 'teal' }, extra_folders: ['D:/libs', ''] });
  assert.deepEqual(draft.icon, { id: 'music', color: 'default' });
  assert.deepEqual(draft.extraFolders, ['D:/libs']);
});

// 场景:用户选了主文件夹本身,或重复选同一目录(大小写 / 斜杠形态不同)。
// 期望:静默不重复添加(与后端去重口径一致),原数组引用不变。
test('添加文件夹忽略主文件夹与重复项', () => {
  const extras = ['D:/Shared/Lib'];
  assert.equal(addWorkspaceFolder(extras, 'C:/repo', 'C:\\repo\\'), extras);
  assert.equal(addWorkspaceFolder(extras, 'C:/repo', 'd:\\shared\\lib'), extras);
  assert.deepEqual(addWorkspaceFolder(extras, 'C:/repo', 'E:/docs'), ['D:/Shared/Lib', 'E:/docs']);
});

// 场景:POSIX 路径大小写敏感。期望:/a/Lib 与 /a/lib 视为两个不同的文件夹。
test('POSIX 路径去重区分大小写', () => {
  assert.notEqual(workspaceFolderKey('/a/Lib'), workspaceFolderKey('/a/lib'));
  assert.deepEqual(addWorkspaceFolder(['/a/Lib'], '/repo', '/a/lib'), ['/a/Lib', '/a/lib']);
});

// 场景:点击附加文件夹行的 ×。期望:只移除该项,按规范化键匹配。
test('移除附加文件夹按规范化键匹配', () => {
  assert.deepEqual(removeWorkspaceFolder(['D:/a', 'E:/b'], 'd:\\a\\'), ['E:/b']);
});

// 场景:文件夹行显示名。期望:取最后一段,容忍尾部分隔符;盘符根显示盘符。
test('文件夹显示名取路径最后一段', () => {
  assert.equal(workspaceFolderName('C:/Users/shao/acecode'), 'acecode');
  assert.equal(workspaceFolderName('D:\\work\\lib\\'), 'lib');
  assert.equal(workspaceFolderName('/home/me/proj/'), 'proj');
  assert.equal(workspaceFolderName('E:/'), 'E:');
});

// 场景:名称被清空。期望:不能保存(「保存」按钮禁用)。
test('名称为空时不能保存', () => {
  assert.equal(canSaveWorkspaceProfile({ name: '   ' }), false);
  assert.equal(canSaveWorkspaceProfile({ name: 'x' }), true);
});

// 场景:保存。期望:名称去首尾空白;默认图标 + 默认色发 null(= 未设置,侧栏保留
// 展开 / 折叠两态图标);其它图标原样发 {id, color};附加文件夹整体发送。
test('保存载荷对默认图标发 null', () => {
  assert.deepEqual(workspaceProfileSavePayload({
    name: '  acecode ',
    icon: { id: 'folder', color: 'default' },
    extraFolders: ['D:/libs'],
  }), { name: 'acecode', icon: null, extra_folders: ['D:/libs'] });
  assert.deepEqual(workspaceProfileSavePayload({
    name: 'acecode',
    icon: { id: 'folder', color: 'blue' },
    extraFolders: [],
  }).icon, { id: 'folder', color: 'blue' });
});
