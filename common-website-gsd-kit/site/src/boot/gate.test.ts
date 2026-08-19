import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePath, type GateEnv } from './gate.ts';

const env = (overrides: Partial<GateEnv> = {}): GateEnv => ({
  reducedMotion: false,
  webgl2: true,
  saveData: false,
  override: null,
  ...overrides,
});

test('detection matrix — all 8 combinations of the three booleans (override null)', () => {
  // reducedMotion wins over everything except a valid override
  assert.equal(decidePath(env({ reducedMotion: true, webgl2: true, saveData: false })), 'reduced');
  assert.equal(decidePath(env({ reducedMotion: true, webgl2: true, saveData: true })), 'reduced');
  assert.equal(decidePath(env({ reducedMotion: true, webgl2: false, saveData: false })), 'reduced');
  assert.equal(decidePath(env({ reducedMotion: true, webgl2: false, saveData: true })), 'reduced');
  // no webgl2 OR saveData → static
  assert.equal(decidePath(env({ webgl2: false, saveData: false })), 'static');
  assert.equal(decidePath(env({ webgl2: false, saveData: true })), 'static');
  assert.equal(decidePath(env({ webgl2: true, saveData: true })), 'static');
  // capable, unconstrained → full
  assert.equal(decidePath(env({ webgl2: true, saveData: false })), 'full');
});

test('override allowlist — a valid override wins over every detection (D2-10)', () => {
  // 'full' forced even where detection says reduced AND static
  assert.equal(
    decidePath(env({ reducedMotion: true, webgl2: false, saveData: true, override: 'full' })),
    'full'
  );
  // 'static' forced on a fully capable machine
  assert.equal(decidePath(env({ override: 'static' })), 'static');
  // 'reduced' forced on a fully capable machine
  assert.equal(decidePath(env({ override: 'reduced' })), 'reduced');
});

test('override allowlist — junk values are ignored, never reflected (D2-10)', () => {
  // junk falls through to detection (capable machine → full)
  assert.equal(decidePath(env({ override: 'xss' })), 'full');
  // allowlist is literal: case variants are junk too; detection (no webgl2) → static
  assert.equal(decidePath(env({ webgl2: false, override: 'FULL' })), 'static');
});
