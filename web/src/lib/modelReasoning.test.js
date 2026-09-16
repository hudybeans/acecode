import assert from 'node:assert/strict';
import { composerReasoningOptions, normalizeModelReasoning } from './modelReasoning.js';
import { normalizeModelProbeResult } from './modelManager.js';

const declaration = {
  supported: true, default_enabled: true, supported_efforts: ['low', 'high'], default_effort: 'high',
};
const profile = { name: 'fake', provider: 'openai', reasoning: declaration };
assert.equal(composerReasoningOptions(profile).label, '高');
assert.deepEqual(composerReasoningOptions(profile).items.map((item) => item.effort), [null, 'low', 'high']);
assert.equal(composerReasoningOptions(profile).selectedEffort, null);
assert.equal(composerReasoningOptions(profile, 'low').label, '低');
assert.equal(composerReasoningOptions(profile, 'low').selectedEffort, 'low');
assert.equal(composerReasoningOptions(profile, 'max').selectedEffort, null);
assert.equal(composerReasoningOptions({ ...profile, reasoning: { ...declaration, effort: 'low' } }).label, '低');
assert.equal(composerReasoningOptions({ ...profile, reasoning_effort: 'low' }).selectedEffort, 'low');
assert.equal(composerReasoningOptions({ ...profile, reasoningEffort: 'low' }).selectedEffort, 'low');
assert.equal(composerReasoningOptions({ ...profile, reasoningEffort: 'low' }, null).selectedEffort, null);
assert.equal(composerReasoningOptions({ ...profile, reasoning: { ...declaration, default_effort: '' } }).label, '默认');
assert.equal(composerReasoningOptions({ ...profile, provider: 'anthropic' }).label, '高');
for (const provider of ['copilot', 'grok', 'codex', '']) {
  assert.equal(composerReasoningOptions({ ...profile, provider }), null);
}
for (const reasoning of [null, {}, { supported: false }, { ...declaration, enabled: false },
  { ...declaration, default_enabled: false },
  { ...declaration, supported_efforts: [], default_effort: '', supports_max_tokens: true, max_tokens: 1024 }]) {
  assert.equal(composerReasoningOptions({ ...profile, reasoning }), null);
}
assert.equal(composerReasoningOptions({ ...profile, deleted: true }), null);
for (const reasoning of [{ ...declaration, supported_efforts: ['ultra'] },
  { ...declaration, supported_efforts: ['low', 'low'] },
  { ...declaration, default_effort: 'max' }, { ...declaration, enabled: 'true' },
  { ...declaration, mandatory: true, enabled: false }]) {
  assert.equal(normalizeModelReasoning(reasoning), null);
}
const result = normalizeModelProbeResult({
  models: ['declared', 'missing', 'removed', 'invalid'],
  model_reasoning: { declared: declaration, removed: null, invalid: { ...declaration, default_effort: 'max' } },
});
assert.deepEqual(result.reasoningByModel.declared.supported_efforts, ['low', 'high']);
assert.equal(result.reasoningByModel.missing, null);
assert.equal(result.reasoningByModel.removed, null);
assert.equal(result.reasoningByModel.invalid, null);
console.log('modelReasoning.test.js: all tests passed');
