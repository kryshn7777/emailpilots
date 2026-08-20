/**
 * The day-wheel PMREM contract — both halves of it (03-02, STACK-DECISION A6).
 *
 * **Ownership (03-RESEARCH Pitfall 3).** `setPair` disposing the outgoing pair is correct for
 * two skies and fatal for a wheel cycling five: Ch4 would destroy the sunrise target it needs
 * again two segments later. The guard is one branch, so it gets one runnable check — driven
 * headlessly, because everything `setPair` does before it touches GL is pure JS. A stub
 * renderer supplies the four methods PMREMGenerator and the blend pass actually call; a
 * `WebGLRenderTarget` allocates no GL resources until something renders to it, and its
 * `dispose()` dispatches an event, which is how disposal is observed here.
 *
 * **Residency.** The number `targetCount()` is measured against lives in BUDGETS.md, and the
 * §Ch4 assertions below exist because 03-15-T3 sends its executor to read that section *in
 * full* while asserting `pmrem-RT ≤ 6`. Two live numbers for one gate is how a budget quietly
 * gets ignored (CHK-B4), so the superseded reading is asserted absent, not merely amended.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebGLRenderTarget, type WebGLRenderer } from 'three';
import { createEnvCrossfade } from './envCrossfade.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUDGETS = fs.readFileSync(path.join(ROOT, '.planning/BUDGETS.md'), 'utf8');
const STACK = fs.readFileSync(path.join(ROOT, '.planning/STACK-DECISION.md'), 'utf8');

/**
 * The four renderer methods this module reaches for: `compile` (PMREMGenerator's equirect
 * shader prewarm) and the getRenderTarget/setRenderTarget/render trio of the blend pass.
 * Explicit boundary cast — a real WebGLRenderer needs a GL context, which is the one thing
 * a `node --test` process does not have.
 */
const stubRenderer = (): WebGLRenderer =>
  ({
    compile: () => {},
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
  }) as unknown as WebGLRenderer;

/** A PMREM-shaped target (768×1024 CubeUV atlas, per A4) that reports when it is disposed. */
function source(): { rt: WebGLRenderTarget; disposed: () => boolean } {
  const rt = new WebGLRenderTarget(768, 1024);
  let gone = false;
  rt.addEventListener('dispose', () => {
    gone = true;
  });
  return { rt, disposed: () => gone };
}

test('default setPair still disposes the outgoing pair — A4 semantics, both callers unchanged', () => {
  const env = createEnvCrossfade(stubRenderer());
  const a = source();
  const b = source();
  const c = source();
  const d = source();

  env.setPair(a.rt, b.rt);
  assert.equal(a.disposed(), false);
  assert.equal(b.disposed(), false);

  env.setPair(c.rt, d.rt);
  assert.equal(a.disposed(), true, 'outgoing A released by default');
  assert.equal(b.disposed(), true, 'outgoing B released by default');

  env.dispose();
});

test('default setPair stays reuse-aware — a carried-over target is never disposed', () => {
  const env = createEnvCrossfade(stubRenderer());
  const a = source();
  const b = source();
  const c = source();

  // Ch2's real swap at the 70% lamp beat: (sunrise, dusk2) -> (dusk2, night).
  env.setPair(a.rt, b.rt);
  env.setPair(b.rt, c.rt);

  assert.equal(a.disposed(), true, 'sunrise released');
  assert.equal(b.disposed(), false, 'dusk2 carried over, not disposed underneath the blend');

  env.dispose();
});

test('disposePrevious:false hands source lifetime to the caller — the wheel survives a full cycle', () => {
  const env = createEnvCrossfade(stubRenderer());
  // The five qwantani_* skies the Ch4 wheel owns: sunrise, noon, dusk2, night, moonrise.
  const skies = [source(), source(), source(), source(), source()];

  for (let i = 0; i < skies.length; i++) {
    const a = skies[i];
    const b = skies[(i + 1) % skies.length];
    env.setPair(a.rt, b.rt, { disposePrevious: false });
  }

  for (const [i, sky] of skies.entries()) {
    assert.equal(sky.disposed(), false, `sky ${i} survived the wheel cycle`);
  }

  // The module still holds exactly three: A + B + blend. The wheel's other three sources
  // are resident but externally owned, which is why the hud number is not the whole story.
  assert.equal(env.targetCount(), 3);

  env.dispose();
  for (const [i, sky] of skies.entries()) {
    assert.equal(sky.disposed(), false, `sky ${i} outlives envCrossfade.dispose() — caller owns it`);
  }
});

test('the day-wheel residency ruling is public, dated and shows its arithmetic (Open Question 1)', () => {
  const amendments = section(BUDGETS, 'Amendments');
  assert.match(amendments, /2026-08-20/, 'the ruling is dated');
  assert.match(amendments, /≤ 6[\s\S]*?≤ 5/, 'the amended desktop/mobile pair is stated');
  assert.match(amendments, /36 MB/, 'the VRAM arithmetic is shown, not asserted');
  assert.match(amendments, /[Rr]ejected/, 'the LRU re-PMREM alternative is on the record');
  assert.match(amendments, /LRU/);

  // Two mentions minimum: the ruling is scoped to the day-wheel, and the per-frame row that
  // it supersedes points at it rather than being rewritten in place.
  assert.ok(BUDGETS.split('day-wheel').length - 1 >= 2, 'the scope is named where it applies');
  assert.match(section(BUDGETS, 'Per-frame budgets'), /Amendments B1/);
});

test('no superseded PMREM number survives in the section 03-15 reads in full (CHK-B4)', () => {
  const ch4 = section(BUDGETS, 'Ch4 worst-frame budget');
  assert.ok(!ch4.includes('PMREMs = 2'), 'the two-target reading is gone from §Ch4');
  // Positive assertions too: a parser that returned an empty section would satisfy the
  // negative one forever (03-01 found exactly that failure in a sibling gate).
  assert.match(ch4, /Amendments B1/, '§Ch4 points at the dated ruling');
  assert.match(ch4, /≤ 6 desktop/);
  assert.match(ch4, /≤ 3/, 'and states what every other chapter is held to');
});

test('the seam decision is recorded once in STACK-DECISION §Amendments as A6', () => {
  const entries = STACK.match(/^- \*\*A6 \(/gm) ?? [];
  assert.equal(entries.length, 1, 'exactly one A6 entry');
  const a6 = STACK.slice(STACK.indexOf('- **A6 (')).split('\n- **')[0];
  assert.match(a6, /2026-08-20/);
  assert.match(a6, /disposePrevious/, 'the chosen option is named');
  assert.match(a6, /adoptExternal/, 'the rejected alternative is named');
  assert.match(a6, /targetCount/, 'the revised hud semantics are recorded');
});

/**
 * The body of a `## Heading…` block, up to the next `## `. Prefix-matched on whole lines
 * because the headings carry decision-id suffixes (`## Ch4 worst-frame budget (D-15)`), and
 * asserted non-empty because a section parser that silently matches nothing reports green
 * while checking nothing.
 */
function section(markdown: string, headingPrefix: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${headingPrefix}`));
  assert.notEqual(start, -1, `a "## ${headingPrefix}" section exists`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  assert.ok(body.trim().length > 0, `the "${headingPrefix}" section has a body`);
  return body;
}
