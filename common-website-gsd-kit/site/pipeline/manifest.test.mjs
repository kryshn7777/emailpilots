/**
 * manifest.mjs unit tests — ledger parsing + manifest contract (02-04, FND-05, D2-18).
 * parseLedger reads docs/direction/ASSETS.md (the single source of ceilings + licenses);
 * emitManifest's output is the contract the Ch7 colophon and Phase-6 audit read.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseLedger, emitManifest } from './manifest.mjs';

const LEDGER = 'docs/direction/ASSETS.md';
const SKETCHFAB_UIDS = [
  '303f54d7a6e84aad9af3f341c2fa4ad7', // Papers & Envelopes (bossdeff)
  '73faa986225f4241809b922f92a48884', // Envelope (Multipainkiller_Studio)
];

test('parseLedger returns >= 13 model/HDRI rows from the real ASSETS.md', () => {
  const rows = parseLedger(LEDGER);
  const modelHdri = rows.filter((r) => r.category === 'model' || r.category === 'hdri');
  assert.ok(modelHdri.length >= 13, `expected >= 13 model/hdri rows, got ${modelHdri.length}`);
});

test('every parsed row has license + source_url + numeric ceiling_bytes', () => {
  const rows = parseLedger(LEDGER);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.license && typeof r.license === 'string', `${r.id}: missing license`);
    assert.match(r.source_url, /^https:\/\//, `${r.id}: missing/insecure source_url`);
    assert.ok(Number.isFinite(r.ceiling_bytes) && r.ceiling_bytes > 0, `${r.id}: ceiling_bytes not numeric (${r.ceiling_bytes})`);
  }
});

test('both Sketchfab envelope rows are CC BY with attribution required + non-empty text', () => {
  const rows = parseLedger(LEDGER);
  for (const uid of SKETCHFAB_UIDS) {
    const row = rows.find((r) => r.id.includes(uid));
    assert.ok(row, `no row for Sketchfab uid ${uid}`);
    assert.match(row.license, /^CC BY/, `${row.id}: expected CC BY license, got ${row.license}`);
    assert.strictEqual(row.attribution_required, true, `${row.id}: attribution_required must be true`);
    assert.ok(row.attribution && row.attribution.trim().length > 0, `${row.id}: attribution text empty`);
  }
});

test('known ledger ceilings parse to the documented values', () => {
  const rows = parseLedger(LEDGER);
  // `wooden_table_02`, lowercase — Serhii Khromov's 1134 mm table. NOT `WoodenTable_02`,
  // Fran Calvente's 300 mm side table, which Ruling 9 F1 struck. The two slugs differ only
  // in case, and the ledger row carries the warning; this is the mechanical half of it.
  const table = rows.find((r) => r.id === 'wooden_table_02');
  assert.ok(table, 'wooden_table_02 row missing');
  assert.strictEqual(
    rows.find((r) => r.id === 'WoodenTable_02'),
    undefined,
    'the struck side-table row must be gone from the ledger, not merely superseded',
  );
  assert.strictEqual(table.ceiling_bytes, 2_500_000);
  assert.strictEqual(table.ceiling_tris, 1_000);
  const lamp = rows.find((r) => r.id === 'desk_lamp_arm_01');
  assert.strictEqual(lamp.ceiling_bytes, 1_500_000);
  assert.strictEqual(lamp.ceiling_tris, 10_000);
  const hdri = rows.find((r) => r.id === 'qwantani_sunrise_puresky');
  assert.ok(hdri, 'qwantani_sunrise_puresky row missing');
  assert.strictEqual(hdri.category, 'hdri');
  assert.strictEqual(hdri.ceiling_bytes, 2_000_000);
  assert.strictEqual(hdri.ceiling_tris, null);
});

/**
 * Ruling 9 §4 added a `Real size (mm)` column to the Models table — and every model row
 * vanished from the parse, because `parseLedger` read the source URL from `cells[2]` and the
 * ceiling from `cells[6]` by POSITION. The Models table became 8 columns while HDRIs and PBR
 * stayed at 7, so the URL test failed on every model row and the whole section was skipped
 * in silence: three suites red, and the next `node pipeline/ingest.mjs` would have died on
 * `emitManifest: no ledger row for ingested asset "alarm_clock_01"`.
 *
 * The gate is written against a FIXTURE rather than the real ledger on purpose: asserting
 * "the real file parses today" cannot tell a fixed parser from a reverted column. Two tables
 * describing the same asset, one with an extra leading column, must parse identically.
 */
