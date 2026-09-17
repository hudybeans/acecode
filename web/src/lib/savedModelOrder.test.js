import assert from 'node:assert/strict';
import { filterSavedModels } from './modelManager.js';
import { reorderSavedModels, savedModelDropTarget } from './savedModelOrder.js';

const models = ['alpha', 'hidden', 'beta', 'gamma'].map((name) => ({
  name, provider: 'copilot', model: name, api_key: `key-${name}`,
}));
const names = (list) => list.map((model) => model.name);

// 上下移动及首尾落点保留同一模型对象，隐藏项不丢失。
assert.deepEqual(names(reorderSavedModels(models, 'gamma', 'alpha', 'before')),
  ['gamma', 'alpha', 'hidden', 'beta']);
const downward = reorderSavedModels(models, 'alpha', 'gamma', 'after');
assert.deepEqual(names(downward), ['hidden', 'beta', 'gamma', 'alpha']);
assert.equal(downward[3], models[0]);
const filtered = filterSavedModels(models, 'a');
assert.deepEqual(names(filtered), ['alpha', 'beta', 'gamma']);
const moved = reorderSavedModels(models, filtered[0].name, filtered[1].name, 'after');
assert.deepEqual(names(moved), ['hidden', 'beta', 'alpha', 'gamma']);
assert.deepEqual(names(models), ['alpha', 'hidden', 'beta', 'gamma']);

// 相同位置、相邻等价落点、无效名称不会产生新顺序。
assert.equal(reorderSavedModels(models, 'alpha', 'alpha', 'before'), models);
assert.equal(reorderSavedModels(models, 'alpha', 'hidden', 'before'), models);
assert.equal(reorderSavedModels(models, 'beta', 'hidden', 'after'), models);
assert.equal(reorderSavedModels(models, 'absent', 'alpha'), models);
assert.equal(reorderSavedModels(models, 'alpha', 'absent'), models);
assert.equal(reorderSavedModels(models, 'alpha', 'beta', 'invalid'), models);
assert.equal(reorderSavedModels([], 'alpha', 'beta').length, 0);

// 行中点和间隙产生稳定落点，列表外松手不能提交。
const rows = [{ name: 'alpha', top: 20, bottom: 60 }, { name: 'beta', top: 68, bottom: 108 }];
const bounds = { left: 10, right: 310, top: 20, bottom: 108 };
assert.deepEqual(savedModelDropTarget(rows, bounds, 50, 21), { name: 'alpha', placement: 'before' });
assert.deepEqual(savedModelDropTarget(rows, bounds, 50, 64), { name: 'beta', placement: 'before' });
assert.deepEqual(savedModelDropTarget(rows, bounds, 50, 99), { name: 'beta', placement: 'after' });
for (const [x, y] of [[9, 30], [311, 30], [50, 19], [50, 109]]) {
  assert.equal(savedModelDropTarget(rows, bounds, x, y), null);
}
assert.equal(savedModelDropTarget([], bounds, 50, 30), null);
console.log('[pass] saved model ordering, filtered moves, identity, no-ops, and pointer targets');
