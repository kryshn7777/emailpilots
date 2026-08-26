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
 *  3. **Span mirror (CHK-W9).** The seven span values are pinned twice already, and both
 *     pins are to a *private literal copy*: `beats.test.ts` holds `CHAPTER_SPANS_VH`
 *     against `[90,100,120,140,110,110,70]`, and `shellLayout.test.ts` holds the seven
 *     FULL-mode `min-height` declarations against a second, independent
 *     `[90,100,120,140,110,110,70]`. Each pair is self-consistent, and **nothing compares
 *     the stylesheet to the constant the island actually scrubs against.** A STORYBOARD
 *     amendment that moves a span touches four files; update the CSS with its literal, and
 *     the constant with its literal, and transpose one of the two edits, and both existing
 *     suites stay green while every chapter's scroll range is re-mapped. The gate below is
 *     that missing edge — CSS read against the constant, element by element — and it is
 *     the one place in the project that must never write the seven numbers down, because a
 *     third copy would make it exactly as blind as the two it exists to join up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CH1_STREAMED, CHAPTER_ASSETS, nextPrefetch } from './chapterAssets.ts';
import { PROP_SOURCES } from '../set/props.ts';
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

/**
 * Every url any batch declares. `CH1_STREAMED` is not a chapter manifest — it is the half of
 * Ch1's object list that arrives BEHIND the handoff (see the Regime-B block below) — but its
 * bytes are fetched, licensed and shipped exactly like a manifest row, so it is held to the
 * same disk / licence / byte checks. Only the Regime-B critical sum tells them apart.
 */
