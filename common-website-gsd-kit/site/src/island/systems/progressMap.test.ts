import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressMap, type SectionRange } from './progressMap.ts';

// Layout A — three contiguous sections (the shell's normal case).
const contiguous: SectionRange[] = [
  { top: 0, bottom: 1000 },
  { top: 1000, bottom: 2500 },
  { top: 2500, bottom: 4000 },
];

// Layout B — sections with dead space between them.
const gapped: SectionRange[] = [
  { top: 100, bottom: 300 },
  { top: 500, bottom: 900 },
];

// Layout C — a single section.
const single: SectionRange[] = [{ top: 0, bottom: 600 }];

test('before the first section clamps to chapter 0 progress 0', () => {
  assert.deepEqual(progressMap(-50, contiguous), { chapterIndex: 0, progress: 0 });
  assert.deepEqual(progressMap(0, gapped), { chapterIndex: 0, progress: 0 });
});

test('past the last section clamps to the last chapter progress 1', () => {
  assert.deepEqual(progressMap(4000, contiguous), { chapterIndex: 2, progress: 1 });
  assert.deepEqual(progressMap(99999, contiguous), { chapterIndex: 2, progress: 1 });
  assert.deepEqual(progressMap(950, gapped), { chapterIndex: 1, progress: 1 });
});

test('mid-section scrollY maps linearly within that section — exact values', () => {
  // Layout A
  assert.deepEqual(progressMap(500, contiguous), { chapterIndex: 0, progress: 0.5 });
  assert.deepEqual(progressMap(1000, contiguous), { chapterIndex: 1, progress: 0 });
  assert.deepEqual(progressMap(1750, contiguous), { chapterIndex: 1, progress: 0.5 });
  assert.deepEqual(progressMap(3625, contiguous), { chapterIndex: 2, progress: 0.75 });
  // Layout B
  assert.deepEqual(progressMap(200, gapped), { chapterIndex: 0, progress: 0.5 });
  assert.deepEqual(progressMap(700, gapped), { chapterIndex: 1, progress: 0.5 });
  // Layout C
  assert.deepEqual(progressMap(150, single), { chapterIndex: 0, progress: 0.25 });
  assert.deepEqual(progressMap(600, single), { chapterIndex: 0, progress: 1 });
});

test('a gap between sections holds the previous chapter at progress 1', () => {
  assert.deepEqual(progressMap(400, gapped), { chapterIndex: 0, progress: 1 });
});

test('degenerate inputs never divide by zero or throw', () => {
  assert.deepEqual(progressMap(500, []), { chapterIndex: 0, progress: 0 });
  const zeroHeight: SectionRange[] = [{ top: 100, bottom: 100 }];
  assert.deepEqual(progressMap(50, zeroHeight), { chapterIndex: 0, progress: 0 });
  assert.deepEqual(progressMap(100, zeroHeight), { chapterIndex: 0, progress: 1 });
});
