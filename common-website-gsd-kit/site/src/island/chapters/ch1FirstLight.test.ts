/**
 * Ch1's integration contract, and the retirement of the Phase-2 proof scene.
 *
 * The island entry is the one file that may create the shared singletons, and the chapters
 * are the files that may not. That is a source property, so these are source gates — the
 * same shape as `room.test.ts`, and for the same reason: `index.ts` reaches `Stage`, which
 * reaches `WebGLRenderer`, so nothing here can be constructed under `node --test`.
 *
 * ## Two gates in the plan could never have matched, and are corrected here
 *
 * `03-09-PLAN.md` specifies `grep -c "createRoom()" src/island/index.ts` == 1. `createRoom`
 * takes a deps object — the plan's own Task 1 writes it as `createRoom(deps)` — so the
 * literal `createRoom()` appears nowhere and the gate scores 0 against an expected 1: a
 * permanent false failure on the gate that proves the Room has one owner. This is the
 * *third* recurrence of the pattern in this phase (03-05 hit it as
 * `grep -c "createAssetRegistry()"`), and it has the same fix: match `createRoom(` — the
 * open paren alone. That still excludes the import line, which is what the parenthesis was
 * for (W-1): `import { createRoom }` has no paren after the name.
 *
 * The same plan specifies `grep -c "poseAt" src/island/chapters/Ch1FirstLight.ts` == 1. The
 * chapter imports `poseAt` by name, so the import line matches too and the gate scores 2
 * against an expected 1 — the exact W-1 trap the plan documents for `createSetState` two
 * bullets earlier and then walks into. Corrected to `poseAt(` for the same reason.
 *
 * Both corrections are mutation-proved: see 03-09-SUMMARY.md §Gate corrections.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CH1_COPY_AT, dustOpacityAt, inkProgressAt, span } from '../choreo/beats.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(ROOT, 'src');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INDEX = read('src/island/index.ts');
const CH1 = read('src/island/chapters/Ch1FirstLight.ts');

/** Every shipped source file under `src/`, tests excluded. */
function allSources(): string[] {
  return fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|astro|css)$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => path.join('src', f));
}

/** Chapter implementations — `Chapter.ts` is the contract, not an implementation. */
function chapterSources(): string[] {
  const dir = path.join(SRC, 'island', 'chapters');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join('src/island/chapters', f));
}

const count = (source: string, re: RegExp): number => (source.match(re) ?? []).length;

/* ---------------------------------------------------------- the proof scene is gone --- */

test('ProofChapter and proofMaterial are deleted, not left as dead exemplars', () => {
  for (const gone of ['src/island/chapters/ProofChapter.ts', 'src/island/shaders/proofMaterial.ts']) {
    assert.equal(
      fs.existsSync(path.join(ROOT, gone)),
      false,
      `${gone} still exists. The Phase-2 placeholder's job was to prove the contract; ` +
        'Ch1FirstLight is the integration reference now, and two references is one too many.',
    );
  }
});

test('nothing under src/ still names the proof scene', () => {
  const re = /ProofChapter|proofMaterial|makeProofMaterial/g;
  for (const rel of allSources()) {
    assert.equal(
      count(read(rel), re),
      0,
      `${rel} still names the proof scene — a dangling reference in a comment is a ` +
        'scavenger hunt for the next reader, and this one survived a whole plan set inside ' +
        "assetRegistry.ts's disposal docblock",
    );
  }
  // Positive control: the pattern must SEE the name when one is present.
  assert.equal(count('the ProofChapter walk', re), 1);
});

/* --------------------------------------------------------- one owner per singleton --- */

