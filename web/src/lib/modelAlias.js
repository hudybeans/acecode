// 模型别名(saved_models 里的 name)的生成规则,纯字符串逻辑,无组件依赖。
//
// 别名有两种来源:用户手填,或按当前选择自动生成。自动生成的值会记在
// draft._auto_alias 上(见 modelSettings.js::syncAutoModelAlias),只有当别名
// 仍等于上一次自动值(或为空)时才跟着选择刷新 —— 用户手改过就不再覆盖。
//
// 规则:
//   - 单选:别名 = 模型 ID;与已保存条目撞名时追加 (1)、(2)…
//   - 多选:别名输入框退化为「前缀」,默认 = 厂商名;保存时每条 = <前缀>-<模型 ID>,
//     逐条同样去重。
//
// 后缀刻意写成 name(1) 不带空格:TUI 的 /model rm|edit <name> 按空白切第一个
// token 当名字,带空格的名字在那里会被截断。
// 别名不再经过 slug 清洗(旧 modelNameSlug 会把 `(`、空格洗成 `-`,`(1)` 活不下来);
// 后端只要求非空且不以 `(` 开头。

function trimmed(value) {
  return String(value ?? '').trim();
}

// 接受数组或 Set(expandModelAliases 内部逐条累加时传的是 Set)。
function occupiedSet(names) {
  const occupied = new Set();
  const iterable = names && typeof names[Symbol.iterator] === 'function' && typeof names !== 'string'
    ? names
    : [];
  for (const name of iterable) {
    const normalized = trimmed(name);
    if (normalized) occupied.add(normalized);
  }
  return occupied;
}

// 在 occupiedNames 里找一个不撞名的别名:base → base(1) → base(2) …
// base 为空直接返回空串,由调用方决定回退。
export function uniqueModelAlias(base, occupiedNames = []) {
  const normalized = trimmed(base);
  if (!normalized) return '';
  const occupied = occupiedSet(occupiedNames);
  if (!occupied.has(normalized)) return normalized;
  let suffix = 1;
  while (occupied.has(`${normalized}(${suffix})`)) suffix += 1;
  return `${normalized}(${suffix})`;
}

// 当前选择对应的自动别名(输入框里显示的值)。
//   0 个模型 → ''
//   1 个模型 → 去重后的模型 ID
//   多个模型 → 厂商名(作为前缀)
export function autoModelAliasForSelection(modelIds, { providerName = '', existingNames = [] } = {}) {
  const ids = Array.isArray(modelIds) ? modelIds.map(trimmed).filter(Boolean) : [];
  if (ids.length === 0) return '';
  if (ids.length === 1) return uniqueModelAlias(ids[0], existingNames);
  return trimmed(providerName);
}

// 把别名输入框的值展开成每个模型各自的保存名。
//   单选:alias 原样(用户明确填的名字撞名时交给后端 NAME_TAKEN → 覆盖/另存为流程,
//         不在这里偷偷改名);alias 为空回退模型 ID 并去重。
//   多选:`${alias}-${模型 ID}`(alias 为空时只用模型 ID),每条都是派生名,
//         对 existingNames ∪ 本批已生成的名字去重,保证同一批内不重名。
export function expandModelAliases(alias, modelIds, { existingNames = [] } = {}) {
  const ids = Array.isArray(modelIds) ? modelIds.map(trimmed).filter(Boolean) : [];
  if (ids.length === 0) return [];
  const prefix = trimmed(alias);
  if (ids.length === 1) {
    return [prefix || uniqueModelAlias(ids[0], existingNames)];
  }
  const occupied = occupiedSet(existingNames);
  const names = [];
  for (const id of ids) {
    const name = uniqueModelAlias(prefix ? `${prefix}-${id}` : id, occupied);
    occupied.add(name);
    names.push(name);
  }
  return names;
}
