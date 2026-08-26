/**
 * EXP-05 / CHK-W1 / CHK-W9 — the file that reads real bytes off disk.
 *
 * Three unrelated-looking gates share this suite for one reason: they all need the real
 * `public/assets` tree and the real `manifest.json`, and nothing else in the project does.
 *
 *  1. **Manifest integrity (EXP-05).** Every url a chapter declares must exist under
 *     `public/assets` at exactly the byte count the chapter declares, and must be covered
 *     by a licensing row. A stale weight is not cosmetic: `AssetQueue` weights the loader
 *     percent by `expectedBytes`, so a wrong number is a dishonest progress bar, which is
 *     precisely what D2-20 forbids. Bytes are compared against `manifest.json` **as it
 *     exists in this run** and against `fs.statSync` — never against a number recorded in
 *     a plan or a summary. 03-04 measured the ingest as NOT byte-reproducible
 *     (`@gltf-transform/cli` output differs run to run), so a hash or a byte count copied
 *     out of a document would go red on the next clean ingest for no real reason.
 *  2. **Regime-B (CHK-W1).** `.planning/BUDGETS.md` §Payload budgets gives Ch1's critical
 *     path two build-gate lines that until now no plan and no script checked. See the
 *     Regime-B block below — the desktop line is a live gate; the mobile line is a live
 *     gate on a recorded debt, and the reason is written out there in full.
 *  3. **Span mirror (CHK-W9).** 03-03 already asserts the seven FULL-mode `min-height`
 *     values against a **literal** `[90,100,120,140,110,110,70]` in
 *     `src/styles/shellLayout.test.ts`. That catches an edited stylesheet and nothing
 *     else: permute `CHAPTER_SPANS_VH` itself and the CSS still matches the literal, the
 *     literal still matches the CSS, and every chapter's scroll span silently re-maps
 *     while both suites stay green. The gate below is the missing edge — CSS compared to
 *     the **constant**, element by element — and it deliberately never writes the seven
 *     numbers down, because a second copy of them is what made the first gate blind.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTER_ASSETS, nextPrefetch } from './chapterAssets.ts';
import { CHAPTER_SPANS_VH } from './beats.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');

interface ManifestRow {
  id: string;
  /** A FILE for model/HDRI rows, a DIRECTORY for the ambientCG PBR sets — both ship. */
  file: string;
  license: string;
  bytes_optimized: number;
}

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ASSETS_DIR, 'manifest.json'), 'utf8'),
) as ManifestRow[];

/**
 * Paths under `public/assets` that carry no manifest row **by design**. The manifest is the
 * LICENSING surface; first-party bakes are authored in this repo and carry no attribution
 * obligation, so `pipeline/manifest.mjs` does not parse them (their ledger row has no
 * source URL). `ink/` is 03-08's baked stroke ramp; `ui/` is 03-12's app screenshot. Their
 * bytes are still checked against the real file — only the licence lookup is skipped.
 */
const FIRST_PARTY = ['assets/ink/', 'assets/ui/'];

/** Real bytes on disk: a file's own size, or the sum of a directory's contents. */
function diskBytes(relToAssets: string): number {
  const full = path.join(ASSETS_DIR, relToAssets);
  const stat = fs.statSync(full);
  if (!stat.isDirectory()) return stat.size;
  return fs
    .readdirSync(full)
    .reduce((sum, name) => sum + diskBytes(path.join(relToAssets, name)), 0);
}

/** The licensing row covering a declared url, or null when it is a first-party bake. */
function licenceRowFor(url: string): ManifestRow | null {
  if (FIRST_PARTY.some((prefix) => url.startsWith(prefix))) return null;
  const rel = url.slice('assets/'.length);
  const row = MANIFEST.find((r) => r.file === rel || rel.startsWith(`${r.file}/`));
  assert.ok(
    row,
    `${url} has no row in public/assets/manifest.json. Every shipped third-party asset is ` +
      'covered by a licensing row (T-02-12); a first-party bake goes in FIRST_PARTY above ' +
      'with the plan that authors it named.',
  );
  return row;
}

