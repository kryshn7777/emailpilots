/**
 * EXP-04 — the copy-parity gate. Paraphrasing the locked copy, or letting a banned-register
 * phrase into a shipped surface, breaks the build from here on.
 *
 * Both fixtures are *parsed at test time* from `.planning/COPY-PLAN.md`. No copy line and,
 * deliberately, **no banned phrase is written as a literal in this file** — this module lives
 * under `src/`, which is exactly what the scan walks, so an embedded phrase would make the
 * gate match its own source and fail forever (grep-gate hygiene).
 *
 * D3-11: the prerendered nodes in `src/pages/index.astro` ARE the FULL-path copy — GSAP
 * animates those same nodes — so asserting against the shell asserts against every path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WAIT_TAGS, SEND_TIMESTAMPS, DAY_TAGS, MAP_LABELS } from './worldType.ts';

// `import.meta.dirname` is real on Node 22+ but untyped under `moduleResolution: Bundler`,
// so the site root is derived from the standard `import.meta.url` instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const COPY_PLAN = fs.readFileSync(path.join(ROOT, '.planning/COPY-PLAN.md'), 'utf8');
const SHELL = fs.readFileSync(path.join(ROOT, 'src/pages/index.astro'), 'utf8');

/** Binary payloads carry no copy; reading them would only slow the walk. */
const BINARY = new Set(['.ktx2', '.hdr', '.glb', '.woff2', '.png', '.webp', '.wasm']);

const flatten = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The body of a `## Heading` section, up to the next `## `. Matched on whole lines: the
 * document also *mentions* its own section names inline (`` `## Banned register` ``), and a
 * substring search silently returns the wrong block — a fixture that parses to nothing and
 * a gate that asserts nothing.
 */
function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  assert.notEqual(start, -1, `COPY-PLAN carries a "${heading}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * Every double-quoted string in the "On-screen copy (verbatim)" column. Column 2 only:
 * the Source column quotes fragments for citation, and the trailing prose paragraph names
 * the in-world strings, which live in the world and not in the DOM.
 */
function verbatimLines(): string[] {
  const lines: string[] = [];
  for (const row of section(COPY_PLAN, 'Per-chapter copy').split('\n')) {
    if (!row.startsWith('|')) continue;
    const cell = row.split('|')[2];
    if (!cell) continue;
    for (const m of cell.matchAll(/"([^"]+)"/g)) lines.push(m[1]);
  }
  return lines;
}

/**
 * Bullets in `## Banned register` whose content *is* a quoted phrase. The "Never-claims"
 * bullets are prose that quotes ordinary words ("safe", "spam") in context; they are review
 * rules for a human, not grep patterns, and matching on them would fire on any honest use.
 */
function bannedPhrases(): string[] {
  const phrases: string[] = [];
  for (const line of section(COPY_PLAN, 'Banned register').split('\n')) {
    const m = /^-\s+"([^"]+)"/.exec(line.trim());
    if (m) phrases.push(m[1]);
  }
  return phrases;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (!BINARY.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

test('the COPY-PLAN fixtures parse into something worth asserting', () => {
  const lines = verbatimLines();
  assert.ok(lines.length >= 25, `parsed ${lines.length} verbatim lines from the copy table`);
  const phrases = bannedPhrases();
  assert.ok(phrases.length >= 10, `parsed ${phrases.length} banned phrases`);
  for (const phrase of phrases) assert.ok(phrase.length > 3, 'no degenerate scan pattern');
});

test('every locked copy line is in the shell, verbatim (D3-11)', () => {
  const shell = flatten(SHELL);
  for (const line of verbatimLines()) {
    assert.ok(
      shell.includes(flatten(line)),
      `src/pages/index.astro is missing the locked line: ${line}`
    );
  }
});

test('no banned-register phrase reaches a shipped surface', () => {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'public'))];
  assert.ok(files.length > 10, 'the walk actually found the shipped surfaces');
  const phrases = bannedPhrases().map((p) => p.toLowerCase());
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const phrase of phrases) {
      assert.equal(
        body.includes(phrase),
        false,
        `banned register in ${path.relative(ROOT, file)} — see COPY-PLAN §Banned register`
      );
    }
  }
});

test('the wait tags are the storyboard strings (STORYBOARD Ch2 §Animation)', () => {
  assert.deepEqual(
    [...WAIT_TAGS],
    ['FOLLOW-UP 2 · wait 3 days', 'FOLLOW-UP 3 · wait 4 days'],
    'printed labels lying on the desk — the separator is a middle dot'
  );
});

test('the send timestamps are the anti-cannon proof language (Ch3)', () => {
  assert.deepEqual([...SEND_TIMESTAMPS], ['9:14 pm', '9:41 pm', '10:07 pm']);
  assert.ok(
    SEND_TIMESTAMPS.every((t) => !t.endsWith(':00 pm')),
    'never at a round time — the wobble is the claim'
  );
});

test('the day tags run MON to SAT (Ch4 §3D text, Amendment A6)', () => {
  assert.deepEqual([...DAY_TAGS], ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  assert.equal(DAY_TAGS.length, 6, 'six days; MON is Ch1-Ch3 and SAT flips at the Ch4 seam');
});

test('the Ch6 mapping labels are the five leader-line targets', () => {
  assert.deepEqual(
    [...MAP_LABELS],
    ['7-day plan', 'Sequences', 'Do-not-send list', 'schedule times', "Today's Usage"],
    'constellation, envelope stack, drawer, clock, lamp-lit meter zone'
  );
});

test('in-world strings stay in the world — the shell never duplicates them', () => {
  const shell = flatten(SHELL);
  for (const tag of WAIT_TAGS) {
    assert.equal(shell.includes(tag), false, `${tag} is world type, not DOM copy`);
  }
});