test('the Room is created once, by the entry, and never by a chapter', () => {
  assert.equal(
    count(INDEX, /createRoom\(/g),
    1,
    'the set is built ONCE for the page — a per-chapter Room is a per-chapter scene ' +
      'rebuild, and the first frame two of them disagreed on would be a cut',
  );
  for (const rel of chapterSources()) {
    assert.equal(count(read(rel), /createRoom/g), 0, `${rel} builds a Room`);
  }
  // The correction proved: the plan's literal cannot match a function that takes deps.
  assert.equal(count(INDEX, /createRoom\(\)/g), 0);
});

test('the set-state record is created once, by the entry, and passed down (CHK-B1)', () => {
  assert.equal(
    count(INDEX, /createSetState\(\)/g),
    1,
    'one record, created by the entry, passed into every chapter constructor. A chapter ' +
      'with a private copy cannot hand the next chapter the state it inherits, and the ' +
      'leave-state contract (REVIEWS.md F-4) becomes unverifiable.',
  );
  for (const rel of chapterSources()) {
    assert.equal(count(read(rel), /createSetState/g), 0, `${rel} makes its own set state`);
  }
});

test('chapters never dispose the Room they were handed (T-03-12)', () => {
  for (const rel of chapterSources()) {
    assert.equal(
      count(read(rel), /room\.dispose\(/g),
      0,
      `${rel} disposes the shared set. A chapter releases only what it owns; the Room ` +
        'outlives all seven.',
    );
  }
});

/* ------------------------------------------------------------- the real registration --- */

test('Ch1 is registered against its own shell section, not the whole main', () => {
  assert.equal(
    count(INDEX, /timeline\.register\(/g),
    1,
    'one chapter is registered in this plan. Waves 4-10 add the other six against the same ' +
      'seven sections — the per-section registration Timeline was built for.',
  );
  assert.equal(
    count(INDEX, /'#ch1'/g),
    1,
    "the proof scene was registered against all seven sections so one instance replayed " +
      'itself seven times; a real chapter owns exactly its own range',
  );
});

test('Ch1 drives the authored camera pose and invents no motion of its own', () => {
  assert.equal(
    count(CH1, /poseAt\(/g),
    1,
    'STORYBOARD §Camera Language is a CLOSED vocabulary: chapters consume authored poses, ' +
      'they never build motion primitives. One call site is the whole camera in this chapter.',
  );
  // The correction proved: the plan's bare literal also counts the import line.
  assert.equal(count(CH1, /poseAt/g), 2, 'the import plus the one call — the W-1 trap');
});

/* -------------------------------------------------------------- the payload split --- */

test("Ch1's streamed dressing is queued off the loader's critical path", () => {
  assert.ok(
    /CH1_STREAMED/.test(INDEX),
    'the dressing that is not in the opening ECU still has to arrive — the split names a ' +
      'second batch rather than silently dropping the storyboard objects',
  );
  assert.ok(
    // Whitespace-tolerant on purpose: the call is chained across lines, so a regex anchored
    // on `queue.load(` scores 0 against a wiring that is present and correct.
    /\.load\('lazy'\)/.test(INDEX),
    "the streamed batch rides its OWN priority. 'soon' is already carrying the benchmark " +
      'warm-cache and the one-ahead chapter prefetch, and AssetQueue.prime() would be handed ' +
      "those .json files and reject on 'no parser for benchmarks/…'.",
  );
  assert.equal(
    count(INDEX, /CH1_STREAMED[\s\S]{0,80}'critical'/g),
    0,
    'a streamed row added at critical priority would weight the loader bar with bytes the ' +
      'visitor is not waiting for — the dishonest bar D2-20 forbids',
  );
});

/* ============================================================ 03-11 — Ch1 complete === */

/**
 * The gates below are the ones a screenshot cannot take. They fall into three groups:
 *
 *  1. **Rulings, as source properties.** Amendment A2 (no in-journey headline), A7 (the light
 *     state is the env triple and Ch1 never renders noon), CHK-B1 (one set-state record).
 *     Each is a thing that must be ABSENT, and an absence is only checkable in the text.
 *  2. **The demand renderer's contract.** A `gsap.to` with no `onUpdate: invalidate` runs to
 *     completion and paints nothing at all under demand rendering (Pitfall 5) — no error, no
 *     warning, just a token that never resolves.
 *  3. **F-4's dismissal, as arithmetic.** The ruling asks for the mote opacity to be
 *     *asserted* 0 at progress 1.0, which is why the ramp is a pure function in `beats.ts`
 *     rather than three lines inlined in an `update()` no test can reach.
 */

test('Ch1 has no in-journey headline (STORYBOARD Amendment A2)', () => {
  assert.equal(
    count(CH1, /masthead/g),
    0,
    '"You write it once." is the masthead H1 — painted at first paint, on screen from load, ' +
      'and the LCP candidate an `opacity: 0` element could never be. Passing it into ' +
      'createCopyTimeline would gate the paint of the one element BUDGETS names as LCP.',
  );
  assert.equal(count(CH1, /createCopyTimeline\(/g), 1, 'one chapter, one copy timeline');
  assert.ok(/CH1_COPY_AT/.test(CH1), 'and it reads the authored span, not a literal');
  assert.deepEqual(
    [...CH1_COPY_AT.sub],
    [0.48, 0.55],
    'the sub alone, staggered across the pull-wide with its lines landing at 55% (A2)',
  );
});

test('the light state is the env triple, and Ch1 never renders noon (A7)', () => {
  assert.equal(count(CH1, /skyId/g), 0, 'a single sky id cannot fix a blend (Ruling 5)');
  assert.equal(
    // Word-boundaried on purpose: a bare `grep -c "noon"` also matches "afternoon", which is
    // an entirely plausible word in a chapter about the hour of the day. The gate is about
    // the SKY id, so it must only see the sky id.
    count(CH1, /\bnoon\b/g),
    0,
    "Ch1's declared pair is (sunrise, dusk2) held at mix 0.00 to 95% — so the instant mix " +
      'leaves 0 the sun is FALLING, which is what makes §Transition out literal (A7). Under ' +
      'the superseded chain the target was noon and the sun climbed out of Ch1.',
  );
  // Non-vacuous both ways.
  assert.equal(count('the afternoon light', /\bnoon\b/g), 0, 'and "afternoon" is not a sky');
  assert.equal(count('the noon segment', /\bnoon\b/g), 1);
  assert.ok(/dusk2/.test(CH1), 'positive control: the authored pair is named');
});

test('Ch1 writes the shared record and never makes its own (CHK-B1)', () => {
  assert.equal(count(CH1, /createSetState/g), 0, 'the entry creates it; the chapter receives it');
  assert.ok(
    count(CH1, /this\.setState\./g) >= 2,
    'the leave-state contract is a WRITE: Ch2 opens on exactly what Ch1 left, and a chapter ' +
      'that only reads the record hands the next one the journey origin forever',
  );
});

test('the motes are dismissed, and the dismissal is arithmetic rather than hope (F-4)', () => {
  // Exact, and exact by construction: `span(1, 0.95, 1)` divides one expression by itself,
  // so it is 1.0 with no rounding anywhere in the path, and `1 - 1` is 0.
  assert.equal(
    dustOpacityAt(1),
    0,
    'STORYBOARD Ch2: "dust motes fade out with the sun". Chapters are registered permanently ' +
      'and only the ACTIVE one is updated, so whatever Ch1 leaves the motes at persists ' +
      'through Ch2-Ch7 — sun-shaft motes hanging in a night room for six chapters.',
  );
  assert.equal(dustOpacityAt(0.95), 1, 'full until the sun-angle fall begins');
  assert.equal(dustOpacityAt(0), 1, 'and the journey origin has them at full (SET_STATE[0])');
  assert.equal(dustOpacityAt(0.975), 0.5, 'a linear fall across the same window as the sun');
  assert.equal(dustOpacityAt(2), 0, 'clamped past the end — a scrub can overshoot');

  assert.ok(count(CH1, /dustOpacityAt\(/g) >= 1, 'and the chapter drives the motes from it');
  assert.ok(
    /dustOpacity/.test(CH1),
    'writing it into the shared record too, so the seam is assertable rather than visual',
  );
});

test('the motes are scrubbed by scroll, never by a clock (D3-16)', () => {
  assert.equal(
    count(CH1, /requestAnimationFrame|gsap\.ticker|performance\.now|Date\.now|setInterval/g),
    0,
    'a time-driven drift makes the demand renderer run continuously for ambience — battery ' +
      'spent on motion nobody is looking at, and a chapter that no longer scrubs reversibly',
  );
  assert.equal(
    count(CH1, /ponytail:/g),
    1,
    'the scrubbed-dust decision is a deliberate simplification with a named ceiling, and it ' +
      'is the only one in this chapter',
  );
});

test('the particle count comes from the quality tier, not from a viewport read', () => {
  // **Gate correction (03-11).** The plan spells this `grep -c "particleCap"` >= 1, and the
  // chapter does not — and must not — read `QualitySettings` a second time: `Room` already
  // subscribes to the regression ladder and republishes the allowance as `dustAllowance`, so
  // a chapter-side `quality.settings.particleCap` would be a second consumer of the same
  // knob that stops agreeing with the Room's on the first rung change. As written the gate
  // was satisfiable by a COMMENT naming the constant, which is the vacuous-gate failure this
  // phase has now shipped three times. So it accepts either spelling and grows the teeth the
  // literal was standing in for: `dustAllowance` counts as a tier read only because the Room
  // derives it from the tier, and that derivation is asserted here rather than assumed.
  assert.ok(
    count(CH1, /particleCap|dustAllowance/g) >= 1,
    'BUDGETS §Per-frame: 40 desktop / 0 mobile, and it is the site’s ONLY particle system',
  );
  assert.match(
    read('src/island/set/Room.ts'),
    /dustAllowance = settings\.particleCap/,
    'the chain the gate above depends on: Room republishes the TIER’s particle cap, inside ' +
      'the quality subscription, so a rung-3 demotion reaches the motes. If this line moves, ' +
      '`dustAllowance` stops being a tier read and the chapter is reading a stale number.',
  );
  assert.equal(
    count(CH1, /matchMedia|innerWidth|innerHeight/g),
    0,
    'ResponsiveBranch is the single breakpoint authority; a viewport read here is a second ' +
      'one that drifts from the stylesheet on the first edit',
  );
});

test('every accent tween tells the demand renderer to paint (Pitfall 5)', () => {
  const tweens = count(CH1, /gsap\.(?:to|from|fromTo|timeline)\(/g);
  assert.ok(tweens >= 1, 'positive control: the token beat is a real tween');
  const updates = CH1.split('\n').filter((line) => line.includes('onUpdate'));
  assert.ok(
    updates.length >= tweens,
    `${tweens} tween(s) but ${updates.length} onUpdate(s). A tween with no invalidate runs to ` +
      'completion and paints NOTHING under demand rendering — the token never resolves, and ' +
      'nothing anywhere reports an error.',
  );
  for (const line of updates) {
    assert.match(line, /invalidate/, `an onUpdate that does not invalidate: ${line.trim()}`);
  }
});

test('no copy is written from code (D3-11)', () => {
  assert.equal(
    count(CH1, /\.textContent\s*=|innerHTML/g),
    0,
    'the prerendered nodes in index.astro ARE the copy; the chapter only splits, moves and ' +
      'fades what the shell already shipped, or SEO and fallback parity stop being free',
  );
});

test('the ink is scrubbed through the piecewise map, not a raw span (B-5)', () => {
  assert.ok(count(CH1, /inkProgressAt\(/g) >= 1, 'the chapter consumes the piecewise map');
  assert.equal(
    count(CH1, /span\(progress,\s*0,\s*0\.4/g),
    0,
    'the single linear map REVIEWS.md B-5 rejects. The ramp is arc-length-normalised, so ' +
      'this makes "Hi " complete at 5% of the page’s ink rather than at the authored 15%.',
  );
  // Positive control on the same pattern, so "0" here means "absent" and not "unmatchable".
  assert.equal(count('uProgress.value = span(progress, 0, 0.40);', /span\(progress,\s*0,\s*0\.4/g), 1);
  assert.notEqual(inkProgressAt(0.15), span(0.15, 0, 0.4), 'and the two are genuinely different');
});

test('Ch1 releases what it built and nothing it was handed (T-03-12)', () => {
  const dispose = CH1.slice(CH1.indexOf('dispose('));
  for (const owned of ['fold', 'ink', 'dust', 'copy']) {
    assert.match(
      dispose,
      new RegExp(owned, 'i'),
      `dispose() never mentions the ${owned} it created. brief 05 bans leaks, and the four ` +
        'things this chapter owns are the letter rig, the cloned ink material, the mote ' +
        'mesh and the copy timeline.',
    );
  }
});
