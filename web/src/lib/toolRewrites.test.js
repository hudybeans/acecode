import assert from 'node:assert/strict';
import {
  toolRewriteDraft,
  toolRewriteHasChanges,
  toolRewritePayload,
  toolRewriteRows,
  toolRewritesStore,
  validateToolRewriteDraft,
} from './toolRewrites.js';

const snapshot = {
  enabled: false,
  rewrites: { file_read: 'read', file_write: 'write', image_generate: 'draw' },
  defaults: { file_read: 'read', file_write: 'write', file_edit: 'edit', TodoWrite: 'todowrite' },
  tools: [
    { name: 'bash', description: 'Run a shell command', read_only: false },
    { name: 'file_read', description: 'Read a file', read_only: true },
    { name: 'file_write', description: 'Write a file', read_only: false },
  ],
  path: 'C:/data/tool-rewrites.json',
};

// 草稿:enabled + rewrites 逐字复制,非字符串目标归空。
const draft = toolRewriteDraft({ ...snapshot, rewrites: { ...snapshot.rewrites, bash: 7 } });
assert.equal(draft.enabled, false);
assert.equal(draft.rewrites.file_read, 'read');
assert.equal(draft.rewrites.bash, '');

// 左列 = 快照 tools 顺序;快照里有重写但未注册的工具(image_generate)追加在尾部并标 registered=false。
const rows = toolRewriteRows(snapshot, draft);
assert.deepEqual(rows.map((row) => row.name), ['bash', 'file_read', 'file_write', 'image_generate']);
assert.equal(rows[1].value, 'read');
assert.equal(rows[1].defaultValue, 'read');
assert.equal(rows[1].readOnly, true);
assert.equal(rows[0].value, '');
assert.equal(rows[3].registered, false);
assert.equal(rows[3].value, 'draw');

// payload:空值 / 与原名相同 的条目不发;两端空白去掉。
assert.deepEqual(
  toolRewritePayload({ enabled: true, rewrites: { file_read: ' peek ', bash: '', file_write: 'file_write' } }),
  { enabled: true, rewrites: { file_read: 'peek' } },
);

// 校验:非法字符 / 撞真实工具名 / 撞另一条重写的原名 / 两条重写同名。
assert.deepEqual(validateToolRewriteDraft({ enabled: true, rewrites: { file_read: 'peek' } }, snapshot), {});
assert.ok(validateToolRewriteDraft({ enabled: true, rewrites: { file_read: 'pe ek' } }, snapshot).file_read);
assert.ok(validateToolRewriteDraft({ enabled: true, rewrites: { file_read: 'bash' } }, snapshot).file_read);
assert.ok(validateToolRewriteDraft({ enabled: true, rewrites: { file_read: 'file_write', file_write: 'w' } }, snapshot).file_read);
const duplicate = validateToolRewriteDraft({ enabled: true, rewrites: { file_read: 'x', file_write: 'x' } }, snapshot);
assert.ok(duplicate.file_read && duplicate.file_write);

// 变更判定:enabled 翻转、改值、清空都算;仅空白差异不算。
assert.equal(toolRewriteHasChanges(toolRewriteDraft(snapshot), snapshot), false);
assert.equal(toolRewriteHasChanges({ ...toolRewriteDraft(snapshot), enabled: true }, snapshot), true);
assert.equal(toolRewriteHasChanges({ enabled: false, rewrites: { ...snapshot.rewrites, file_read: 'read ' } }, snapshot), false);
assert.equal(toolRewriteHasChanges({ enabled: false, rewrites: { ...snapshot.rewrites, file_read: '' } }, snapshot), true);

// store:load → 开关立即写 → 输入期间的写入串行化,写回期间继续编辑的字段不被服务端回显覆盖。
const tick = () => new Promise((resolve) => setImmediate(resolve));
let saved = structuredClone(snapshot);
const writes = [];
let finishWrite = null;
const client = {
  base: 'http://127.0.0.1:1',
  getToolRewrites: async () => structuredClone(saved),
  setToolRewrites: (payload) => new Promise((resolve) => {
    writes.push(structuredClone(payload));
    finishWrite = () => {
      saved = { ...saved, enabled: payload.enabled, rewrites: { ...payload.rewrites } };
      resolve(structuredClone(saved));
    };
  }),
};
const store = toolRewritesStore(client);
assert.equal(toolRewritesStore(client), store, 'store is a per-connection singleton');
await store.load();
assert.equal(store.getSnapshot().draft.enabled, false);
assert.equal(store.getSnapshot().loading, false);

store.setEnabled(true);
const firstFlush = store.flush();
await tick();
assert.equal(writes.length, 1);
assert.deepEqual(writes[0], { enabled: true, rewrites: { file_read: 'read', file_write: 'write', image_generate: 'draw' } });

// 写回未完成时用户继续改 file_read:回显后草稿要保留 peek,而不是服务端的 read。
store.setRewrite('file_read', 'peek');
finishWrite();
await firstFlush;
assert.equal(store.getSnapshot().snapshot.enabled, true);
assert.equal(store.getSnapshot().draft.rewrites.file_read, 'peek');
assert.equal(store.getSnapshot().draft.enabled, true);

// 非法草稿不发请求,报 BAD_REQUEST。
store.setRewrite('file_read', 'bash');
assert.equal(await store.flush(), false);
assert.equal(writes.length, 1);
assert.equal(store.getSnapshot().error.code, 'BAD_REQUEST');

// 恢复默认:草稿换成 defaults。
store.resetToDefaults();
assert.deepEqual(store.getSnapshot().draft.rewrites, snapshot.defaults);
const resetFlush = store.flush();
await tick();
assert.deepEqual(writes[1], { enabled: true, rewrites: snapshot.defaults });
finishWrite();
assert.equal(await resetFlush, true);

// 404 → 后端不支持的稳定错误码。
const legacy = toolRewritesStore({ base: 'http://127.0.0.1:2', getToolRewrites: async () => { const e = new Error('nf'); e.status = 404; throw e; } });
await legacy.load();
assert.equal(legacy.getSnapshot().error.code, 'TOOL_REWRITES_UNSUPPORTED');

console.log('toolRewrites tests passed');
