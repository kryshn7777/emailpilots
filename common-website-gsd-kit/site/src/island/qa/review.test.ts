/**
 * `?wall=` / `?sky=` — the wave-3 review lever's parameter contract.
 *
 * Same threat as `?still=` (T-03-01, continuing T-02-08): a query-string value that reaches
 * a DOM property, a selector or a path is an injection. `parseStillParam` answers it by
 * returning *numbers*; this one answers it by returning **members of a closed allowlist** —
 * no branch returns, stores or forwards the input string, so a hostile value cannot survive
 * the parse even as data.
 *
 * The second gate here is the one that is easy to miss: a sky token that is not a real
 * `SkyId` would sail through a hand-written allowlist and then silently do nothing, because
 * the day-wheel's `has()` finds no source for it and holds the current pair. The reviewer
 * would see the wrong light state and have no idea why. So the lever's values are held
 * against `SKY_CYCLE` itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewParams, REVIEW_SKIES, REVIEW_WALLS } from './review.ts';
import { SKY_CYCLE } from '../choreo/setState.ts';

const parse = (query: string): ReturnType<typeof parseReviewParams> =>
  parseReviewParams(new URLSearchParams(query));

test('no params is the shipped path', () => {
  assert.deepEqual(parse(''), { wall: null, sky: null });
});

test('the two wall candidates parse, and nothing else does', () => {
  assert.equal(parse('wall=Plaster001').wall, 'Plaster001');
  assert.equal(parse('wall=PaintedPlaster017').wall, 'PaintedPlaster017');
  assert.deepEqual(
    [...REVIEW_WALLS],
    ['Plaster001', 'PaintedPlaster017'],
    'ASSETS.md §PBR texture sets names exactly these two for Open Question 5 — the lever ' +
      'cannot offer a third, and once the question closes it offers none',
  );
});

test('the three light states parse to real sky ids', () => {
  assert.equal(parse('sky=sunrise').sky, 'sunrise');
  assert.equal(parse('sky=dusk').sky, 'dusk2', 'the reviewer types dusk; the wheel means dusk2');
  assert.equal(parse('sky=night').sky, 'night');
  for (const [token, id] of Object.entries(REVIEW_SKIES)) {
    assert.ok(
      SKY_CYCLE.includes(id),
      `?sky=${token} maps to "${id}", which is not on the wheel. The day-wheel would find ` +
        'no source for it and silently hold the current pair — the reviewer sees the wrong ' +
        'light state and nothing says so.',
    );
  }
});

test('REVIEWS.md F-13: the lever covers all three states the wall is judged at', () => {
  assert.deepEqual(
    Object.keys(REVIEW_SKIES).sort(),
    ['dusk', 'night', 'sunrise'],
    'sunrise / dusk / NIGHT. The night frame is the deciding one — a wall material fails at ' +
      'night far more often than at noon, and a lever missing it makes the deciding capture ' +
      'impossible to take.',
  );
});

test('anything outside the allowlist yields null, and never the input', () => {
  for (const hostile of [
    'wall=Plaster002',
    'wall=../../etc/passwd',
    'wall=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E',
    'wall=Plaster001x',
    'wall=',
    'sky=noon',
    'sky=<script>',
    'sky=NIGHT',
    'sky=dusk2',
  ]) {
    const out = parse(hostile);
    const values = [out.wall, out.sky].filter((v) => v !== null);
    for (const value of values) {
      assert.ok(
        (REVIEW_WALLS as readonly string[]).includes(value) ||
          Object.values(REVIEW_SKIES).includes(value as never),
        `"${hostile}" produced "${value}", which is not an allowlist member`,
      );
    }
  }
  // `sky=dusk2` is deliberately rejected above: one spelling per state. Two spellings for
  // one state is two things to keep in step across six captures, and the alias map IS the
  // allowlist — accepting the id as well would make the map decorative.
  assert.equal(parse('sky=dusk2').sky, null);
  assert.equal(parse('sky=NIGHT').sky, null, 'exact match — no case folding, no trimming');
});

test('both levers are independent', () => {
  assert.deepEqual(parse('wall=PaintedPlaster017&sky=night'), {
    wall: 'PaintedPlaster017',
    sky: 'night',
  });
  assert.deepEqual(parse('wall=nope&sky=night'), { wall: null, sky: 'night' });
});
