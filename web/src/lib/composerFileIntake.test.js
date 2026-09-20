import assert from 'node:assert/strict';
import { resolveComposerFileIntake } from './composerFileIntake.js';
import { markFileSourcePath } from './composerFileTransfer.js';

const item = path => ({ kind: 'file', path, name: path.split(/[\\/]/).pop(), reference_only: true, size_bytes: 1 });
const win = {
  __ACECODE_DESKTOP_SHELL__: true,
  __ACECODE_OS__: 'windows',
  aceDesktop_materializeContextItems: async paths => ({ ok: true, items: paths.map(item) }),
};
const file = new File(['file'], 'notes.txt');
for (const source of ['drop', 'paste', 'picker']) {
  const result = await resolveComposerFileIntake({ source, files: [file] }, {});
  assert.deepEqual(result, { kind: 'upload', files: [file] });
}
console.log('[pass] browser file intake uses the same upload contract for all entries');

const copied = { ...win, aceDesktop_readClipboardContextItems: async () => ({ ok: true, items: [item('C:/work/notes.txt')] }) };
assert.deepEqual(
  await resolveComposerFileIntake({ source: 'paste', files: [file] }, copied),
  await resolveComposerFileIntake({ source: 'drop', paths: ['C:/work/notes.txt'], files: [file] }, win),
);
assert.equal((await resolveComposerFileIntake({ source: 'paste', files: [file], uriList: 'file:///C:/work/notes.txt' }, win)).items[0].path, 'C:\\work\\notes.txt');
for (const os of ['linux', 'macos']) {
  const resolved = await resolveComposerFileIntake({ source: 'paste', uriList: 'file:///home/me/%E4%B8%AD%E6%96%87%20notes.txt' }, { ...win, __ACECODE_OS__: os });
  assert.equal(resolved.items[0].path, '/home/me/中文 notes.txt');
}
assert.equal((await resolveComposerFileIntake({ source: 'paste', uriList: 'https://example.com/file' }, win)).kind, 'none');
console.log('[pass] native drop and paste keep identical references and handle Windows and POSIX paths');

let saves = 0;
const saveHost = {
  ...win,
  aceDesktop_readClipboardContextItems: async () => ({ ok: true, items: [], filesystem_items: false }),
  aceDesktop_storeContextFiles: async files => {
    saves++;
    assert.equal(atob(files[0].data_base64), 'file');
    return { ok: true, items: files.map(file => item('C:/local-cache/' + file.name)) };
  },
};
for (const source of ['drop', 'paste']) {
  const resolved = await resolveComposerFileIntake({ source, files: [file] }, saveHost);
  assert.equal(resolved.kind, 'paths');
  assert.equal(resolved.items[0].path, 'C:/local-cache/notes.txt');
}
assert.equal(saves, 2);
const known = markFileSourcePath(new File(['file'], 'known.png'), 'C:/source/known.png');
assert.equal((await resolveComposerFileIntake({ source: 'drop', files: [known] }, saveHost)).items[0].path, 'C:/source/known.png');
assert.equal(saves, 2, 'known paths must never be re-saved');
await assert.rejects(resolveComposerFileIntake({ source: 'paste', files: [file] }, {
  ...saveHost, aceDesktop_readClipboardContextItems: async () => ({ ok: false, error: 'clipboard locked' }),
}), /clipboard locked/);
assert.equal(saves, 2, 'clipboard errors must not become file data fallbacks');
await assert.rejects(resolveComposerFileIntake({ source: 'drop', files: [file] }, win), /更新客户端/);
assert.equal((await resolveComposerFileIntake({ source: 'paste' }, saveHost)).kind, 'none');
console.log('[pass] desktop pathless data stays local; clipboard failures never silently upload or save');