test('parseLedger locates columns by content, not by position (Ruling 9 column drift)', (t) => {
  const header7 = '| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |';
  const header8 = '| Scene(s) | Asset | Real size (mm) | Source URL | License | Attribution | Est. original | Optimized target |';
  const sep = (n) => '|' + '---|'.repeat(n);
  const row7 = '| 1-7 | Widget 01 [V] | https://polyhaven.com/a/widget_01 | CC0 | None (courtesy) | ~20 MB | \u2264 2.5 MB, \u2264 1K tris, 2K KTX2 |';
  const row8 = '| 1-7 | Widget 01 [V] | 1134.4 \u00d7 706.0 \u00d7 799.5 | https://polyhaven.com/a/widget_01 | CC0 | None (courtesy) | ~20 MB | \u2264 2.5 MB, \u2264 1K tris, 2K KTX2 |';
  const write = (name, header, row) => {
    const file = path.join('pipeline', 'fixtures', name);
    const body = ['## Models', '', header, sep(header.split('|').length - 2), row, ''];
    fs.writeFileSync(file, body.join('\n'));
    return file;
  };
  const a = write(`.cols7-${process.pid}.md`, header7, row7);
  const b = write(`.cols8-${process.pid}.md`, header8, row8);
  t.after(() => { for (const f of [a, b]) { try { fs.unlinkSync(f); } catch {} } });

  const seven = parseLedger(a);
  const eight = parseLedger(b);
  assert.strictEqual(seven.length, 1, 'the 7-column control must parse its one row');
  assert.strictEqual(eight.length, 1, 'an added column must not delete the row');
  assert.deepStrictEqual(
    eight,
    seven,
    'a column inserted to the LEFT of the URL must change nothing the parser reports — ' +
      'ceilings, licence and attribution are all read relative to the URL cell',
  );
  assert.strictEqual(eight[0].source_url, 'https://polyhaven.com/a/widget_01');
  assert.strictEqual(eight[0].license, 'CC0');
  assert.strictEqual(eight[0].ceiling_bytes, 2_500_000);
  assert.strictEqual(eight[0].ceiling_tris, 1_000);
  assert.strictEqual(eight[0].texture_size, 2048);
});

/**
 * Ruling 9 §4: `[V]` gained a fourth component. Licence + tris + texture weight are three of
 * four now — the fourth is the asset's real-world size, and `[V]` is not writable while that
 * cell is empty. A 300 mm pedestal reached wave 3 marked `[V]` because nobody read the
 * `dimensions` field that shipped in the same API response as the polycount.
 */
