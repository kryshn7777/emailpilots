/**
 * ingest.mjs — manifest-driven asset pipeline with fail-closed Regime-A gates
 * (02-04, FND-05, D2-17, D-12).
 *
 * CLI: node pipeline/ingest.mjs [asset-id...]        (no args = all ledger rows
 *      with sources present in assets-source/)
 *      node pipeline/ingest.mjs --fixture over-ceiling   (gate self-test rows)
 *
 * Regime A (BUDGETS.md): per-row ledger ceilings are per-asset ingest gates.
 * An asset still over its ceiling after the full chain is "not available" —
 * the process exits 1 and nothing lands in public/assets. Raw downloads live
 * only in gitignored assets-source/ and can never ship (D2-01/D2-07).
 *
 * Per-asset config shape note — Q2 reserved slot: rows will grow an `inkSdf`
 * bake entry when the ink-reveal SDF bake tooling lands in Phase 3 (D2-16).
 * Only the slot is reserved here; no bake code in Phase 2.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { parseLedger, emitManifest } from './manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEDGER = path.join(ROOT, 'docs', 'direction', 'ASSETS.md');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const SOURCE_DIR = path.join(ROOT, 'assets-source');
const WORK_DIR = path.join(SOURCE_DIR, '.work'); // gitignored with its parent
const MANIFEST_PATH = path.join(ASSETS_DIR, 'manifest.json');
const GLTF_CLI = fileURLToPath(new URL('../node_modules/@gltf-transform/cli/bin/cli.js', import.meta.url));

// Rigged/articulated rows (ASSETS.md §Source polycounts & decimation plan):
// desk_lamp_arm_01 is skinned; alarm_clock_01 carries named hand nodes. These
// NEVER go through the one-shot `optimize` command — its join/flatten/palette
// defaults collapse the node graph and merge named meshes, which destroys rigs
// (research Pattern 5 / Pitfall 3). They take the per-command rig-safe chain.
const RIGGED = new Set(['desk_lamp_arm_01', 'alarm_clock_01']);

/** Spawn one gltf-transform CLI command; any non-zero exit aborts the ingest. */
function run(args) {
  const r = spawnSync(process.execPath, [GLTF_CLI, ...args], { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
  if (r.status !== 0) throw new Error(`gltf-transform ${args[0]} failed (exit ${r.status})`);
}

/** Read tri count, skin count, and sorted named-node list via NodeIO (pre-meshopt/pre-KTX2 files only). */
async function readStats(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  }
  return {
    tris,
    skins: root.listSkins().length,
    namedNodes: root.listNodes().map((n) => n.getName()).filter(Boolean).sort(),
  };
}

function gateReport(id, label, detail, pass) {
  (pass ? console.log : console.error)(`[gate] ${id} ${label}: ${detail} — ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

/** Fail-closed: stderr reason, remove the asset's outputs from public/assets, exit 1 (D-12). */
function failClosed(id, gate, detail) {
  console.error(`GATE FAIL ${id} [${gate}]: ${detail} — asset "not available" (D-12), nothing ships`);
  fs.rmSync(path.join(ASSETS_DIR, id), { recursive: true, force: true });
  process.exit(1);
}

function makeWork(id) {
  const dir = path.join(WORK_DIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sameList(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function dirBytes(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === '.work') continue;
    total += dirBytes(path.join(p, e.name));
  }
  return total;
}

function findSource(row, exts) {
  if (row.source_path) return path.join(ROOT, row.source_path);
  const dir = path.join(SOURCE_DIR, row.id);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => exts.some((x) => f.toLowerCase().endsWith(x)));
  // prefer .gltf over .glb so external-resource sources resolve their textures
  files.sort((a, b) => exts.findIndex((x) => a.toLowerCase().endsWith(x)) - exts.findIndex((x) => b.toLowerCase().endsWith(x)));
  return files.length ? path.join(dir, files[0]) : null;
}

function hasSource(row) {
  if (row.source_path) return fs.existsSync(path.join(ROOT, row.source_path));
  const exts = row.category === 'hdri' ? ['.hdr'] : row.category === 'pbr' ? ['.png', '.jpg', '.jpeg'] : ['.gltf', '.glb'];
  return findSource(row, exts) != null || (row.category === 'pbr' && fs.existsSync(path.join(SOURCE_DIR, row.id)));
}

/**
 * Per-slot KTX2 passes shared by both model chains (D2-18 slot rules):
 * UASTC level 2 for normal/occlusion/metallicRoughness, ETC1S quality 128 for
 * the remaining color slots. Both commands spawn toktx (installed by 02-01).
 */
function texturePasses(input, work, resizeTo) {
  let cur = input;
  if (resizeTo) {
    const resized = path.join(work, 'resized.glb');
    run(['resize', cur, resized, '--width', String(resizeTo), '--height', String(resizeTo)]);
    cur = resized;
  }
  const u = path.join(work, 'uastc.glb');
  run(['uastc', cur, u, '--slots', '{normalTexture,occlusionTexture,metallicRoughnessTexture}', '--level', '2']);
  const out = path.join(work, 'final.glb');
  run(['etc1s', u, out, '--quality', '128']);
  return out;
}

/**
 * Static-prop chain: the one-shot command IS safe here (join/flatten/palette
 * reduce draw calls on unrigged props). Geometry compression is split out
 * (--compress false + explicit meshopt) so gate (b) reads a decoder-free
 * pre-meshopt intermediate. Texture sizing rides --texture-size (max-fit).
 */
function ingestStaticRow(row, srcFile, work, ratio) {
  const pre = path.join(work, 'pre.glb');
  run(["optimize", srcFile, pre,
    "--compress", "false",
    "--texture-compress", "false",
    "--texture-size", String(row.texture_size ?? 2048),
    "--simplify-ratio", String(ratio),
    "--simplify-error", "0.01"]);
  const packed = path.join(work, 'packed.glb');
  run(['meshopt', pre, packed]);
  return { intermediate: pre, final: texturePasses(packed, work, null) };
}

/**
 * Rig-safe chain (research Pattern 5): weld -> simplify --ratio --error 0.01 ->
 * meshopt -> per-slot KTX2. No join/flatten/palette anywhere on this path, so
 * skins and named nodes survive structurally; gate (c) then proves it.
 */
function ingestRiggedRow(row, srcFile, work, ratio) {
  const welded = path.join(work, 'welded.glb');
  run(['weld', srcFile, welded]);
  const simplified = path.join(work, 'simplified.glb');
  run(['simplify', welded, simplified, '--ratio', String(ratio), '--error', '0.01']);
  const packed = path.join(work, 'packed.glb');
  run(['meshopt', simplified, packed]);
  return { intermediate: simplified, final: texturePasses(packed, work, row.texture_size) };
}

async function ingestModelRow(row) {
  const srcFile = findSource(row, ['.gltf', '.glb']);
  if (!srcFile) throw new Error(`${row.id}: no .gltf/.glb source under assets-source/${row.id}/`);
  const src = await readStats(srcFile);
  const ratio = row.ceiling_tris ? Math.min(1, row.ceiling_tris / src.tris) : 1;
  console.log(`[source] ${row.id}: ${src.tris} tris, ${src.skins} skin(s), named nodes [${src.namedNodes.join(', ')}], ratio ${ratio.toFixed(4)}`);
  const work = makeWork(row.id);
  const rigged = RIGGED.has(row.id);
  const { intermediate, final } = rigged
    ? ingestRiggedRow(row, srcFile, work, ratio)
    : ingestStaticRow(row, srcFile, work, ratio);

  // Gates — all mechanical, on the pre-meshopt intermediate ((b),(c)) and final bytes (a).
  const mid = await readStats(intermediate);
  if (row.ceiling_tris != null) {
    if (!gateReport(row.id, 'tris', `${mid.tris} / ceiling ${row.ceiling_tris}`, mid.tris <= row.ceiling_tris)) {
      failClosed(row.id, 'tris', `${mid.tris} > ${row.ceiling_tris}`);
    }
  }
  if (rigged) {
    const skinsOk = mid.skins === src.skins;
    const nodesOk = sameList(mid.namedNodes, src.namedNodes);
    gateReport(row.id, 'rig', `skins ${src.skins}→${mid.skins}, namedNodes ${src.namedNodes.length}→${mid.namedNodes.length} (unchanged: ${nodesOk})`, skinsOk && nodesOk);
    if (!skinsOk) failClosed(row.id, 'rig', `skin count changed ${src.skins} → ${mid.skins}`);
    if (!nodesOk) failClosed(row.id, 'rig', `named-node set changed: [${src.namedNodes.join(', ')}] → [${mid.namedNodes.join(', ')}]`);
  }
  const bytes = fs.statSync(final).size;
  if (!gateReport(row.id, 'bytes', `${bytes} / ceiling ${row.ceiling_bytes}`, bytes <= row.ceiling_bytes)) {
    failClosed(row.id, 'bytes', `${bytes} > ${row.ceiling_bytes}`);
  }

  const destDir = path.join(ASSETS_DIR, row.id);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(final, path.join(destDir, `${row.id}.glb`));
  return {
    id: row.id,
    file: `${row.id}/${row.id}.glb`,
    bytes_original: row.source_path ? fs.statSync(path.join(ROOT, row.source_path)).size : dirBytes(path.join(SOURCE_DIR, row.id)),
    bytes_optimized: bytes,
    ingested: new Date().toISOString().slice(0, 10),
  };
}

/** HDRI rows ship as-is: assert 1K resolution + bytes ceiling, copy .hdr (PMREM happens at runtime). */
async function ingestHdriRow(row) {
  const srcFile = findSource(row, ['.hdr']);
  if (!srcFile) throw new Error(`${row.id}: no .hdr source under assets-source/${row.id}/`);
  const head = fs.readFileSync(srcFile).subarray(0, 512).toString('latin1');
  const dims = head.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  const width = dims ? parseInt(dims[2], 10) : NaN;
  if (!gateReport(row.id, 'resolution', `${width}px wide (want 1K = 1024)`, width === 1024)) {
    failClosed(row.id, 'resolution', `width ${width} != 1024 — never ship non-1K HDRIs (ASSETS.md rule)`);
  }
  const bytes = fs.statSync(srcFile).size;
  if (!gateReport(row.id, 'bytes', `${bytes} / ceiling ${row.ceiling_bytes}`, bytes <= row.ceiling_bytes)) {
    failClosed(row.id, 'bytes', `${bytes} > ${row.ceiling_bytes}`);
  }
  const destDir = path.join(ASSETS_DIR, row.id);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcFile, path.join(destDir, `${row.id}.hdr`));
  return {
    id: row.id,
    file: `${row.id}/${row.id}.hdr`,
    bytes_original: bytes,
    bytes_optimized: bytes,
    ingested: new Date().toISOString().slice(0, 10),
  };
}

/**
 * PBR texture-set rows: drop displacement/height maps (ASSETS.md rule — never
 * sampled), toktx-encode per slot rules (color → ETC1S, normal/rough/AO/metal →
 * UASTC), gate on the SUMMED bytes of the set.
 * ponytail: unexercised until Phase 3 ingests the first ambientCG set — any toktx
 * flag drift fails the run non-zero (fail-closed), which is the safe direction.
 */
async function ingestPbrRow(row) {
  const dir = path.join(SOURCE_DIR, row.id);
  const images = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !/displacement|height/i.test(f));
  if (!images.length) throw new Error(`${row.id}: no usable maps under assets-source/${row.id}/`);
  const work = makeWork(row.id);
  const outputs = [];
  for (const img of images) {
    const uastcSlot = /normal|rough|metal|ao|ambient|occlusion/i.test(img);
    const out = path.join(work, img.replace(/\.(png|jpe?g)$/i, '.ktx2'));
    const args = uastcSlot
      ? ['--t2', '--genmipmap', '--encode', 'uastc', '--uastc_quality', '2', out, path.join(dir, img)]
      : ['--t2', '--genmipmap', '--encode', 'etc1s', '--qlevel', '128', out, path.join(dir, img)];
    const r = spawnSync('toktx', args, { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`toktx failed on ${img} (exit ${r.status})`);
    outputs.push(out);
  }
  const total = outputs.reduce((s, f) => s + fs.statSync(f).size, 0);
  if (!gateReport(row.id, 'bytes', `${total} (set total) / ceiling ${row.ceiling_bytes}`, total <= row.ceiling_bytes)) {
    failClosed(row.id, 'bytes', `${total} > ${row.ceiling_bytes}`);
  }
  const destDir = path.join(ASSETS_DIR, row.id);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of outputs) fs.copyFileSync(f, path.join(destDir, path.basename(f)));
  return {
    id: row.id,
    file: row.id,
    bytes_original: dirBytes(dir),
    bytes_optimized: total,
    ingested: new Date().toISOString().slice(0, 10),
  };
}

/** Rebuild manifest.json for everything currently in public/assets (prior rows preserved, missing files pruned). */
function regenerateManifest(rows, newResult) {
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { /* first ingest */ }
  const byId = new Map(existing.map((r) => [r.id, {
    id: r.id, file: r.file, bytes_original: r.bytes_original, bytes_optimized: r.bytes_optimized, ingested: r.ingested,
  }]));
  byId.set(newResult.id, newResult);
  const results = [...byId.values()].filter((r) => fs.existsSync(path.join(ASSETS_DIR, r.file)));
  emitManifest(rows, results, MANIFEST_PATH);
}

async function main() {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--fixture');
  const fixtureMode = fi !== -1;
  let rows;
  let wanted;
  if (fixtureMode) {
    const name = args[fi + 1];
    const { FIXTURE_ROWS } = await import('./fixtures/fixture-rows.mjs');
    rows = FIXTURE_ROWS;
    wanted = rows.filter((r) => !name || r.id.includes(name));
    if (!wanted.length) throw new Error(`no fixture row matching "${name}"`);
  } else {
    rows = parseLedger(LEDGER);
    const ids = args.filter((a) => !a.startsWith('-'));
    if (ids.length) {
      wanted = [];
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        if (!row) throw new Error(`no ledger row with id "${id}" in ${LEDGER}`);
        wanted.push(row);
      }
    } else {
      wanted = rows.filter((r) => hasSource(r));
    }
  }
  if (!wanted.length) {
    console.log('nothing to ingest — no ledger rows with sources present in assets-source/');
    return;
  }
  for (const row of wanted) {
    console.log(`\n=== ingest ${row.id} (${row.category}${RIGGED.has(row.id) ? ', rigged' : ''}) ===`);
    const res = row.category === 'hdri' ? await ingestHdriRow(row)
      : row.category === 'pbr' ? await ingestPbrRow(row)
        : await ingestModelRow(row);
    if (!fixtureMode) regenerateManifest(rows, res);
    console.log(`[ship] ${row.id}: ${res.bytes_original} B source → ${res.bytes_optimized} B shipped`);
  }
  console.log('\nAll gates passed.');
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
