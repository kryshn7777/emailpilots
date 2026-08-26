/**
 * Island entry — the ONE dynamic-import target (D2-08). Only the boot script in
 * index.astro may reference this module, and only via `import()`; a static import
 * anywhere in shell code merges the island into the eager bundle and blows the
 * 10 KB line (pipeline/check-budgets.mjs fails the build on any breach).
 *
 * mount() wires the five single-owner systems (D2-11): QualityManager → Stage →
 * Timeline → ResponsiveBranch → AssetQueue, PMREMs the two Qwantani HDRIs into the
 * Q1 env crossfade, parses the critical props (meshopt + KTX2, self-hosted basis
 * transcoder — D2-09 rule), builds the shared Room ONCE, registers Ch1 against its own
 * shell section, and crossfades the canvas in over the Ch1 still.
 *
 * This file creates the singletons and nothing else creates them: the `Room` (one set for
 * all seven chapters — the one-take camera's precondition), the `MaterialFamily` (one
 * definition of every lit surface — CHK-W2) and the `SetState` record (CHK-B1 — one record,
 * written by each chapter as its beats fire, read by the next as what it inherits). All
 * three are handed into every chapter constructor.
 */

import type { WebGLRenderTarget } from 'three';
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
import { CH1_STREAMED, CHAPTER_ASSETS, nextPrefetch } from './choreo/chapterAssets.ts';
import { Ch1FirstLight } from './chapters/Ch1FirstLight.ts';
import { createRoom } from './set/Room.ts';
import { createMaterialFamily } from './set/materials.ts';
import { createSetState } from './choreo/setState.ts';
import type { SkyId } from './choreo/dayWheel.ts';
import { parseReviewParams, REVIEW_WALL_SLOTS, reviewWallUrl } from './qa/review.ts';
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
 * The critical batch (D2-20): the two Qwantani HDRIs feeding the Q1 crossfade plus the two
 * props the set cannot be BUILT without — the desk, which is the world origin every camera
 * pose is measured from, and the lamp, which the light rig is posed on. Byte weights mirror
 * public/assets/manifest.json; they only weight the loader percent (AssetQueue clamps
 * streams and snaps to 1 on completion, so a stale weight can never break progress).
 *
 * `chapterAssets.test.ts` asserts this set EQUALS `CHAPTER_ASSETS[0]` in both directions, so
 * the Regime-B desktop gate measures exactly what the loader actually waits for. Ch1's other
 * storyboard objects ride `CH1_STREAMED` behind the handoff — the arithmetic that forced
 * that split is written out in `chapterAssets.ts`.
 */
const CRITICAL_ASSETS = {
  sunrise: { url: 'assets/qwantani_sunrise_puresky/qwantani_sunrise_puresky.hdr', bytes: 1_033_946 },
  dusk: { url: 'assets/qwantani_dusk_2_puresky/qwantani_dusk_2_puresky.hdr', bytes: 1_166_018 },
  table: { url: 'assets/wooden_table_02/wooden_table_02.glb', bytes: 2_021_652 },
  lamp: { url: 'assets/desk_lamp_arm_01/desk_lamp_arm_01.glb', bytes: 1_211_992 },
} as const;

/**
 * The night sky the wave-3 wall review needs (REVIEWS.md F-13 makes the night frame the
 * deciding one) — fetched ONLY when `?sky=night` asks for it. It is not a Ch1 asset: Ch3
 * owns it, and 03-11 declares it as a chapter manifest row when Ch3 lands.
 */
