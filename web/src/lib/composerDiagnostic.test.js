import assert from 'node:assert/strict';
import { createComposerDiagnostic } from './composerDiagnostic.js';

const lines = [];
let time = 1000;
const log = createComposerDiagnostic('test', {
  aceDesktop_logFromWeb: (_, line) => lines.push(line),
}, () => time);
log('submit', { length: 3, empty: false, text: 'SECRET', path: '/private', nested: { secret: 1 } });
assert.equal(lines.length, 1);
assert.ok(!lines[0].includes('SECRET'));
assert.ok(!lines[0].includes('/private'));
assert.ok(!lines[0].includes('nested'));
for (let i = 0; i < 200; i += 1) log('sync', { length: i });
assert.equal(lines.length, 120);
time += 60000;
log('resume');
assert.equal(lines.length, 121);
assert.ok(lines.at(-1).includes('"suppressed":81'));
assert.doesNotThrow(() => createComposerDiagnostic('test', {})('missing'));
assert.doesNotThrow(() => createComposerDiagnostic('test', { aceDesktop_logFromWeb() { throw Error('test'); } })('throw'));
createComposerDiagnostic('test', { aceDesktop_logFromWeb: () => Promise.reject(Error('test')) })('reject');
await new Promise((resolve) => setTimeout(resolve, 0));
console.log('composer diagnostic tests passed');
