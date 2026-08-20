/**
 * The CLS-guard drift gate (03-03-T1, 03-RESEARCH §Pitfall 1).
 *
 * `data-mode` must land on <html> BEFORE first paint or the FULL-mode restyle (sticky
 * stage, vh section spans, hidden stills) is charged to CLS. That forces a duplicate of
 * `decidePath` into an `is:inline` head script — `is:inline` scripts are not processed by
 * Astro, so the copy cannot `import` the tested module.
 *
 * This file makes the duplication safe instead of hopeful: it extracts the shipped inline
 * body out of `src/pages/index.astro`, evaluates it in `node:vm` against a stubbed DOM,
 * and asserts it agrees with `decidePath()` across gate.test.ts's own case matrix. The two
 * implementations can drift for exactly one commit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { decidePath, type GateEnv } from './gate.ts';

// `import.meta.dirname` is real on Node 22+ but untyped under `moduleResolution: Bundler`
// (03-01 deviation 3) — derive the site root from the standard `import.meta.url` instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src/pages/index.astro'), 'utf8');

/** The shipped inline gate body, as the browser receives it. */
function inlineGateBody(): string {
  const m = /<script\b[^>]*\bis:inline\b[^>]*>([\s\S]*?)<\/script>/.exec(SHELL);
  assert.notEqual(m, null, 'src/pages/index.astro carries an is:inline gate script');
  return (m as RegExpExecArray)[1];
}

/**
 * Evaluate the inline body against a stubbed browser. Only the four inputs
 * `decidePath` names are variable; everything else is a fixed stub, so a rule the
 * inline copy invents out of some other global would fail loudly rather than pass.
 */
function runInlineGate(env: GateEnv): string | undefined {
  const dataset: Record<string, string | undefined> = {};
  const search = env.override === null ? '' : `?path=${encodeURIComponent(env.override)}`;
  const sandbox = {
    document: {
      documentElement: { dataset },
      createElement: () => ({
        getContext: (id: string): object | null => (id === 'webgl2' && env.webgl2 ? {} : null),
      }),
    },
    location: { search },
    matchMedia: (q: string) => ({ matches: q.includes('reduce') && env.reducedMotion }),
    navigator: { connection: { saveData: env.saveData } },
    URLSearchParams,
  };
  vm.runInNewContext(inlineGateBody(), sandbox);
  return dataset.mode;
}

const env = (overrides: Partial<GateEnv> = {}): GateEnv => ({
  reducedMotion: false,
  webgl2: true,
  saveData: false,
  override: null,
  ...overrides,
});

test('the inline gate body actually parsed into something worth evaluating', () => {
  const body = inlineGateBody();
  assert.ok(body.length > 200, `extracted ${body.length} chars of inline gate body`);
  assert.ok(body.includes('dataset.mode'), 'the body assigns documentElement.dataset.mode');
  assert.ok(body.includes("'full'"), 'the body carries the literal path allowlist');
});

test('detection matrix — the inline copy reproduces decidePath exactly (override null)', () => {
  const cases: Partial<GateEnv>[] = [
    { reducedMotion: true, webgl2: true, saveData: false },
    { reducedMotion: true, webgl2: true, saveData: true },
    { reducedMotion: true, webgl2: false, saveData: false },
    { reducedMotion: true, webgl2: false, saveData: true },
    { webgl2: false, saveData: false },
    { webgl2: false, saveData: true },
    { webgl2: true, saveData: true },
    { webgl2: true, saveData: false },
  ];
  for (const c of cases) {
    const e = env(c);
    assert.equal(runInlineGate(e), decidePath(e), `inline gate disagrees on ${JSON.stringify(c)}`);
  }
});

test('the three detection outcomes are each actually reached', () => {
  assert.equal(runInlineGate(env({ reducedMotion: true })), 'reduced');
  assert.equal(runInlineGate(env({ webgl2: false })), 'static');
  assert.equal(runInlineGate(env({ saveData: true })), 'static');
  assert.equal(runInlineGate(env()), 'full');
});

test('override allowlist — a valid ?path wins over every detection (D2-10)', () => {
  assert.equal(
    runInlineGate(env({ reducedMotion: true, webgl2: false, saveData: true, override: 'full' })),
    'full'
  );
  assert.equal(runInlineGate(env({ override: 'static' })), 'static');
  assert.equal(runInlineGate(env({ override: 'reduced' })), 'reduced');
});

test('override allowlist — junk falls through to detection, never to dataset.mode (T-03-01)', () => {
  assert.equal(runInlineGate(env({ override: 'xss' })), 'full');
  assert.equal(runInlineGate(env({ webgl2: false, override: 'FULL' })), 'static');
  // The tampering case that matters: nothing off the allowlist may reach the attribute.
  const injected = '"><img src=x onerror=alert(1)>';
  const out = runInlineGate(env({ override: injected }));
  assert.equal(out, 'full');
  assert.ok(['full', 'static', 'reduced'].includes(out as string), 'dataset.mode is allowlisted');
});
