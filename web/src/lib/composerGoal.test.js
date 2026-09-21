import assert from 'node:assert/strict';
import { composerContentFromText, composerContentText } from './composerContent.js';
import { inputRouteForText } from './builtinCommandRouting.js';
import { projectComposerGoal, serializeComposerGoal } from './composerGoal.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }

run('goal projection requires a confirmed command boundary', () => {
  for (const text of ['', '/go', '/goal', '/goal继续输入', '/goalkeeper ', '说明 /goal 内容']) {
    const projection = projectComposerGoal(text, composerContentFromText(text));
    assert.equal(projection.goalMode, false);
    assert.equal(projection.text, text);
  }
  for (const separator of [' ', '\t', '\n']) {
    const projection = projectComposerGoal(`/goal${separator}完成目标`);
    assert.equal(projection.goalMode, true);
    assert.equal(projection.text, '完成目标');
    assert.equal(projection.prefixLength, 6);
  }
});

run('goal round trips preserve structured references and attachments', () => {
  const body = { version: 1, parts: [
    { type: 'attachment', key: 'image-1', id: 'image-1', kind: 'image', name: '参考.png' },
    { type: 'text', text: '修复 ' },
    { type: 'path', path: 'src/main.cpp', token: '@src/main.cpp' },
    { type: 'text', text: ' 使用 ' },
    { type: 'skill', name: 'review', path: '/skills/review/SKILL.md', token: '$review' },
  ] };
  const text = composerContentText(body);
  const stored = serializeComposerGoal(text, body, true);
  assert.equal(stored.text, `/goal ${text}`);
  assert.equal(composerContentText(stored.content), stored.text);
  const restored = projectComposerGoal(stored.text, stored.content);
  assert.equal(restored.text, text);
  assert.deepEqual(restored.content, body);
  const cancelled = serializeComposerGoal(restored.text, restored.content, false);
  assert.equal(cancelled.text, text);
  assert.deepEqual(cancelled.content, body);
  assert.deepEqual(projectComposerGoal(stored.text, stored.content), restored);
});

run('image-first legacy drafts and empty goal drafts retain their meaning', () => {
  const content = composerContentFromText('/goal  下一步\n保留换行', [{ id: 'file-1', name: '说明.txt' }]);
  const projection = projectComposerGoal(composerContentText(content), content);
  assert.equal(projection.text, ' 下一步\n保留换行');
  assert.equal(projection.content.parts[0].id, 'file-1');
  const empty = serializeComposerGoal('', null, true);
  assert.equal(projectComposerGoal(empty.text, empty.content).text, '');
  assert.equal(inputRouteForText(empty.text).command.command, 'goal');
});

run('goal submission retains budget and subcommand routing without duplicate prefixes', () => {
  for (const body of ['完成修复', '--tokens 50K 完成重构', 'pause', 'resume', 'clear']) {
    const stored = serializeComposerGoal(body, null, true);
    const restored = projectComposerGoal(stored.text, stored.content);
    const submitted = serializeComposerGoal(restored.text, restored.content, restored.goalMode);
    assert.equal(submitted.text, `/goal ${body}`);
    assert.equal(inputRouteForText(submitted.text).command.args, body);
  }
  assert.equal(projectComposerGoal('普通草稿', null).goalMode, false);
  assert.equal(projectComposerGoal('', null).goalMode, false);
});