const ALL_DECLARED = [...CHAPTER_ASSETS.flat(), ...CH1_STREAMED];

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
  // Equality, not containment. Containment alone leaves the hole the other way round: an
  // asset the entry streams as `critical` but Ch1's manifest never declares is on the
  // critical path AND invisible to the Regime-B gate below, which is the one number that
  // gate exists to measure.
  assert.deepEqual(
    [...byUrl.keys()].sort(),
    CHAPTER_ASSETS[0].map((a) => a.url).sort(),
    "the loader's critical batch and Ch1's manifest are two spellings of one set",
  );
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
 * `.planning/BUDGETS.md` §Payload budgets, Regime B — "Ch1 critical path (to interactive)".
 * Decimal MB, the stricter reading of the two.
 *
 * ## The split this gate forced (03-09)
 *
 * The desktop line is a **ratchet**, and it did its job. Ch1's storyboard object list is the
 * desk, the chair, the lamp, the clock, five pieces of dressing, the floor set and Paper001.
 * Declared as one pre-handoff batch that is **16,700,829 B** against a 9,000,000 B line —
 * `WoodenChair_01` + `Paper001` alone (3,865,631 B) already exceed the headroom that existed
 * before this plan. So Ch1's objects are split by what the OPENING FRAME needs, which is what
 * "to interactive" means and what the line actually measures:
 *
 * - **`CHAPTER_ASSETS[0]` — the critical path.** Both Qwantani skies (Ch1 holds the pair
 *   `(sunrise, dusk2)` at mix 0.00 until 95%, so both are PMREM'd at mount), `WoodenTable_02`
 *   (the desk IS the origin — every prop anchor and every authored camera pose is measured
 *   off its top face, so the Room cannot be built without it) and `desk_lamp_arm_01` (the
 *   light rig is constructed once, and the lamp's key and its pool are posed on its head).
 * - **`CH1_STREAMED` — behind the handoff.** Ch1 opens on an ECU 8 cm above the letter
 *   (`cameraRig.ts` ECU_LETTER) and the pull-wide does not start until 48% of a 90vh chapter.
 *   The chair, the clock, the four dressing props, the shelf and the floor's KTX2 set are
 *   none of them in that frame, and they have most of a chapter to arrive. They ride
 *   `AssetQueue`'s existing `'lazy'` priority, which no other caller uses and which — like
 *   `'soon'` — is excluded from the loader percent by weight.
 *
 * Paper001 is in neither: 03-11 builds the letter sheet, and this file's growth rule is that
 * a plan declares what its own code fetches.
 *
 * ## The mobile line is retired (BUDGETS §Amendments B2, 2026-08-26)
 *
 * The mobile column of this row was **retired by the project owner** on the escalation 03-05
 * raised: the island has no per-tier asset selection, the 1K prop-set variants STORYBOARD
 * authors were never ingested, and the product is a Windows desktop application a phone
 * visitor cannot install. B2 states outright that "the zero-headroom gate 03-05 recorded
 * against it is superseded" and that the desktop line is "the one to gate against".
 *
 * The assertion below is therefore **kept as a ratchet, not as a budget line** — the number
 * stays recorded so it cannot grow unnoticed, and B2's own retirement figure (6,649,520 B)
 * stays legible beside the smaller one this split produced. Deleting it would lose the only
 * live record of what mobile actually costs; asserting 5,000,000 would paint the build red
 * describing work B2 explicitly told executors to stop attempting.
 */
const CH1_DESKTOP_LIMIT = 9_000_000;
/** Retired by B2. Kept so the ratchet below can say what it is a ratchet against. */
const CH1_MOBILE_LIMIT = 5_000_000;
/** B2's recorded-at-retirement figure — Ch1's critical path before 03-09 split it. */
const CH1_MOBILE_AT_RETIREMENT = 6_649_520;
/**
 * What the same sum measures today. Mobile streams the same bytes desktop does.
 *
 * 5,653,052 -> **5,433,608** on 2026-08-26: Ruling 9 F1 swapped `WoodenTable_02` (2,241,096 B)
 * for `wooden_table_02` (2,021,652 B), the only critical-path row either ruling touched.
 * The ratchet records what mobile costs; it is not a target being closed. B2 retired the
 * line, and no per-tier asset selection was invented here or anywhere else.
 */
const CH1_MOBILE_RATCHET = 5_433_608;
/** BUDGETS §Regime B, "Total streamed asset weight (full journey)" — desktop, live. */
const JOURNEY_DESKTOP_LIMIT = 30_000_000;

test('Ch1 critical path holds the Regime-B desktop line (CHK-W1)', () => {
  const bytes = CHAPTER_ASSETS[0].reduce((sum, a) => sum + a.bytes, 0);
  assert.ok(
    bytes <= CH1_DESKTOP_LIMIT,
    `Ch1 critical path is ${bytes} B against the ${CH1_DESKTOP_LIMIT} B desktop build gate ` +
      `(${CH1_DESKTOP_LIMIT - bytes} B of headroom before this run). Adding a Ch1 asset that ` +
      'breaks this is a plan decision — move the row to CH1_STREAMED, cut it, or amend ' +
      'BUDGETS. It is never a code-time shrug (D-15).',
  );
});

test('the streamed batch is behind the handoff, not a second critical path', () => {
  const critical = new Set(CHAPTER_ASSETS[0].map((a) => a.url));
  for (const asset of CH1_STREAMED) {
    assert.equal(
      critical.has(asset.url),
      false,
      `${asset.url} is in both batches. AssetQueue keeps the FIRST declaration's priority, ` +
        'so a url in both is fetched at whichever the entry happened to add first — and the ' +
        'Regime-B sum above would then measure a different set than the one actually loading.',
    );
  }
  assert.ok(CH1_STREAMED.length > 0, 'the split is a real second batch, not an empty gesture');
});

test('the whole authored journey holds the Regime-B streamed-weight line', () => {
  const bytes = ALL_DECLARED.reduce((sum, a) => sum + a.bytes, 0);
  assert.ok(
    bytes <= JOURNEY_DESKTOP_LIMIT,
    `every declared asset sums ${bytes} B against the ${JOURNEY_DESKTOP_LIMIT} B full-journey ` +
      `line (${JOURNEY_DESKTOP_LIMIT - bytes} B of headroom). Splitting Ch1 moves bytes off ` +
      'the critical path — it does not make them free, and until this ran nothing measured ' +
      'the total at all.',
  );
});

test('Ch1 mobile payload does not grow past the recorded figure (superseded by B2)', () => {
  // The same sum as desktop: there is no per-tier asset selection anywhere in the island,
  // and B2 ruled that there will not be one in this phase. When one lands, this filter is
  // where it goes — and by then this test is a candidate for deletion, not for promotion.
  const bytes = CHAPTER_ASSETS[0].reduce((sum, a) => sum + a.bytes, 0);
  assert.ok(
    bytes <= CH1_MOBILE_RATCHET,
    `Ch1's mobile payload is ${bytes} B against a ratchet of ${CH1_MOBILE_RATCHET} B. The ` +
      `${CH1_MOBILE_LIMIT} B Regime-B mobile line was retired by BUDGETS §Amendments B2 — ` +
      'do not try to close it, and do not raise this number to make room for an asset the ' +
      'desktop line would also have to pay for.',
  );
  assert.ok(
    CH1_MOBILE_RATCHET < CH1_MOBILE_AT_RETIREMENT,
    'the split moved the clock off the critical path, so the ratchet must sit below B2’s ' +
      'recorded-at-retirement figure; if it ever equals it again, the split was undone ' +
      'rather than extended',
  );
});

/**
 * Ruling 9 F4: *"Ingest only — do not add it to `CHAPTER_ASSETS[0]`; it belongs to Ch4
 * (plan 03-15) and must not spend Ch1's critical-path budget."* A10 makes the cabinet a
 * room fixture from Ch2 onward, so the chapter that first shows it declares it — and until
 * then no batch may, which is the half a growth rule cannot express on its own.
 */
test('the sourced do-not-send cabinet is ingested but declared by no batch yet (F4)', () => {
  const url = 'assets/vintage_wooden_drawer_01/vintage_wooden_drawer_01.glb';
  assert.ok(
    fs.existsSync(path.join(ASSETS_DIR, url.slice('assets/'.length))),
    'vintage_wooden_drawer_01 must be ingested — Ruling 9 F4 strikes the procedural box it ' +
      'replaces, so Ch4 has nothing to open until this lands',
  );
  assert.ok(licenceRowFor(url), 'and covered by a licensing row like every shipped asset');
  assert.equal(
    ALL_DECLARED.some((a) => a.url === url),
    false,
    'but no batch declares it yet. Ch1 opens on an ECU 8 cm above the letter and never ' +
      'shows a filing cabinet; 1,144,480 B on the critical path for an object outside the ' +
      'frame is the exact trade the Regime-B split exists to refuse.',
  );
});

test('the struck mis-cast assets are declared by no batch and gone from disk (F1/F2)', () => {
  for (const struck of ['WoodenTable_02', 'WoodenChair_01']) {
    assert.equal(
      fs.existsSync(path.join(ASSETS_DIR, struck)),
      false,
      `public/assets/${struck} still ships. Ruling 9 replaced it; a shipped asset nothing ` +
        'places is dead weight in the repo and a live invitation to re-declare it.',
    );
    assert.equal(
      MANIFEST.some((r) => r.id === struck),
      false,
      `manifest.json still carries a row for ${struck}`,
    );
    assert.equal(
      ALL_DECLARED.some((a) => a.url.includes(struck)),
      false,
      `a batch still declares ${struck}`,
    );
  }
  // Non-vacuous: the replacements must be present by the same three measures.
  for (const live of ['wooden_table_02', 'painted_wooden_chair_01']) {
    assert.ok(fs.existsSync(path.join(ASSETS_DIR, live)), `${live} must ship`);
    assert.ok(MANIFEST.some((r) => r.id === live), `${live} must have a manifest row`);
    assert.ok(ALL_DECLARED.some((a) => a.url.includes(live)), `${live} must be declared`);
  }
});

test('every prop the set places is paid for by a declared batch', () => {
  const declared = new Set(ALL_DECLARED.map((a) => a.url));
  for (const [id, url] of Object.entries(PROP_SOURCES)) {
    assert.ok(
      declared.has(url),
      `${id} (${url}) is placed by Room but declared by no batch. A prop nobody fetches is ` +
        'a prop that is never in frame, and the byte cost of one that IS would be invisible ' +
        'to every gate above.',
    );
  }
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
      `#ch${i + 1}: shell.css says ${declared[i].vh}vh, CHAPTER_SPANS_VH says ${span}vh. ` +
        'Neither existing suite can see this — each holds its own artifact against its own ' +
        'literal copy of the seven numbers, so the stylesheet and the constant can drift ' +
        'apart as two internally consistent pairs while both stay green.',
    );
  }
});
