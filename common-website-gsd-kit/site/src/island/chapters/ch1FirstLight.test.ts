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
    /queue\.load\('lazy'\)/.test(INDEX),
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
