import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the production hook with deterministic React effects and deferred HTTP.
const moduleUrl = new URL('./sessionTranscript.js', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const dependencies = {};
const imports = /^import \{([^}]+)\} from '([^']+)';$/gm;
for (const [, names, specifier] of source.matchAll(imports)) {
  if (specifier === 'react') continue;
  const module = await import(new URL(specifier, moduleUrl));
  for (const name of names.split(',').map((value) => value.trim())) dependencies[name] = module[name];
}
const body = source.replace(imports, '').replace(/^export /gm, '');

function harness() {
  const slots = [], requests = [], retained = [];
  let cursor = 0, effects = [];
  const changed = (previous, next) => !previous || next.some((value, i) => value !== previous[i]);
  const hooks = {
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useSyncExternalStore(_subscribe, snapshot) { cursor++; return snapshot(); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const hook = vm.runInNewContext(`${body}\nuseSessionTranscript;`, {
    ...dependencies, ...hooks, console, Map, Set,
    createApi: () => ({
      getMessages: (sid, since) => new Promise((resolve, reject) => requests.push({ sid, since, resolve, reject })),
    }),
    connection: {
      reconfigure() {}, addEventListener() {}, removeEventListener() {},
      retainSession: (sid) => retained.push(sid), releaseSession() {},
    },
  });
  return {
    requests, retained,
    render(ref) {
      cursor = 0; effects = [];
      const result = hook(ref, { live: true });
      effects.forEach((effect) => effect());
      return result;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const history = { messages: [{ role: 'user', content: 'saved history', ts: 1 }], events: [] };

const h = harness();
const pending = { sessionId: 's1', resumePending: true };
h.render(pending);
assert.equal(h.retained.length, 0);
h.requests[0].resolve(history);
await flush();
let view = h.render(pending);
assert.equal(view.loadState, 'loaded');
assert.equal(view.items[0].content, 'saved history');

view = h.render({ sessionId: 's1', active: true, resumePending: false });
assert.equal(view.getState().loadState, 'loaded');
assert.equal(view.getState().items[0].content, 'saved history');
assert.deepEqual(h.retained, ['s1']);
assert.equal(h.requests.length, 2, 'promotion still refreshes live history');
console.log('[pass] live promotion preserves loaded disk history while catch-up is pending');

view = h.render({ sessionId: 's2', resumePending: true });
assert.equal(view.getState().loadState, 'loading');
assert.equal(view.getState().items.length, 0);
h.requests[1].resolve(history);
await flush();
assert.equal(view.getState().items.length, 0, 'late s1 response must not populate s2');
console.log('[pass] navigation clears the previous transcript and ignores stale recovery responses');
h.requests[2].resolve(history);
await flush();
view = h.render({ sessionId: 's2', resumeFailed: true });
assert.equal(view.items[0].content, 'saved history');
assert.equal(view.isLive, false);
assert.deepEqual(h.retained, ['s1']);
console.log('[pass] failed resume leaves disk history visible without retaining a live session');
view = h.render({ sessionId: 's2', resumePending: true, port: 12345 });
assert.equal(view.getState().items.length, 0, 'changing daemon identity must reset history');
h.unmount();
