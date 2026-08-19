/**
 * Fixture ledger rows for the ingest gate self-test (02-04).
 * over-ceiling: a valid 696-byte single-triangle GLB against a 1-byte ceiling —
 * the full chain runs, then the bytes gate MUST fail closed (exit 1, nothing shipped).
 */
export const FIXTURE_ROWS = [
  {
    id: 'fixture-over-ceiling',
    name: 'Over-ceiling gate fixture',
    category: 'model',
    source_url: 'https://example.invalid/fixture-over-ceiling',
    license: 'CC0',
    attribution_required: false,
    attribution: 'None (test fixture)',
    ceiling_bytes: 1, // any real output is over this — proves fail-closed forever
    ceiling_tris: null,
    texture_size: null,
    source_path: 'pipeline/fixtures/over-ceiling.glb',
  },
];