const ALL_DECLARED = CHAPTER_ASSETS.flat();

/* ---------------------------------------------------------------- prefetch decision --- */

test('one prefetch per boundary crossing, and only one (D3-10)', () => {
  assert.equal(nextPrefetch(0, 0, 7), 1, 'entering Ch1 pays for Ch2');
  assert.equal(
    nextPrefetch(0, 1, 7),
    null,
    'Timeline.onDrive fires on every scroll update — the second drive inside the same ' +
      'chapter must decide nothing, or the prefetch becomes per-event work on the scrub path',
  );
  assert.equal(nextPrefetch(1, 1, 7), 2, 'crossing into Ch2 pays for Ch3');
  assert.equal(nextPrefetch(1, 2, 7), null);
});

test('there is no chapter 8', () => {
  assert.equal(nextPrefetch(5, 5, 7), 6, 'Ch6 pays for Ch7 — the last real prefetch');
  assert.equal(nextPrefetch(6, 6, 7), null);
  assert.equal(nextPrefetch(6, 7, 7), null, 'not even when the counter has run past the end');
});

test('scrolling backwards never re-triggers a covered chapter', () => {
  // Reverse scrub from Ch7 back to Ch1 with everything already primed. Re-adding to the
  // queue would be harmless (AssetQueue skips done items) but re-priming would not: the
  // registry would be handed buffers during a fast reverse scrub, which is the exact
  // frame-boundary work Pitfall 4 exists to keep off the scrub path.
  for (const back of [5, 4, 3, 2, 1, 0]) {
    assert.equal(nextPrefetch(back, 6, 7), null, `reverse drive at chapter index ${back}`);
  }
});

/* ------------------------------------------------------------------- the manifests --- */

test('CHAPTER_ASSETS is seven chapters of well-formed rows', () => {
  assert.equal(CHAPTER_ASSETS.length, 7, 'index 0..6 = Ch1..Ch7');
  assert.equal(
    CHAPTER_ASSETS.length,
    CHAPTER_SPANS_VH.length,
    'one manifest per authored chapter span',
  );
  for (const [i, rows] of CHAPTER_ASSETS.entries()) {
    for (const asset of rows) {
      assert.match(
        asset.url,
        /^assets\//,
        `Ch${i + 1}: urls are relative and join through baseUrl inside AssetQueue (D2-06)`,
      );
      assert.ok(
        Number.isInteger(asset.bytes) && asset.bytes > 0,
        `Ch${i + 1}: ${asset.url} needs a real byte weight`,
      );
    }
    const urls = rows.map((a) => a.url);
    assert.equal(new Set(urls).size, urls.length, `Ch${i + 1} declares no url twice`);
  }
});

test('every declared url exists on disk at exactly the declared byte count', () => {
  for (const asset of ALL_DECLARED) {
    const rel = asset.url.slice('assets/'.length);
    assert.ok(
      fs.existsSync(path.join(ASSETS_DIR, rel)),
      `${asset.url} is declared but not present under public/assets — no chapter may name ` +
        'an asset a later ingest plan has not landed yet',
    );
    assert.equal(
      diskBytes(rel),
      asset.bytes,
      `${asset.url}: declared ${asset.bytes} B, on disk ${diskBytes(rel)} B. AssetQueue ` +
        'weights the loader percent by this number (D2-20) — a stale weight is a dishonest bar.',
    );
  }
});

