/**
 * EXP-03 / D3-03 gate — the storyboard's percentages ARE the spec.
 *
 * Every value asserted here is transcribed from `docs/direction/STORYBOARD.md`
 * (as amended: A2 removes Ch1's in-journey headline, A3 gives Ch7's draft lift its
 * percentage, A6 renames Ch4's first beat without moving a boundary). A silent
 * re-authoring in `beats.ts` fails this file rather than reaching a screenshot review.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  span,
  CHAPTER_SPANS_VH,
  CH1_BEATS,
  CH2_BEATS,
  CH3_BEATS,
  CH4_BEATS,
  CH5_BEATS,
  CH6_BEATS,
  CH7_BEATS,
  CH1_COPY_AT,
  CH2_COPY_AT,
  CH3_COPY_AT,
  CH4_COPY_AT,
  CH5_COPY_AT,
  CH6_COPY_AT,
  CH7_COPY_AT,
  type Beat,
} from './beats.ts';

const TABLES: Record<string, readonly Beat[]> = {
  CH1_BEATS,
  CH2_BEATS,
  CH3_BEATS,
  CH4_BEATS,
  CH5_BEATS,
  CH6_BEATS,
  CH7_BEATS,
};

/**
 * The authored beat boundaries, `[tableName, at]`. STORYBOARD §"Scroll behavior (beats)"
 * per chapter — the opening 0.00 of each table is omitted (it is structural, not authored).
 */
const STORYBOARD_PERCENTAGES: readonly (readonly [string, number])[] = [
  ['CH1_BEATS', 0.15],
  ['CH1_BEATS', 0.4],
  ['CH1_BEATS', 0.48],
  ['CH1_BEATS', 0.95],
  ['CH2_BEATS', 0.2],
  ['CH2_BEATS', 0.35],
  ['CH2_BEATS', 0.6],
  ['CH2_BEATS', 0.7],
  ['CH2_BEATS', 0.75],
  ['CH3_BEATS', 0.1],
  ['CH3_BEATS', 0.22],
  ['CH3_BEATS', 0.4],
  ['CH3_BEATS', 0.52],
  ['CH3_BEATS', 0.6],
  ['CH3_BEATS', 0.72],
  ['CH4_BEATS', 0.08],
  ['CH4_BEATS', 0.3],
  ['CH4_BEATS', 0.48],
  ['CH4_BEATS', 0.66],
  ['CH4_BEATS', 0.82],
  ['CH5_BEATS', 0.15],
  ['CH5_BEATS', 0.35],
  ['CH5_BEATS', 0.45],
  ['CH5_BEATS', 0.6],
  ['CH5_BEATS', 0.75],
  ['CH5_BEATS', 0.97],
  ['CH6_BEATS', 0.22],
  ['CH6_BEATS', 0.5],
  ['CH6_BEATS', 0.58],
  ['CH6_BEATS', 0.9],
  ['CH7_BEATS', 0.3],
  ['CH7_BEATS', 0.55],
];

type CopyBeat = number | readonly [number, number];

const COPY_TABLES: Record<string, Readonly<Record<string, CopyBeat>>> = {
  CH1_COPY_AT,
  CH2_COPY_AT,
  CH3_COPY_AT,
  CH4_COPY_AT,
  CH5_COPY_AT,
  CH6_COPY_AT,
  CH7_COPY_AT,
};

test('span clamps below, clamps above, and is exactly linear inside', () => {
  assert.equal(span(0.1, 0.2, 0.4), 0, 'below the window is 0');
  assert.equal(span(0.2, 0.2, 0.4), 0, 'the opening edge is 0');
  assert.equal(span(0.25, 0.2, 0.4), 0.25, 'a quarter of the way in is 0.25');
  assert.equal(span(0.3, 0.2, 0.4), 0.5, 'the midpoint is 0.5');
  assert.equal(span(0.4, 0.2, 0.4), 1, 'the closing edge is 1');
  assert.equal(span(0.9, 0.2, 0.4), 1, 'above the window is 1');
  assert.equal(span(0, 0, 1), 0, 'a whole-chapter window passes progress through');
  assert.equal(span(1, 0, 1), 1, 'a whole-chapter window passes progress through');
});