test('every [V]-marked Models row carries a Real size (mm) cell (Ruling 9 §4)', () => {
  const models = fs.readFileSync(LEDGER, 'utf8').split(/^## /m).find((s) => s.startsWith('Models'));
  assert.ok(models, 'ASSETS.md must still have a Models section');
  const rows = models
    .split(/\r?\n/)
    .filter((l) => l.startsWith('|') && /https:\/\//.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  assert.ok(rows.length >= 13, `expected the full model ledger, got ${rows.length} rows`);
  let checked = 0;
  for (const cells of rows) {
    if (!/\[V\]/.test(cells[1])) continue; // [I] rows are inventory-proven, not API-verified
    checked++;
    const size = cells[2];
    assert.ok(
      size.length > 0 && !/^[-\u2014]$/.test(size),
      `${cells[1]}: marked [V] with an empty Real size (mm) cell. [V] has four components ` +
        'now, not three (Ruling 9 \u00a74) — fill the size from the source\u2019s own ' +
        'published metadata, or drop the mark.',
    );
  }
  assert.ok(checked >= 8, `only ${checked} [V] rows were reached — the column moved again`);
});

test('emitManifest writes one row per result, carrying ceiling_bytes + license, CC BY needs attribution', (t) => {
  const rows = [
    { id: 'a1', category: 'model', source_url: 'https://x/a1', license: 'CC0', attribution_required: false, attribution: 'None (courtesy)', ceiling_bytes: 100, ceiling_tris: null },
    { id: 'b2', category: 'model', source_url: 'https://x/b2', license: 'CC BY 4.0', attribution_required: true, attribution: 'REQUIRED — credit', ceiling_bytes: 200, ceiling_tris: null },
  ];
  const results = [
    { id: 'a1', file: 'a1/a1.glb', bytes_original: 500, bytes_optimized: 90, ingested: '2026-08-19' },
    { id: 'b2', file: 'b2/b2.glb', bytes_original: 900, bytes_optimized: 150, ingested: '2026-08-19' },
  ];
  const out = path.join('pipeline', 'fixtures', `.manifest-test-${process.pid}.json`);
  t.after(() => { try { fs.unlinkSync(out); } catch {} });
  emitManifest(rows, results, out);
  const manifest = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(manifest.length, 2);
  for (const row of manifest) {
    assert.ok(row.license && row.source_url);
    assert.ok(Number.isFinite(row.ceiling_bytes), 'manifest row must carry ceiling_bytes');
    assert.ok(Number.isFinite(row.bytes_original) && Number.isFinite(row.bytes_optimized));
    if (/^CC BY/.test(row.license)) {
      assert.ok(row.attribution && row.attribution.trim().length > 0, 'CC BY manifest row must carry non-empty attribution');
    } else {
      assert.strictEqual(row.attribution, null, 'non-CC-BY rows carry null attribution');
    }
  }
});

test('emitManifest refuses a CC BY result whose ledger row lacks attribution text', () => {
  const rows = [{ id: 'bad', category: 'model', source_url: 'https://x/bad', license: 'CC BY 4.0', attribution_required: true, attribution: '', ceiling_bytes: 10, ceiling_tris: null }];
  const results = [{ id: 'bad', file: 'bad/bad.glb', bytes_original: 1, bytes_optimized: 1, ingested: '2026-08-19' }];
  assert.throws(() => emitManifest(rows, results, path.join('pipeline', 'fixtures', '.never-written.json')));
});

// Post-Task-2 invariant: everything shipped under public/assets is manifest-covered,
// and every CC BY manifest row carries non-empty attribution. Skips cleanly before
// the first real ingest (public/assets absent).
/**
 * Directories under public/assets that ASSETS.md's §First-party table claims by path. These
 * deliberately carry NO manifest row: manifest.json is the licensing/attribution surface the Ch7
 * colophon and the Phase-6 audit read, and a first-party output has no attribution obligation
 * (03-08 T-03-04). The exemption is granted by the ledger, never by this test — an orphaned
 * *licensed* asset still fails the invariant below.
 */
function firstPartyDirs(assetsMdPath) {
  const section = fs.readFileSync(assetsMdPath, 'utf8').split(/^## /m).find((s) => s.startsWith('First-party assets')) ?? '';
  return new Set([...section.matchAll(/public\/assets\/([A-Za-z0-9._-]+)\//g)].map((m) => m[1]));
}

test('every file under public/assets has a manifest row (post-ingest invariant)', (t) => {
  const assetsDir = 'public/assets';
  if (!fs.existsSync(assetsDir)) { t.skip('public/assets not created yet (pre-Task-2)'); return; }
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, 'manifest.json'), 'utf8'));
  const ids = new Set(manifest.map((r) => r.id));
  const firstParty = firstPartyDirs(LEDGER);
  for (const dir of firstParty) {
    assert.ok(fs.existsSync(path.join(assetsDir, dir)), `ASSETS.md exempts public/assets/${dir}/ but it does not exist`);
  }
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'manifest.json' || firstParty.has(e.name)) continue;
    assert.ok(ids.has(e.name), `public/assets/${e.name} has no manifest row`);
  }
  for (const row of manifest) {
    if (/^CC BY/.test(row.license)) {
      assert.ok(row.attribution && row.attribution.trim().length > 0, `${row.id}: CC BY row with empty attribution`);
    }
  }
});
