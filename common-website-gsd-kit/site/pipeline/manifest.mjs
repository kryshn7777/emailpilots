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
 * Rows are recognized mechanically: inside a known section, a table row carrying
 * an https URL in one of its cells. This skips headers, separators, and the
 * decimation-plan subsection table (whose cells carry no URL).
 *
 * Columns are located RELATIVE TO THE URL CELL, never by index. Ruling 9 §4 added
 * a `Real size (mm)` column to the Models table and left HDRIs/PBR at seven, and
 * an index-addressed parser answered that by dropping all fourteen model rows in
 * silence — a red suite and, one command later, `emitManifest: no ledger row for
 * ingested asset`. The ledger is prose the scene-director edits; a parser that
 * breaks when a column is added is a parser that will break again.
 */
const cellsOf = (line) => line.split('|').slice(1, -1).map((c) => c.trim());

export function parseLedger(assetsMdPath) {
  const lines = fs.readFileSync(assetsMdPath, 'utf8').split(/\r?\n/);
  let category = null;
  let column = null; // header name -> index, for the table currently being read
  const rows = [];
  const find = (header, re) => header.findIndex((h) => re.test(h));
  for (const [i, line] of lines.entries()) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      const t = heading[1];
      category = /^Models/.test(t) ? 'model' : /^HDRIs/.test(t) ? 'hdri' : /^PBR/.test(t) ? 'pbr' : null;
      column = null;
      continue;
    }
    if (!category || !line.startsWith('|')) continue;
    // Markdown's own definition of a header row: the line above the `|---|` separator.
    if (/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) {
      const header = cellsOf(line);
      column = {
        name: find(header, /^asset$/i),
        url: find(header, /source\s*url/i),
        license: find(header, /license/i),
        attribution: find(header, /attribution/i),
        target: find(header, /optimi[sz]ed\s*target/i),
      };
      continue;
    }
    if (column === null || column.url === -1) continue;
    const cells = cellsOf(line);
    const source_url = cells[column.url] ?? '';
    if (!/^https:\/\//.test(source_url)) continue;
    const target = cells[column.target] ?? '';
    const attribution = cells[column.attribution] ?? '';
    const mb = target.match(/≤\s*([\d.]+)\s*MB/);
    const tris = target.match(/≤\s*([\d,]+)K\s*tris/);
    const tex = target.match(/(\d+)K\s*(?:→\s*)?KTX2|(\d+)K→KTX2/);
    rows.push({
      id: source_url.replace(/\/+$/, '').split('/').pop(),
      name: (cells[column.name] ?? '').replace(/\s*\[(V|I)\]\s*$/, ''),
      category,
      source_url,
      license: cells[column.license] ?? '',
      attribution_required: /REQUIRED/.test(attribution),
      attribution, // verbatim ledger column; colophon-grade credit text refines at CC-BY ingest
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
