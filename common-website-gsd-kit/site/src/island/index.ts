/**
 * Island entry — the ONE dynamic-import target (D2-08). Only the boot script in
 * index.astro may reference this module, and only via `import()`; a static import
 * anywhere in shell code merges the island into the eager bundle and blows the
 * 10 KB line (pipeline/check-budgets.mjs fails the build on any breach).
 *
 * mount() wires the five single-owner systems (D2-11): QualityManager → Stage →
 * Timeline → ResponsiveBranch → AssetQueue, PMREMs the two Qwantani HDRIs into the
 * Q1 env crossfade, parses the three ingested props (meshopt + KTX2, self-hosted
 * basis transcoder — D2-09 rule), registers the proof chapter (D2-12), and
 * crossfades the canvas in over the Ch1 still once the critical batch lands.
 */

import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { QualityManager } from './systems/QualityManager.ts';
import { Stage } from './systems/Stage.ts';
import { Timeline } from './systems/Timeline.ts';
import { ResponsiveBranch } from './systems/ResponsiveBranch.ts';
import { AssetQueue } from './systems/AssetQueue.ts';
import { createAssetRegistry, type AssetRegistry } from './systems/assetRegistry.ts';
import { createEnvCrossfade } from './systems/envCrossfade.ts';
import { barFraction, labelFor, navVisible } from './choreo/affordance.ts';
import { CHAPTER_ASSETS, nextPrefetch } from './choreo/chapterAssets.ts';
import { ProofChapter } from './chapters/ProofChapter.ts';
import { installStillCapture, parseStillParam } from './qa/still.ts';

/** Chunk-identification marker — check-budgets.mjs locates the island chunk by this literal. */
export const ISLAND_ENTRY = true;

export interface MountOptions {
  /** CSS selector of the canvas home, e.g. '#stage' */
  el: string;
  /** import.meta.env.BASE_URL — every asset fetch joins through this (D2-06) */
  baseUrl: string;
  /** Honest loader progress, 0..1 (D2-20) */
  onProgress: (fraction: number) => void;
  /** Validated '?tier=' passthrough — 'floor' | 'high' | 'desktop' | null (D2-10) */
  tierOverride?: string | null;
}

/**
 * The critical batch (D2-20): the two Qwantani HDRIs feeding the Q1 crossfade plus
 * the three ingested props. Byte weights mirror public/assets/manifest.json — they
 * only weight the loader percent (AssetQueue clamps streams and snaps to 1 on
 * completion, so a stale weight can never break progress).
 */
const CRITICAL_ASSETS = {
  sunrise: { url: 'assets/qwantani_sunrise_puresky/qwantani_sunrise_puresky.hdr', bytes: 1_033_946 },
  dusk: { url: 'assets/qwantani_dusk_2_puresky/qwantani_dusk_2_puresky.hdr', bytes: 1_166_018 },
  table: { url: 'assets/WoodenTable_02/WoodenTable_02.glb', bytes: 2_241_096 },
  lamp: { url: 'assets/desk_lamp_arm_01/desk_lamp_arm_01.glb', bytes: 1_211_992 },
  clock: { url: 'assets/alarm_clock_01/alarm_clock_01.glb', bytes: 996_468 },
} as const;

/**
 * Self-hosted detect-gpu data files (public/benchmarks — D2-09), pinned with
 * @pmndrs/detect-gpu 6.0.18. Warm-cache prefetch only: getGPUTier fetches its own
 * GPU-specific file internally from benchmarksURL, so these ride the 'soon' batch
 * at weight 0 — best-effort, isolated from the now-required critical batch, and
 * still excluded from the loader percent.
 */
const BENCHMARK_FILES = [
  'd-adreno.json',
  'd-amd.json',
  'd-apple.json',
  'd-geforce.json',
  'd-intel.json',
  'd-nvidia.json',
  'd-radeon.json',
  'm-adreno.json',
  'm-apple-ipad.json',
  'm-apple.json',
  'm-intel.json',
  'm-mali-t.json',
  'm-mali.json',
  'm-nvidia.json',
  'm-powervr.json',
  'm-samsung.json',
] as const;

/** Rooted for the island's lifetime; every system carries a dispose() path (brief 05). */
let systems: {
  quality: QualityManager;
  stage: Stage;
  timeline: Timeline;
  branch: ResponsiveBranch;
  queue: AssetQueue;
  offDrive: () => void;
} | null = null;

