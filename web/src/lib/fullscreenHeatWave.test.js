import assert from 'node:assert/strict';
import { isFullscreenHeatWaveShortcut, sampleFullscreenHeatWave } from './fullscreenHeatWave.js';

const ctrlO = { key: 'o', code: 'KeyO', ctrlKey: true };
for (const event of [ctrlO, { key: 'O', ctrlKey: true }, { code: 'KeyO', key: 'Unidentified', ctrlKey: true }, { ...ctrlO, repeat: true }]) {
  assert.equal(isFullscreenHeatWaveShortcut(event), true);
}
for (const event of [null, {}, { key: 'o' }, { key: 'o', metaKey: true }, { key: 'k', code: 'KeyK', ctrlKey: true },
  ...['shiftKey', 'altKey', 'metaKey', 'isComposing'].map((modifier) => ({ ...ctrlO, [modifier]: true })),
  { ...ctrlO, keyCode: 229 }]) {
  assert.equal(isFullscreenHeatWaveShortcut(event), false);
}
console.log('[pass] fullscreen heat wave: exact Ctrl+O, physical key fallback, repeat claim, IME and modifier exclusions');

for (const reduced of [false, true]) {
  const fade = reduced ? 0.18 : 0.65;
  const waveAt = fade + 0.25;
  const waveEnd = waveAt + 0.85;
  const closeAt = waveEnd + 0.45;
  const end = closeAt + fade;
  const sample = (time) => sampleFullscreenHeatWave(time, reduced);
  assert.equal(sample(-1).amount, 0);
  assert.equal(sample(NaN).amount, 0);
  assert.equal(sample(0).wave, false);
  assert.equal(sample(fade / 2).amount, 0.5);
  assert.equal(sample(fade).amount, 1);
  assert.equal(sample(waveAt - 0.001).wave, false);
  assert.equal(sample(waveAt + 0.001).wave, true);
  assert.equal(sample(waveEnd - 0.001).wave, true);
  assert.equal(sample(waveEnd + 0.001).wave, false);
  assert.equal(sample(closeAt).amount, 1);
  assert.ok(Math.abs(sample(closeAt + fade / 2).amount - 0.5) < 1e-10);
  assert.equal(sample(end - 0.001).complete, false);
  assert.equal(sample(end + 0.001).complete, true);
  assert.equal(sample(end + 1).amount, 0);
  assert.equal(sample(fade + 0.1).fps, 30);
  assert.equal(sample(waveAt + 0.1).fps, 60);
  assert.equal(sample(closeAt + 0.1).fps, 60);
  assert.equal(sample(1).motion, reduced ? 0.4 : 1);
  assert.equal(sample(1).shaderTime, reduced ? 0 : 1);
  let rising = 0, falling = 1;
  for (let i = 0; i <= 100; i++) {
    const opening = sample(fade * i / 100).amount;
    const closing = sample(closeAt + fade * i / 100).amount;
    assert.ok(opening >= rising && opening - rising < 0.016);
    assert.ok(closing <= falling && falling - closing < 0.016);
    rising = opening; falling = closing;
  }
}
console.log('[pass] fullscreen heat wave: one complete sequence, smooth fades, wave lifetime, rest, frame caps and reduced motion');
