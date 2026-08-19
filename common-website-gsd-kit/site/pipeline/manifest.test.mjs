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
  const table = rows.find((r) => r.id === 'WoodenTable_02');
  assert.ok(table, 'WoodenTable_02 row missing');
  assert.strictEqual(table.ceiling_bytes, 2_500_000);
  assert.strictEqual(table.ceiling_tris, 30_000);
  const lamp = rows.find((r) => r.id === 'desk_lamp_arm_01');
  assert.strictEqual(lamp.ceiling_bytes, 1_500_000);
  assert.strictEqual(lamp.ceiling_tris, 10_000);
  const hdri = rows.find((r) => r.id === 'qwantani_sunrise_puresky');
  assert.ok(hdri, 'qwantani_sunrise_puresky row missing');
  assert.strictEqual(hdri.category, 'hdri');
  assert.strictEqual(hdri.ceiling_bytes, 2_000_000);
  assert.strictEqual(hdri.ceiling_tris, null);
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
test('every file under public/assets has a manifest row (post-ingest invariant)', (t) => {
  const assetsDir = 'public/assets';
  if (!fs.existsSync(assetsDir)) { t.skip('public/assets not created yet (pre-Task-2)'); return; }
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, 'manifest.json'), 'utf8'));
  const ids = new Set(manifest.map((r) => r.id));
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'manifest.json') continue;
    assert.ok(ids.has(e.name), `public/assets/${e.name} has no manifest row`);
  }
  for (const row of manifest) {
    if (/^CC BY/.test(row.license)) {
      assert.ok(row.attribution && row.attribution.trim().length > 0, `${row.id}: CC BY row with empty attribution`);
    }
  }
});