/** Mount the experience: five systems, one proof chapter, honest loader handoff. */
export async function mount(opts: MountOptions): Promise<void> {
  const el = document.querySelector<HTMLElement>(opts.el);
  if (el === null) throw new Error(`island: mount element ${opts.el} not found`);

  // AssetQueue is the loader's single truth source (D2-20): the shell loader's
  // glow/percent follows queue progress and nothing else — real bytes now.
  const queue = new AssetQueue({ fetchFn: window.fetch.bind(window), baseUrl: opts.baseUrl });
  queue.onProgress(opts.onProgress);
  for (const a of Object.values(CRITICAL_ASSETS)) queue.add(a.url, 'critical', a.bytes);
  for (const file of BENCHMARK_FILES) queue.add(`benchmarks/${file}`, 'soon', 0);
  const critical = queue.load('critical'); // streaming starts NOW; failure handled at the await
  void queue.load('soon').catch(() => {
    // Warm-cache is best-effort — getGPUTier does its own fetch and fails safe to floor.
  });

  const quality = new QualityManager({ baseUrl: opts.baseUrl, tierOverride: opts.tierOverride });
  await quality.init();

  const stage = new Stage({ el, quality });
  // Canvas enters invisible and crossfades in over the still — the stage backdrop
  // matches --nightblue, so there is never a flash, only the fade.
  stage.canvas.style.opacity = '0';
  stage.canvas.style.transition = 'opacity 0.6s ease';

  // Q1 crossfade system — created here so the PMREM equirect shader compiles
  // WHILE the .hdr bytes stream (research prewarm trick).
  const crossfade = createEnvCrossfade(stage.renderer);
  stage.hudTargetCount = () => crossfade.targetCount();

  const timeline = new Timeline({ invalidate: () => stage.invalidate() });
  const branch = new ResponsiveBranch();

  // EXP-07 / D3-12 — the progress rule and the quiet nav ride the ONE master scrub via
  // Timeline.onDrive. No second ScrollTrigger, no IntersectionObserver: the affordance
  // sees exactly the (chapterIndex, progress) pair the chapter itself was driven with.
  const bar = document.querySelector<HTMLElement>('#progress-rule i');
  const label = document.querySelector<HTMLElement>('#progress-label');
  const nav = document.querySelector<HTMLElement>('#quiet-nav');
  let lastIndex = -1;

  // Assigned once the critical batch has been parsed, below. The drive listener is
  // subscribed HERE — before the batch lands — because the affordance must follow the
  // scrub from the first scroll event; the prefetch half simply does nothing until the
  // registry exists, which is also exactly the right behaviour (nothing to prefetch
  // one-ahead of a chapter that has not finished arriving).
  let registry: AssetRegistry | null = null;
  /** Highest chapter index already handed to the queue. Ch1 (0) IS the critical batch. */
  let lastPrefetched = 0;
  const offDrive = timeline.onDrive((chapterIndex, progress) => {
    // Transform only — advancing the bar never triggers layout.
    if (bar !== null) bar.style.transform = `scaleX(${barFraction(chapterIndex, progress)})`;
    if (chapterIndex !== lastIndex) {
      if (label !== null) label.textContent = labelFor(chapterIndex);
      if (nav !== null) nav.classList.toggle('is-visible', navVisible(chapterIndex));
      lastIndex = chapterIndex;
    }

    // EXP-05 / D3-10 — chapter N−1 pays for chapter N. It rides THIS subscription, not a
    // second one, for the same reason the affordance does: the prefetch must see exactly
    // the (chapterIndex, progress) pair the chapter itself was driven with, and there is
    // one scroll driver on this site.
    //
    // The decision is pure and idempotent because onDrive fires on every scroll update —
    // `nextPrefetch` returns an index only on the first drive past a boundary and never on
    // a reverse drive, so this is a comparison per event and real work once per chapter.
    // 'soon' priority is deliberate: AssetQueue weights the loader percent by `critical`
    // items alone, so a prefetch batch can never move the bar the visitor is watching.
    if (registry === null) return; // critical batch still landing — nothing to prime into
    const ahead = nextPrefetch(chapterIndex, lastPrefetched, CHAPTER_ASSETS.length);
    if (ahead === null) return;
    lastPrefetched = ahead;
    const primed = registry;
    for (const a of CHAPTER_ASSETS[ahead]) queue.add(a.url, 'soon', a.bytes);
    void queue
      .load('soon')
      .then((fetched) => primed.prime(fetched))
      .catch((e) => {
        // A missed prefetch degrades to a slower mount and must never reject into the
        // scrub path or strand the journey (T-03-08).
        console.warn(`island: chapter ${ahead + 1} prefetch failed`, e);
      });
  });

  systems = { quality, stage, timeline, branch, queue, offDrive };

  let buffers: Map<string, ArrayBuffer>;
  try {
    buffers = await critical;
  } catch (e) {
    // The shell narrative stays fully readable without the island; leave the
    // canvas transparent rather than stranding the loader (FND-02 spirit).
    console.error('island: critical asset batch failed', e);
    document.querySelector('#loader')?.remove();
    return;
  }

  // PMREM both HDRIs from the fetched bytes; sources are disposed inside.
  const rtA = crossfade.pmremFromHDR(buffers.get(CRITICAL_ASSETS.sunrise.url)!);
  const rtB = crossfade.pmremFromHDR(buffers.get(CRITICAL_ASSETS.dusk.url)!);
  crossfade.setPair(rtA, rtB);
  stage.scene.environment = crossfade.texture;

  // meshopt + KTX2 GLBs (D2-18 pipeline output). The basis transcoder is
  // self-hosted from public/basis/ — never a CDN (same rule as D2-09).
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${opts.baseUrl}${opts.baseUrl.endsWith('/') ? '' : '/'}basis/`)
    .detectSupport(stage.renderer);
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);

  // The ONE parse path (03-RESEARCH §Pattern 10). Ch1's manifest IS the critical batch, so
  // priming it here is exactly the parse that used to be inlined below — same loaders, same
  // buffers, same calls — and every later chapter reaches the same cache through the
  // one-ahead prefetch instead of decoding at its own boundary.
  registry = createAssetRegistry({ gltfLoader, ktx2Loader: ktx2 });
  await registry.prime(buffers);

  // ktx2 is NOT disposed here. It used to be, one line after the critical parse — but the
  // transcoder's Web Workers are what decode standalone `.ktx2` files, and the chapters that
  // need them (Ch6's UI plane, the Paper001/Cardboard004 PBR sets) parse long after mount
  // returns. Disposing at mount kills the workers and every later `KTX2Loader.parse` with
  // them. The loader therefore lives as long as the island does; it is released by the
  // island's teardown, alongside `registry.dispose()` and the systems' own disposers —
  // which do not exist yet, because nothing unmounts the island (`systems` is rooted for
  // the page lifetime for exactly that reason). When a teardown lands, both go in it.

  const [table, lamp, clock] = await Promise.all([
    registry.get<Object3D>(CRITICAL_ASSETS.table.url),
    registry.get<Object3D>(CRITICAL_ASSETS.lamp.url),
    registry.get<Object3D>(CRITICAL_ASSETS.clock.url),
  ]);

  // Proof chapter scrubbed 1:1 by native scroll (D2-12), registered against the seven
  // shell sections so the master scrub emits real per-chapter (index, progress) pairs and
  // the EXP-07 affordance is verifiable in wave 1. One instance, seven ranges: the proof
  // scene therefore replays its dolly + sunrise→dusk crossfade once per chapter, which is
  // the visible signature of the chapter mapping working. Waves 4-10 swap this single
  // instance for the seven storyboard chapters against these same sections.
  const proof = new ProofChapter({ crossfade, props: { table, lamp, clock } });
  await proof.mount(stage);
  for (const id of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7']) {
    const section = document.querySelector<HTMLElement>(`#${id}`);
    if (section !== null) timeline.register({ id, element: section }, proof);
  }

  // '?still=chN[.beat]' capture (D3-14) — installed only once the chapters are registered,
  // because the tool pins the master scrub and reads back the frame it produced. Same shape
  // as Stage's '?hud' / '?ctxloss' gates: the param is parsed to numbers behind a literal
  // pattern and a malformed value installs nothing at all (T-03-01).
  const still = parseStillParam(new URLSearchParams(window.location.search).get('still'));
  if (still !== null) installStillCapture({ target: still, stage, el });

  // Context restore (research Pattern 4): render targets — every PMREM and the
  // blend RT — are NOT restored by the browser. Re-fetch both .hdr via AssetQueue
  // (HTTP cache makes it cheap), regenerate, re-adopt, invalidate.
  stage.onRestore(() => {
    queue.add(CRITICAL_ASSETS.sunrise.url, 'critical', CRITICAL_ASSETS.sunrise.bytes);
    queue.add(CRITICAL_ASSETS.dusk.url, 'critical', CRITICAL_ASSETS.dusk.bytes);
    queue
      .load('critical')
      .then((again) => {
        const a = crossfade.pmremFromHDR(again.get(CRITICAL_ASSETS.sunrise.url)!);
        const b = crossfade.pmremFromHDR(again.get(CRITICAL_ASSETS.dusk.url)!);
        crossfade.setPair(a, b); // re-renders the blend at the current mix
        stage.scene.environment = crossfade.texture;
        stage.invalidate();
      })
      .catch((e) => console.error('island: context-restore re-PMREM failed', e));
  });

  // Honest handoff: crossfade in only once the critical batch has landed (D2-20).
  // The queue's onProgress already drove the loader to 1 at batch completion.
  stage.invalidate();
  requestAnimationFrame(() => {
    stage.canvas.style.opacity = '1';
  });

  const loader = document.querySelector<HTMLElement>('#loader');
  if (loader !== null) {
    loader.classList.add('is-done');
    // Wait out the CSS fade (0.5s in shell.css) before removing the node.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    });
    loader.remove();
  }
}