test('every declared url is covered by a licensing row that agrees on bytes', () => {
  for (const asset of ALL_DECLARED) {
    const row = licenceRowFor(asset.url);
    if (row === null) continue; // first-party bake, exempted above with its reason
    const rel = asset.url.slice('assets/'.length);
    if (row.file === rel) {
      assert.equal(
        asset.bytes,
        row.bytes_optimized,
        `${asset.url} must declare the manifest's bytes_optimized`,
      );
    } else {
      // A PBR row's `file` is a DIRECTORY and its bytes_optimized is the whole set; a
      // chapter declares the individual .ktx2 files it actually fetches, so the row's sum
      // is the ceiling for the declaration, not its equal.
      assert.ok(
        asset.bytes <= row.bytes_optimized,
        `${asset.url} is one file inside the "${row.id}" set — it cannot outweigh the set`,
      );
    }
  }
});

test('manifest.json still describes the bytes actually on disk (drift probe)', () => {
  // Regenerated-in-this-run comparison on purpose: the ingest is not byte-reproducible
  // (03-04), so this asserts manifest-vs-disk, never manifest-vs-a-number-in-a-document.
  for (const row of MANIFEST) {
    assert.ok(
      fs.existsSync(path.join(ASSETS_DIR, row.file)),
      `manifest row "${row.id}" points at ${row.file}, which is not on disk`,
    );
    assert.equal(
      diskBytes(row.file),
      row.bytes_optimized,
      `manifest row "${row.id}" claims ${row.bytes_optimized} B; disk says ${diskBytes(row.file)} B`,
    );
  }
});

test("Ch1's manifest IS the critical batch declared in the island entry", () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/island/index.ts'), 'utf8');
  const start = source.indexOf('const CRITICAL_ASSETS');
  assert.notEqual(start, -1, 'src/island/index.ts must still declare CRITICAL_ASSETS');
  const block = source.slice(start, source.indexOf('} as const;', start));
  const batch = [...block.matchAll(/url: '([^']+)', bytes: ([\d_]+)/g)].map((m) => ({
    url: m[1],
    bytes: Number(m[2].replace(/_/g, '')),
  }));
  assert.ok(batch.length > 0, 'the critical batch must still be readable from the entry');

  const byUrl = new Map(batch.map((a) => [a.url, a.bytes]));
  for (const asset of CHAPTER_ASSETS[0]) {
    assert.ok(
      byUrl.has(asset.url),
      `${asset.url} is declared for Ch1 but is not in the critical batch. Ch1's manifest is ` +
        'a subset of the batch that must land before the loader hands off — an asset that ' +
        'arrives later belongs to the chapter that first shows it.',
    );
    assert.equal(
      asset.bytes,
      byUrl.get(asset.url),
      `${asset.url}: Ch1's declared weight and the loader's weight must be one number`,
    );
  }
});

/* ------------------------------------------------------- Regime-B build gates (CHK-W1) --- */

/**
 * `.planning/BUDGETS.md` §Payload budgets, Regime B — "Ch1 critical path (to interactive):
 * ≤ 9 MB desktop / ≤ 5 MB mobile", both marked *build gate*. Decimal MB, the stricter
 * reading of the two.
 *
 * **Desktop is a live gate.** It passes today with real headroom, and it is a ratchet: every
 * later plan that appends a Ch1 row (03-09's chair, Paper001 and the desk dressing) spends
 * against it here, in a failing test, rather than in a slow first load nobody attributes.
 *
 * **Mobile is a live gate on a RECORDED DEBT, not on the budget line**, and that is a
 * deliberate, escalated decision rather than a shrug. STORYBOARD §Ch1 Textures authors the
 * mobile path as "prop sets at 2K KTX2 (desktop) / 1K (mobile)" — i.e. a *second, smaller
 * variant of each asset*. 03-04 ingested exactly one variant of each, and no Phase-3 plan
 * owns a 1K-variant chain, so the mobile tier streams the desktop bytes byte-for-byte: the
 * two sums below are the same number, and Ch1 is over the 5 MB line before it has even
 * acquired its chair. Asserting 5,000,000 today would paint the build red describing work
 * that has no owner; asserting nothing would let the overage grow in silence. So the mobile
 * sum is pinned at the figure measured here — it may not get worse — with the real line
 * written down beside it. Escalated in 03-05-SUMMARY.md; closing it is either a 1K-variant
 * ingest chain or a BUDGETS amendment, and it is a Phase-4/6 decision, not a code-time one.
 */
