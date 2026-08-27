/**
 * The GL context-restore path (research Pattern 4, D2-16 / 02-05-T1), gated end to end.
 *
 * ## The defect these tests were written for
 *
 * Forcing a loss/restore with `?ctxloss=1` on the shipped build produced, every time:
 *
 *     island: context-restore re-PMREM failed  Error: THREE.HDRLoader: Read Error: no header found
 *
 * and left the scene with **no environment map at all** — a context loss permanently killed the
 * lighting. "no header found" is the classic signature of an ArrayBuffer that was consumed,
 * detached or stored post-slice, so that is what the reading looks like from the console.
 *
 * **It is none of those.** The bytes are intact and the registry still holds them. What
 * happened is that the restore hook re-fetched through `AssetQueue.load('critical')`, which
 * resolves only items that are **not yet done** — and after mount they are all done, so it
 * resolved an **empty map**. The `!` non-null assertion on `again.get(url)` then handed
 * `undefined` to `HDRLoader.parse`, `new Uint8Array(undefined)` is a zero-length view, and
 * three reports a zero-length buffer with the same message a corrupt one gets.
 *
 * Four facts, asserted separately because they fail independently: the queue really does
 * resolve empty (the trap), a missing buffer really does produce that exact message (so the
 * message is diagnosed, not guessed), the retained buffer really does survive re-parsing (so
 * reading it back is sound), and the restore hook really does read it from the registry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { AssetQueue } from './AssetQueue.ts';
import { createAssetRegistry } from './assetRegistry.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../..');
const ISLAND_ENTRY = fs.readFileSync(path.join(HERE, '../index.ts'), 'utf8');

/** The sunrise sky the journey opens on — a real shipped 1K RGBE file, not a fixture. */
const HDR_URL = 'public/assets/qwantani_sunrise_puresky/qwantani_sunrise_puresky.hdr';

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

/** Loaders are injected (D2-02); neither is reachable in node, and `.hdr` never touches them. */
const noLoaders = {
  gltfLoader: null as unknown as GLTFLoader,
  ktx2Loader: null as unknown as KTX2Loader,
};

/* ------------------------------------------------------------------------ (1) the trap --- */

test('AssetQueue.load() of a completed batch resolves EMPTY — it never re-serves bytes', async () => {
  const fetchFn = (async () => new Response(new Uint8Array(64))) as typeof fetch;
  const q = new AssetQueue({ fetchFn, baseUrl: '/' });
  q.add('sky.hdr', 'critical', 64);
  const first = await q.load('critical');
  assert.equal(first.get('sky.hdr')?.byteLength, 64, 'positive control: the first load works');
  // `add()` is one-item-per-url, so re-declaring is a no-op; `load()` filters on `!done`.
  q.add('sky.hdr', 'critical', 64);
  const again = await q.load('critical');
  assert.equal(
    again.get('sky.hdr'),
    undefined,
    'This is the trap the context-restore path fell into, and it is asserted rather than ' +
      'fixed on purpose: `load()` filtering on `!done` is what keeps the benchmark warm-cache ' +
      'JSONs out of every later `load("soon")` -> `registry.prime()` at a chapter boundary, ' +
      'where they would reject with "no parser for". Callers that need bytes back must read ' +
      'them from the parse-once registry, which is what the restore hook now does.',
  );
});

/* --------------------------------------------- (2) what the console line really meant --- */

test('a MISSING buffer is what three reports as "no header found" — not a spent one', () => {
  assert.throws(
    () => new HDRLoader().parse(undefined as unknown as ArrayBuffer),
    /no header found/,
    'new Uint8Array(undefined) is a zero-length view, and RGBE_ReadHeader reports a ' +
      'zero-length buffer with the same message a corrupt one gets. The `!` on the map lookup ' +
      'is what turned "the map was empty" into "the HDR is broken".',
  );
});

/* ----------------------------------------- (3) the retained buffer survives re-parsing --- */

test('the retained .hdr ArrayBuffer parses twice — PMREM does not consume or detach it', () => {
  const file = fs.readFileSync(path.join(SITE, HDR_URL));
  // A standalone copy, exactly as AssetQueue's stream reassembly produces one.
  const buffer: ArrayBuffer = new Uint8Array(file).buffer;
  const bytesBefore = buffer.byteLength;
  const loader = new HDRLoader();

  const first = loader.parse(buffer);
  const second = loader.parse(buffer); // the context-restore re-PMREM, a second time
  assert.ok(
    (first.width ?? 0) > 0 && (first.height ?? 0) > 0,
    'positive control: the shipped file really parses',
  );
  assert.equal(second.width, first.width, 'the second parse reads the same image');
  assert.equal(second.height, first.height);
  assert.equal(
    buffer.byteLength,
    bytesBefore,
    'and the buffer is not detached — `parse` takes a Uint8Array VIEW over it and reads. ' +
      'Retaining it (03-05) and re-reading it on restore is sound; the re-fetch never was.',
  );
});

/* ------------------------------------------- (4) the registry hands the same bytes back --- */

test('assetRegistry caches .hdr as the IDENTICAL ArrayBuffer, readable any number of times', async () => {
  const registry = createAssetRegistry(noLoaders);
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  await registry.prime(new Map([['sky.hdr', bytes]]));
  const a = await registry.get<ArrayBuffer>('sky.hdr');
  const b = await registry.get<ArrayBuffer>('sky.hdr');
  assert.equal(a, bytes, 'the same object, not a copy — `.hdr` is deliberately unparsed (03-05)');
  assert.equal(b, bytes, 'and a second read after a context loss gets it too');
  await assert.rejects(
    registry.get('never-primed.hdr'),
    /never primed/,
    'and a url nobody primed REJECTS by name, where the queue silently resolved nothing',
  );
});

/* --------------------------------- the restore hook reads bytes it already owns --- */

test('the context-restore hook re-PMREMs from the registry, never from a second fetch', () => {
  const hook = /stage\.onRestore\(\(\) => \{([\s\S]*?)\n {2}\}\);/.exec(ISLAND_ENTRY);
  assert.ok(hook !== null, 'positive control: the one stage.onRestore hook must be found');
  const body = hook[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    body.includes('pmremFromHDR'),
    'positive control: the hook still regenerates the PMREMs the browser did not restore',
  );
  assert.equal(
    occurrences(body, 'queue.load('),
    0,
    'a re-fetch resolves empty for a completed batch (test 1) and cost 2.2 MB of network on ' +
      'the way to resolving nothing',
  );
  assert.equal(occurrences(body, 'queue.add('), 0, 'and nothing is re-declared to the queue');
  assert.match(
    body,
    /\.get<ArrayBuffer>\(/,
    'the bytes come from the parse-once registry, typed — which also removes the `!` that ' +
      'let `undefined` reach HDRLoader in the first place',
  );
  assert.equal(
    occurrences(body, '!)'),
    0,
    'no non-null assertion survives in the hook: it is the mechanism that hid this defect',
  );
});
