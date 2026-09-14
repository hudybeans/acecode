// web/src/lib/modelAlias.test.js —— 模型别名(saved_models.name)生成规则的纯函数测试。
import assert from 'node:assert/strict';
import {
  autoModelAliasForSelection,
  expandModelAliases,
  uniqueModelAlias,
} from './modelAlias.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// 场景:别名与已保存条目撞名 → 追加 (1);(1) 也被占就 (2)……取最小可用序号。
// 后缀刻意不带空格(name(1) 而不是 name (1)):TUI 的 /model rm|edit <name>
// 按空白切第一个 token 当名字,带空格的名字在那里会被截断。
run('uniqueModelAlias 撞名追加 (N) 且取最小可用序号', () => {
  assert.equal(uniqueModelAlias('gpt-4o', []), 'gpt-4o');
  assert.equal(uniqueModelAlias('gpt-4o', ['gpt-4o']), 'gpt-4o(1)');
  assert.equal(uniqueModelAlias('gpt-4o', ['gpt-4o', 'gpt-4o(1)', 'gpt-4o(3)']), 'gpt-4o(2)');
  assert.equal(uniqueModelAlias('gpt-4o', ['gpt-4o(1)']), 'gpt-4o', '基名本身没被占就不加后缀');
});

// 场景:比较前两侧都 trim,已有名字里的空白噪声不影响判定;空 base 直接返回空串由调用方回退。
run('uniqueModelAlias 忽略首尾空白并对空 base 返回空串', () => {
  assert.equal(uniqueModelAlias('  luna  ', [' luna ']), 'luna(1)');
  assert.equal(uniqueModelAlias('', ['x']), '');
  assert.equal(uniqueModelAlias(null, ['x']), '');
});

// 场景:内部逐条累加时传的是 Set,不能只认数组(曾经因此多选批内去重完全失效)。
run('uniqueModelAlias 接受 Set 形式的已占用名字', () => {
  assert.equal(uniqueModelAlias('b', new Set(['a', 'b'])), 'b(1)');
});

// 场景:别名输入框里显示的自动值。
//   0 个模型 → ''(切 Provider 后选择被清空时别名跟着清空)
//   1 个模型 → 模型 ID,撞已有名字追加 (N)
//   多个模型 → 厂商名(此时输入框语义是「前缀」)
run('autoModelAliasForSelection 按选中数量返回空 / 模型 ID / 厂商名前缀', () => {
  const options = { providerName: 'ACEModel', existingNames: ['acemodel-image'] };
  assert.equal(autoModelAliasForSelection([], options), '');
  assert.equal(autoModelAliasForSelection(['acemodel-image'], options), 'acemodel-image(1)');
  assert.equal(autoModelAliasForSelection(['acemodel-image-2k'], options), 'acemodel-image-2k');
  assert.equal(
    autoModelAliasForSelection(['acemodel-image', 'acemodel-image-2k'], options),
    'ACEModel',
  );
  assert.equal(
    autoModelAliasForSelection(['a', 'b'], { providerName: '', existingNames: [] }),
    '',
    '自定义兼容 API 没有厂商名时前缀为空',
  );
});

// 场景:单选展开。用户明确填的别名原样透传(撞名交给后端 NAME_TAKEN 的覆盖/另存为流程,
// 不能替用户偷偷改名);留空才回退模型 ID 并去重。
run('expandModelAliases 单选:手填原样、留空回退模型 ID 并去重', () => {
  assert.deepEqual(expandModelAliases('mine', ['gpt-4o'], { existingNames: ['mine'] }), ['mine']);
  assert.deepEqual(expandModelAliases('', ['gpt-4o'], { existingNames: ['gpt-4o'] }), ['gpt-4o(1)']);
  assert.deepEqual(expandModelAliases('  ', ['vendor/m.v1'], {}), ['vendor/m.v1'], '模型 ID 不做 slug 清洗');
});

// 场景:多选展开。每条 = <前缀>-<模型 ID>;前缀为空只用模型 ID;
// 既对已保存条目去重,也对同一批内先生成的名字去重。
// 回归:旧实现是「第一个被勾选模型的显示名」当前缀 → <首个模型名>-<其他模型 ID>。
run('expandModelAliases 多选:前缀-模型 ID,对已有与批内重名都追加 (N)', () => {
  assert.deepEqual(
    expandModelAliases('ACEModel', ['acemodel-image', 'acemodel-image-2k'], {
      existingNames: ['ACEModel-acemodel-image'],
    }),
    ['ACEModel-acemodel-image(1)', 'ACEModel-acemodel-image-2k'],
  );
  assert.deepEqual(
    expandModelAliases('', ['a', 'b'], { existingNames: ['b', 'b(1)'] }),
    ['a', 'b(2)'],
  );
  // 批内去重:第二个模型的派生名恰好等于第一个 → 第二个追加 (1)
  assert.deepEqual(
    expandModelAliases('p', ['x', 'x(1)'], { existingNames: ['p-x(1)'] }),
    ['p-x', 'p-x(1)(1)'],
  );
});

// 场景:没有模型时展开为空数组;模型列表里的空白项被丢弃。
run('expandModelAliases 空选择返回空数组并忽略空白模型 ID', () => {
  assert.deepEqual(expandModelAliases('x', [], {}), []);
  assert.deepEqual(expandModelAliases('x', ['', '  '], {}), []);
  assert.deepEqual(expandModelAliases('', [' a ', ''], {}), ['a']);
});
