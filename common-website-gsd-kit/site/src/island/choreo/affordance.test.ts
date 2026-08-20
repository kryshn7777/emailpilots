/**
 * EXP-07 — the progress affordance's arithmetic, plus the one structural fact the
 * affordance depends on: `Timeline` is still the only scroll driver on the site.
 *
 * The math half is pure and runs anywhere. The Timeline half is a source contract: the
 * class builds its smooth-scroll instance and its master trigger in the constructor, so it
 * cannot be instantiated under `node --test` — but "there is exactly one scroll driver" is
 * a source-level fact and belongs in `npm test` rather than in a grep somebody runs once
 * (the 03-02 precedent).
 *
 * Grep-gate hygiene: the two driver patterns are assembled from fragments below and never
 * written as literals, because this file lives under the tree the scan walks — an embedded
 * literal would make the gate match its own source (the 03-01 copyParity lesson) and would
 * break the plan's own `grep -rc` over src/ as well.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTER_LABELS, barFraction, labelFor, navVisible } from './affordance.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TIMELINE = fs.readFileSync(path.join(ROOT, 'src/island/systems/Timeline.ts'), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|astro)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('CHAPTER_LABELS is seven items — asserted, not eyeballed (CHK-W4)', () => {
  assert.equal(CHAPTER_LABELS.length, 7, 'seven chapters, seven labels');
  // Ch6's title contains a comma, so a carelessly written array reads as eight items.
  assert.equal(CHAPTER_LABELS[5], 'Your Desk, The App', 'one label, not two');
  assert.deepEqual(
    [...CHAPTER_LABELS],
    [
      'First Light',
      'The Handoff',
      'Night Shift',
      'Six Days',
      'The Reply',
      'Your Desk, The App',
      'Ready When You Are',
    ],
    'the STORYBOARD chapter names, in story order'
  );
});

test('barFraction is (i + p) / total, exact at both ends', () => {
  assert.equal(barFraction(0, 0, 7), 0, 'the journey starts at zero');
  assert.equal(barFraction(6, 1, 7), 1, 'and reaches exactly full at the last chapter exit');
  assert.equal(barFraction(3, 0.5, 7), 3.5 / 7);
  assert.equal(barFraction(1, 0, 7), 1 / 7);
  // total defaults to the label count so callers cannot pass a stale seven.
  assert.equal(barFraction(6, 1), 1);
  assert.equal(barFraction(2, 0.25), barFraction(2, 0.25, CHAPTER_LABELS.length));
});

test('barFraction is monotonic and bounded across a synthetic full sweep', () => {
  let previous = -1;
  for (let i = 0; i < CHAPTER_LABELS.length; i++) {
    for (let p = 0; p <= 1.00001; p += 0.05) {
      const f = barFraction(i, Math.min(1, p), CHAPTER_LABELS.length);
      assert.ok(f >= previous, `bar went backwards at chapter ${i} progress ${p}`);
      assert.ok(f >= 0 && f <= 1, `bar left [0,1] at chapter ${i} progress ${p}`);
      previous = f;
    }
  }
  assert.equal(previous, 1, 'the sweep ends full');
});

test('labelFor returns the seven names in order and clamps out of range', () => {
  for (let i = 0; i < CHAPTER_LABELS.length; i++) assert.equal(labelFor(i), CHAPTER_LABELS[i]);
  assert.equal(labelFor(-1), 'First Light', 'below range clamps to the first');
  assert.equal(labelFor(-99), 'First Light');
  assert.equal(labelFor(7), 'Ready When You Are', 'above range clamps to the last');
  assert.equal(labelFor(99), 'Ready When You Are');
  assert.equal(labelFor(2.9), 'Night Shift', 'a fractional index truncates, never rounds up');
});

test('the quiet nav arrives at Ch3 entry and never leaves (D3-12)', () => {
  assert.equal(navVisible(0), false, 'Ch1 has no nav');
  assert.equal(navVisible(1), false, 'Ch2 has no nav');
  for (let i = 2; i < CHAPTER_LABELS.length; i++) {
    assert.equal(navVisible(i), true, `Ch${i + 1} shows the nav`);
  }
});

test('Timeline gained exactly one additive extension: onDrive with a disposer', () => {
  assert.match(
    TIMELINE,
    /driveListeners\s*=\s*new Set</,
    'listeners live in a Set on the instance'
  );
  assert.match(TIMELINE, /onDrive\(/, 'onDrive is exposed');
  assert.match(
    TIMELINE,
    /this\.driveListeners\.delete\(fn\)/,
    'onDrive returns the delete-disposer (project convention)'
  );
  assert.match(TIMELINE, /driveListeners\.clear\(\)/, 'dispose() empties the set');
});

test('onDrive fires from inside drive(), after the chapter got the same values', () => {
  const drive = /private drive\(\): void \{([\s\S]*?)\n  \}/.exec(TIMELINE);
  assert.notEqual(drive, null, 'drive() is still a private method on Timeline');
  const body = (drive as RegExpExecArray)[1];
  const update = body.indexOf('chapter.update(progress)');
  const notify = body.search(/for \(const fn of this\.driveListeners\)/);
  assert.ok(update > -1, 'drive() still calls chapter.update(progress)');
  assert.ok(notify > -1, 'drive() notifies the listeners');
  assert.ok(notify > update, 'the chapter is driven first; listeners observe what it received');
  assert.match(body, /fn\(chapterIndex, progress\)/, 'listeners get the same pair the chapter did');
});

test('EXP-01: exactly one scroll driver in src/, and it is Timeline.ts', () => {
  const files = walk(path.join(ROOT, 'src'));
  assert.ok(files.length > 20, 'the walk actually found the source tree');
  const TRIGGER = 'Scroll' + 'Trigger.create';
  const LENIS = 'new ' + 'Lenis(';
  const triggers: string[] = [];
  const lenis: string[] = [];
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (body.includes(TRIGGER)) triggers.push(rel);
    if (body.includes(LENIS)) lenis.push(rel);
  }
  assert.deepEqual(triggers, ['src/island/systems/Timeline.ts'], 'one master scrub, no second');
  assert.deepEqual(lenis, ['src/island/systems/Timeline.ts'], 'one smooth-scroll instance');
});
