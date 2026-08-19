/**
 * manifest.mjs — ASSETS.md ledger parser + licensing-manifest emitter (02-04, FND-05, D2-18).
 *
 * parseLedger: docs/direction/ASSETS.md is the single source of ceilings + licenses.
 * The Models / HDRIs / PBR markdown tables become row objects; the per-row
 * "Optimized target" ceilings are Regime-A ingest gates (BUDGETS.md), never
 * shipping predictions.
 *
 * emitManifest: writes public/assets/manifest.json — one row per shipped file.
 * SHAPE IS A CONTRACT: the Ch7 colophon (Phase 5) and the Phase-6 licensing
 * audit read this file. Every CC BY row must carry non-empty attribution.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Ledger MB are decimal (1 MB = 1,000,000 B) — the stricter reading of "≤ N MB". */
const MB = 1_000_000;

/**
 * Parse the Models / HDRIs / PBR texture-set tables of the assets ledger.
 * Returns rows: { id, name, category, source_url, license, attribution_required,
 * attribution, ceiling_bytes, ceiling_tris, texture_size }.
 * Rows are recognized mechanically: inside a known section, a 7-cell table row
 * whose Source URL cell is an https URL. This skips headers, separators, and
 * the decimation-plan subsection table (whose cells carry no URL).
 */
export function parseLedger(assetsMdPath) {
  const text = fs.readFileSync(assetsMdPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let category = null;
  const rows = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      const t = heading[1];
      category = /^Models/.test(t) ? 'model' : /^HDRIs/.test(t) ? 'hdri' : /^PBR/.test(t) ? 'pbr' : null;
      continue;
    }
    if (!category || !line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const source_url = cells[2];
    if (!/^https:\/\//.test(source_url)) continue;
    const target = cells[6];
    const mb = target.match(/≤\s*([\d.]+)\s*MB/);
    const tris = target.match(/≤\s*([\d,]+)K\s*tris/);
    const tex = target.match(/(\d+)K\s*(?:→\s*)?KTX2|(\d+)K→KTX2/);
    rows.push({
      id: source_url.replace(/\/+$/, '').split('/').pop(),
      name: cells[1].replace(/\s*\[(V|I)\]\s*$/, ''),
      category,
      source_url,
      license: cells[3],
      attribution_required: /REQUIRED/.test(cells[4]),
      attribution: cells[4], // verbatim ledger column; colophon-grade credit text refines at CC-BY ingest
      ceiling_bytes: mb ? Math.round(parseFloat(mb[1]) * MB) : null,
      ceiling_tris: tris ? parseInt(tris[1].replace(/,/g, ''), 10) * 1000 : null,
      texture_size: tex ? parseInt(tex[1] ?? tex[2], 10) * 1024 : null,
    });
  }
  return rows;
}

/**
 * Emit public/assets/manifest.json from ledger rows + ingest results.
 * results: [{ id, file, bytes_original, bytes_optimized, ingested }] — only
 * gate-passing assets may appear here (ingest.mjs enforces fail-closed).
 * Throws if a result has no ledger row, or a CC BY row lacks attribution text
 * (licensing obligations can never be silently dropped — T-02-12).
 */
export function emitManifest(rows, results, outPath = path.join('public', 'assets', 'manifest.json')) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const manifest = results
    .map((res) => {
      const row = byId.get(res.id);
      if (!row) throw new Error(`emitManifest: no ledger row for ingested asset "${res.id}"`);
      const isCcBy = /^CC BY/i.test(row.license);
      if (isCcBy && !(row.attribution && row.attribution.trim())) {
        throw new Error(`emitManifest: CC BY row "${res.id}" has empty attribution text`);
      }
      return {
        id: res.id,
        file: res.file,
        source_url: row.source_url,
        license: row.license,
        attribution: isCcBy ? row.attribution : null,
        bytes_original: res.bytes_original,
        bytes_optimized: res.bytes_optimized,
        ceiling_bytes: row.ceiling_bytes,
        ingested: res.ingested,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