const REVIEW_NIGHT_URL = 'assets/qwantani_night_puresky/qwantani_night_puresky.hdr';

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
  // Declaration ORDER is load-bearing: AssetQueue is idempotent per url and the FIRST
  // declaration keeps its priority, so critical is declared first and can never be demoted
  // by a later batch that happens to name the same file.
  for (const a of Object.values(CRITICAL_ASSETS)) queue.add(a.url, 'critical', a.bytes);
  for (const a of CH1_STREAMED) queue.add(a.url, 'lazy', a.bytes);
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

  // Wave-3 review lever (03-09-T3), parsed behind a closed allowlist. Same shape as Stage's
  // '?hud' / '?ctxloss' and the '?still=' tool: the parse returns allowlist members or null,
  // and no query-string value ever reaches markup, a selector or a path (T-03-01).
  const review = parseReviewParams(new URLSearchParams(window.location.search));

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

  // PMREM both HDRIs from the fetched bytes; the equirect sources are disposed inside.
  //
  // The targets live in `skySources`, keyed by sky id, and that object is handed to the Room
  // (and through it to the day-wheel) BY REFERENCE. The wheel therefore owns their lifetime
  // — it calls setPair with `disposePrevious: false` and disposes all of them itself — and
  // the context-restore path below writes replacements into the same object rather than
  // leaving the wheel holding handles to a dead GL context.
  const skySources: Partial<Record<SkyId, WebGLRenderTarget>> = {
    sunrise: crossfade.pmremFromHDR(buffers.get(CRITICAL_ASSETS.sunrise.url)!),
    dusk2: crossfade.pmremFromHDR(buffers.get(CRITICAL_ASSETS.dusk.url)!),
  };
  // `scene.environment` is NOT assigned here. `crossfade.texture` throws until the first
  // `setPair`, and the first `setPair` now belongs to the day-wheel inside the Room — so the
  // adoption moved down to just after the Room exists and has been given the journey origin.

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

  // The set, built ONCE for the page. Every chapter reuses it; nothing rebuilds it. Room
  // owns the whole light rig and the day-wheel, so the fog and the key light can never
  // disagree about what time it is.
  // The one definition of every lit surface (CHK-W2). Built before the Room because the
  // Room hangs its floor, walls and window frame on it — and cloned, never rebuilt, by any
  // chapter that needs per-object uniforms (Ch1's ink-patched letter is the first).
  // ponytail: nothing disposes it, for the same reason nothing disposes `registry` or
  // `ktx2` — the island has no teardown and `systems` is rooted for the page lifetime.
  // When a teardown lands, `materials.dispose()` goes in it beside the other two.
  const materials = createMaterialFamily({
    registry,
    wallSet: review.wall,
    invalidate: () => stage.invalidate(),
  });

  const room = await createRoom({
    stage,
    registry,
    quality,
    branch,
    crossfade,
    skySources,
    invalidate: () => stage.invalidate(),
    materials,
  });

  // The ONE set-state record (CHK-B1). Created here, passed into every chapter constructor
  // — a chapter with a private copy cannot hand the next one the state it inherits.
  const setState = createSetState();

  // The journey origin, from the one record that declares it — and the wheel's first
  // `setPair`, which is what makes `crossfade.texture` readable at all.
  room.setEnv(setState.env);
  stage.scene.environment = crossfade.texture;

  const ch1 = new Ch1FirstLight({ room, setState, envOverride: review.sky });
  await ch1.mount(stage);
  const section = document.querySelector<HTMLElement>('#ch1');
  if (section === null) {
    console.warn('island: #ch1 not found — registering Ch1 against document.body');
  }
  timeline.register({ id: 'ch1', element: section ?? document.body }, ch1);

  // Whatever the review lever asked for rides the SAME lazy batch as the dressing — one
  // fetch, one prime, one adopt. Weight 0: `AssetQueue.emit()` weights the loader percent by
  // `critical` items alone, and neither of these is ever on a visitor's path anyway.
  if (review.wall !== null) {
    for (const slot of REVIEW_WALL_SLOTS) queue.add(reviewWallUrl(review.wall, slot), 'lazy', 0);
  }
  if (review.sky === 'night') queue.add(REVIEW_NIGHT_URL, 'lazy', 0);

  // Ch1's dressing, behind the handoff. 'lazy' is its own batch: 'soon' already carries the
  // benchmark warm-cache JSONs, and handing those buffers to registry.prime() rejects on
  // "no parser for". A failure here costs set dressing, never the journey — the room is
  // already standing and the camera is already scrubbing.
  void queue
    .load('lazy')
    .then(async (fetched) => {
      await registry!.prime(fetched);
      const nightBytes = fetched.get(REVIEW_NIGHT_URL);
      if (nightBytes !== undefined) skySources.night = crossfade.pmremFromHDR(nightBytes);
      // Second adopt: the floor's KTX2 set and the review wall are only resolvable now.
      await room.adopt();
      // The chapter re-applies the override on every drive, but a pinned still is captured
      // without one — so the light state has to be right before the first scroll, not after.
      if (review.sky !== null) room.setEnv({ a: review.sky, b: review.sky, mix: 0 });
    })
    .catch((e) => console.warn('island: Ch1 streamed dressing failed', e));

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
        // The old targets died with the context. Release them, write the replacements into
        // the SAME `skySources` object the wheel holds, and adopt without disposal — the
        // wheel owns these now, so the default disposing setPair would free the pair it is
        // about to be handed back.
        skySources.sunrise?.dispose();
        skySources.dusk2?.dispose();
        skySources.sunrise = crossfade.pmremFromHDR(again.get(CRITICAL_ASSETS.sunrise.url)!);
        skySources.dusk2 = crossfade.pmremFromHDR(again.get(CRITICAL_ASSETS.dusk.url)!);
        crossfade.setPair(skySources.sunrise, skySources.dusk2, { disposePrevious: false });
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
