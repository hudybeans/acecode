import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshSavedModelReasoning, subscribeModelProfileUpdates } from './modelReasoningSync.js';

const connection = new EventTarget();
let updates = 0;
const unsubscribe = subscribeModelProfileUpdates(connection, () => { updates += 1; });
const message = (type) => {
  const event = new Event('message');
  event.detail = { type };
  connection.dispatchEvent(event);
};
message('session_status');
assert.equal(updates, 0);
message('model_profiles_updated');
connection.dispatchEvent(new Event('open'));
assert.equal(updates, 2);
unsubscribe();
message('model_profiles_updated');
connection.dispatchEvent(new Event('open'));
assert.equal(updates, 2);

let release;
const blocked = new Promise((resolve) => { release = resolve; });
let localReloads = 0;
const refresh = refreshSavedModelReasoning(
  { refreshModelReasoning: () => blocked },
  () => { localReloads += 1; },
);
await Promise.resolve();
await Promise.resolve();
assert.equal(localReloads, 1, 'local list refresh must not wait for remote work');
release();
await refresh;
await refreshSavedModelReasoning(
  { refreshModelReasoning() { throw new Error('offline'); } },
  async () => { throw new Error('disconnected'); },
);

// Exercise the UI wiring contract in addition to the event lifecycle above.
const settings = readFileSync(new URL('../components/model-settings/ModelSettingsSection.jsx', import.meta.url), 'utf8');
assert.match(settings, /refreshSavedModelReasoning\(api,/);
assert.match(settings, /subscribeModelProfileUpdates\(connection,/);
assert.match(settings, /loadSavedModels\(\{ quiet: true, silent: true \}\)/);
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(app, /subscribeModelProfileUpdates\(connection,[\s\S]*?setModelProfileRevision/);
console.log('modelReasoningSync.test.js: all tests passed');