test('CHAPTER_SPANS_VH is the 740vh Global Choreography Map, row for row', () => {
  assert.equal(CHAPTER_SPANS_VH.length, 7, 'seven chapters');
  assert.deepEqual(
    [...CHAPTER_SPANS_VH],
    [90, 100, 120, 140, 110, 110, 70],
    'the differences of the storyboard map rows 0-90/90-190/190-310/310-450/450-560/560-670/670-740'
  );
  assert.equal(
    CHAPTER_SPANS_VH.reduce((a, b) => a + b, 0),
    740,
    'total core journey is 740vh'
  );
});

test('every beat table is sorted, in range, and uniquely labelled', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    assert.ok(table.length > 0, `${name} is not empty`);
    const ats = table.map((b) => b.at);
    assert.deepEqual(ats, [...ats].sort((a, b) => a - b), `${name} is sorted ascending by at`);
    assert.equal(new Set(ats).size, ats.length, `${name} has no duplicated at`);
    for (const beat of table) {
      assert.ok(beat.at >= 0 && beat.at <= 1, `${name} beat ${beat.label} is chapter-local 0..1`);
    }
    const labels = table.map((b) => b.label);
    assert.equal(new Set(labels).size, labels.length, `${name} labels are unique`);
  }
});

test('every table opens at 0 — a chapter is driven from its own entry', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    assert.equal(table[0].at, 0, `${name} opens at chapter entry`);
  }
});

test('the storyboard percentages are present, exactly', () => {
  for (const [name, at] of STORYBOARD_PERCENTAGES) {
    const table = TABLES[name];
    assert.ok(table, `${name} exists`);
    assert.ok(
      table.some((b) => b.at === at),
      `${name} carries the storyboard boundary ${at}`
    );
  }
});

test('Ch4 W1 is the calendar turning, not dawn 2 (Amendment A6)', () => {
  assert.equal(CH4_BEATS[0].label, 'tue-turns');
  assert.equal(CH4_BEATS[1].at, 0.08, 'no beat boundary percentage moved');
});

test("Ch7's draft lift carries Amendment A3's percentage as the one source", () => {
  const lift = CH7_BEATS.find((b) => b.label === 'draft-lift');
  assert.ok(lift, 'the draft lift is an authored beat');
  assert.equal(lift.at, 0.55, '03-18 reads this constant instead of writing 0.55 again');
});

test('Ch1 has no in-journey headline (Amendment A2)', () => {
  assert.equal('h1' in CH1_COPY_AT, false, 'the masthead H1 is pre-roll, outside the timeline');
  assert.deepEqual([...CH1_COPY_AT.sub], [0.48, 0.55], 'the sub alone, staggered, landing at 55%');
});

test('the flap pairing has exactly one source (REVIEWS.md F-2)', () => {
  assert.equal(CH2_COPY_AT.h2Line1[1], 0.35, "line 1 ends where the envelope flap closes");
  assert.equal(CH2_COPY_AT.h2Line2[0], 0.35, 'line 2 opens on the same constant');
});

test('every copy span is a well-formed window; every point is in range', () => {
  for (const [name, table] of Object.entries(COPY_TABLES)) {
    for (const [key, value] of Object.entries(table)) {
      if (Array.isArray(value)) {
        const [start, end] = value as readonly [number, number];
        assert.ok(start < end, `${name}.${key} span opens before it closes`);
        assert.ok(start >= 0 && start <= 1, `${name}.${key} start is chapter-local`);
        assert.ok(end >= 0 && end <= 1, `${name}.${key} end is chapter-local`);
      } else {
        assert.ok(
          (value as number) >= 0 && (value as number) <= 1,
          `${name}.${key} point is chapter-local`
        );
      }
    }
  }
});

test('copy beats paired to a world event are spans, not points (REVIEWS.md F-3)', () => {
  assert.ok(Array.isArray(CH1_COPY_AT.sub), 'Ch1 sub is paired to the pull-wide');
  assert.ok(Array.isArray(CH2_COPY_AT.h2Line1), 'Ch2 line 1 is paired to the flap');
  assert.ok(Array.isArray(CH6_COPY_AT.chips), 'Ch6 chips are the storyboard 55-85% range');
  assert.ok(Array.isArray(CH7_COPY_AT.conversion), "Ch7's block arrives across the pull-wide");
  assert.equal(typeof CH3_COPY_AT.h2, 'number', 'Ch3 H2 is one authored percentage');
  assert.equal(typeof CH4_COPY_AT.line2, 'number', 'Ch4 line 2 is one authored percentage');
  assert.equal(typeof CH5_COPY_AT.answered, 'number', 'Ch5 payoff line is one percentage');
});
