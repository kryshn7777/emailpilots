/**
 * ingest.mjs gate self-test (02-04, FND-05, D2-17) — proves fail-closed behavior forever.
 * Runs the real CLI against the over-ceiling fixture (1-byte ceiling): the full chain runs,
 * the bytes gate must FAIL with exit code != 0, and nothing may land in public/assets.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

test('over-ceiling fixture fails ingest closed: exit != 0, nothing shipped', () => {
  const r = spawnSync(process.execPath, ['pipeline/ingest.mjs', '--fixture', 'over-ceiling'], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.notStrictEqual(r.status, 0, `expected non-zero exit, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  // The failure must be the mechanical bytes gate, not an incidental crash.
  assert.match(r.stderr, /GATE FAIL .*bytes/, `bytes gate did not report:\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const entries = fs.existsSync('public/assets') ? fs.readdirSync('public/assets') : [];
  const leaked = entries.filter((e) => e.includes('fixture'));
  assert.strictEqual(leaked.length, 0, `fixture output leaked into public/assets: ${leaked.join(', ')}`);
});