const CH1_DESKTOP_LIMIT = 9_000_000;
const CH1_MOBILE_LIMIT = 5_000_000;
const CH1_MOBILE_DEBT = 6_649_520;

test('Ch1 critical path holds the Regime-B desktop line (CHK-W1)', () => {
  const bytes = CHAPTER_ASSETS[0].reduce((sum, a) => sum + a.bytes, 0);
  assert.ok(
    bytes <= CH1_DESKTOP_LIMIT,
    `Ch1 critical path is ${bytes} B against the ${CH1_DESKTOP_LIMIT} B desktop build gate ` +
      `(${CH1_DESKTOP_LIMIT - bytes} B of headroom before this run). Adding a Ch1 asset that ` +
      'breaks this is a plan decision — split the row to a streamed chapter batch, cut it, ' +
      'or amend BUDGETS. It is never a code-time shrug (D-15).',
  );
});

test('Ch1 mobile payload does not grow past the recorded overage (CHK-W1)', () => {
  // "Counting only the assets the mobile tier actually loads" — which today is all of them,
  // because there is no per-tier asset selection anywhere in the island. When one lands,
  // this filter is where it goes, and the assertion below is promoted to CH1_MOBILE_LIMIT.
  const bytes = CHAPTER_ASSETS[0].reduce((sum, a) => sum + a.bytes, 0);
  assert.ok(
    bytes <= CH1_MOBILE_DEBT,
    `Ch1's mobile payload is ${bytes} B. It is already ${CH1_MOBILE_DEBT - CH1_MOBILE_LIMIT} B ` +
      `over the ${CH1_MOBILE_LIMIT} B Regime-B mobile line and may not grow further until a ` +
      '1K-variant path exists. See the block above before touching this number.',
  );
  assert.ok(
    CH1_MOBILE_DEBT > CH1_MOBILE_LIMIT,
    'the debt constant exists only because the budget line is unmet; if it ever drops to or ' +
      'below the line, delete it and assert CH1_MOBILE_LIMIT directly',
  );
});

/* -------------------------------------------------------------- span mirror (CHK-W9) --- */

test('FULL-mode section spans mirror CHAPTER_SPANS_VH element by element (CHK-W9)', () => {
  const css = fs
    .readFileSync(path.join(ROOT, 'src/styles/shell.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ''); // prose about a value must not satisfy the gate

  const declared = [...css.matchAll(/html\[data-mode='full'\]\s+#ch(\d)\s*\{([^}]*)\}/g)].map(
    ([, id, body]) => {
      const m = body.match(/min-height:\s*(\d+)vh/);
      assert.ok(m, `#ch${id}'s FULL-mode rule must declare its span as a min-height`);
      return { id: Number(id), vh: Number(m[1]) };
    },
  );

  assert.equal(declared.length, CHAPTER_SPANS_VH.length, 'one span rule per chapter');
  assert.deepEqual(
    declared.map((d) => d.id),
    CHAPTER_SPANS_VH.map((_, i) => i + 1),
    'in story order — the mirror is positional, so the order of the rules is the mapping',
  );

  // Seven named comparisons, so a break says which chapter moved rather than dumping arrays.
  for (const [i, span] of CHAPTER_SPANS_VH.entries()) {
    assert.equal(
      declared[i].vh,
      span,
      `#ch${i + 1}: shell.css says ${declared[i].vh}vh, CHAPTER_SPANS_VH says ${span}vh. The ` +
        'sum gate in shellLayout.test.ts cannot see this: any permutation of the seven still ' +
        'totals 740 while every beat percentage in the site silently re-maps.',
    );
  }
});
