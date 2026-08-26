/**
 * Stage — sole owner of renderer/scene/camera (D2-11). The ONLY `new WebGLRenderer`
 * site in src/ (grep-gated from this plan forward).
 *
 * Demand rendering per D-11: the single gsap ticker renders ONLY when invalidate()
 * flagged, then clears the flag; every rendered frame's ms feeds QualityManager's
 * regression ladder. Lifecycle: visibility (hidden → skip renders), context
 * loss/restore (research Pattern 4 — three r185 restores GL state itself but NOT
 * render targets/PMREMs and emits no JS-level restore event, so Stage listens to
 * the canvas's own `webglcontextrestored`), and a `?ctxloss=1` dev QA lever.
 */

import { gsap } from 'gsap';
import {
  ACESFilmicToneMapping,
  Color,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { QualityManager } from './QualityManager.ts';
import { createGrade, type Focus, type Grade } from './grade.ts';

/**
 * Re-exported so a chapter asks the STAGE for shallow focus rather than reaching into the
 * post module. `Stage` owns the composer's whole lifetime — it is built and torn down from
 * `postPasses` — so it is also the only honest place to hand it an authored focus.
 */
export type { Focus };

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** Read access for PMREM generation (02-05) — Stage stays the sole writer/creator. */
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  /** '?hud=1' extra column: index wires this to envCrossfade.targetCount() (Q1 instrumentation). */
  hudTargetCount: (() => number) | null = null;

  private readonly el: HTMLElement;
  private readonly quality: QualityManager;
  private dirty = false;
  private hidden = false;
  private hud: HTMLElement | null = null;
  private readonly restoreHooks = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  /**
   * The one `EffectComposer` on the site, or `null` where the tier does not allow a pass.
   * Built and torn down by `applyQuality` from `settings.postPasses` and nothing else.
   */
  private grade: Grade | null = null;
  /** What the DoF stage is focused on while a chapter asks for it. Survives a rebuild. */
  private focus: Focus | null = null;
  /** Ticker seconds, held so `draw()` takes no arguments and both paths call it identically. */
  private elapsed = 0;

  constructor(deps: { el: HTMLElement; quality: QualityManager }) {
    this.el = deps.el;
    this.quality = deps.quality;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(new Color('#16213a')); // --nightblue: the stage backdrop
    // Filmic tone mapping for the HDR environment light (Q1 crossfade reads as light,
    // not clipped white); output color space stays three's sRGB default.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // FB-1's silent third half: three renders no shadow at all with `shadowMap.enabled` off,
    // however many meshes are enrolled as occluders and however the light is configured. It is
    // switched on unconditionally because it costs nothing where nothing casts — the tier gate
    // is on the LIGHT (`Room.applyQuality` reads `settings.shadowMaps`), which is the noun the
    // budget line counts. `PCFShadowMap`, NOT `PCFSoftShadowMap`: three r185's `WebGLProgram`
    // shadow-type map has an entry for the former and none for the latter, so setting
    // PCFSoft falls through to `SHADOWMAP_TYPE_BASIC` — one unfiltered tap, harder edges than
    // the default, and an inert `shadow.radius`. In r185 the soft, radius-driven filter is
    // spelled PCFShadowMap, and the day-wheel authors `shadow.radius` per sky against it.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.el.appendChild(this.canvas);

    // near = 2 cm, not the 10 cm this shipped with. STORYBOARD Ch1 opens ~8 cm above the
    // letter (cameraRig ECU_LETTER), which puts the near half of an A4 sheet 1.7-8.7 cm from
    // the lens: at 0.1 the bottom band of the site's opening frame was clipped straight
    // through the paper to the room behind it. 0.02/100 is a 5000:1 range, which a 24-bit
    // depth buffer carries with ~6 um of resolution at 1 m — three orders under the 0.8 mm
    // the letter sits above the desk.
    this.camera = new PerspectiveCamera(40, 1, 0.02, 100);

    // DPR from QualityManager settings — re-applied on every quality change (rung cuts).
    this.applyQuality();
    this.disposers.push(
      this.quality.subscribe(() => {
        this.applyQuality();
        this.invalidate();
      })
    );

    const onResize = (): void => {
      this.resize();
      this.invalidate();
    };
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));

    const onVisibility = (): void => {
      this.hidden = document.hidden;
      if (!document.hidden) this.invalidate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Context restore: run registered hooks (02-05 re-PMREMs resident HDRIs here),
    // then invalidate — the demand loop would otherwise leave a permanent black
    // canvas (Pitfall 6). `webglcontextlost` needs no listener: three r185
    // preventDefaults it internally and re-inits GL state on restore.
    const onRestored = (): void => {
      // three r185 re-inits GL state on restore but NOT render targets, and the composer owns
      // three of them. Rebuilt rather than reused: a disposed-and-recreated composer is two
      // allocations on an event that happens approximately never, and a composer holding
      // dead targets is a permanently black canvas on the tier that runs the pass.
      this.grade?.dispose();
      this.grade = null;
      this.applyPost();
      for (const fn of this.restoreHooks) fn();
      this.invalidate();
    };
    this.canvas.addEventListener('webglcontextrestored', onRestored);
    this.disposers.push(() => this.canvas.removeEventListener('webglcontextrestored', onRestored));

    // Demand render on the single gsap ticker (D-11 one-ticker law).
    const tick = (time: number, deltaTime: number): void => {
      if (this.hidden || !this.dirty) return;
      this.dirty = false;
      this.elapsed = time;
      if (this.hud === null) {
        this.draw();
      } else {
        // Instrumented render ('?hud=1', D3-15 protocol): manual info reset because
        // autoReset wipes the counters at the end of every render() call.
        this.renderer.info.reset();
        const t0 = performance.now();
        this.draw();
        const drawMs = performance.now() - t0;
        const info = this.renderer.info;
        const targets = this.hudTargetCount === null ? '-' : String(this.hudTargetCount());
        // frame ms is the TICKER delta (JS per frame, the gated axis); draw ms is the
        // render() delta alone. A slow scene update is invisible in the second number,
        // which is the whole reason both columns exist.
        //
        // `post` is BUDGETS §Amendments B3's enforcement clause: each chapter SUMMARY records
        // the composer's allocated RT bytes beside the PMREM count, so the three residency
        // spends against the one ≤ 128 MB line are visible side by side in one place. It reads
        // `-` where the tier runs no pass, which is the honest reading of "0 passes mobile".
        const post = this.grade === null ? '-' : `${(this.grade.bytes() / 1e6).toFixed(1)} MB`;
        this.hud.textContent =
          `calls ${info.render.calls} | tris ${info.render.triangles} | ` +
          `frame ${deltaTime.toFixed(2)} ms | draw ${drawMs.toFixed(2)} ms | ` +
          `tex ${info.memory.textures} | geo ${info.memory.geometries} | ` +
          `pmrem-RT ${targets} | post ${post}`;
      }
      this.quality.frame(time * 1000, deltaTime);
    };
    gsap.ticker.add(tick);
    this.disposers.push(() => gsap.ticker.remove(tick));

    const params = new URLSearchParams(window.location.search);

    // Dev instrumentation overlay ('?hud=1', D3-15): the four numbers BUDGETS.md gates
    // per frame — draw calls ≤ 75, triangles resident ≤ 200K, JS per frame ≤ 5 ms, and
    // texture memory ≤ 128 MB (read as the live GPU-resident texture/geometry counts,
    // the only instrument that axis has) — plus draw ms and the PMREM-class target
    // count. It exists in wave 1 because Ch4 is the budget chapter and is measured
    // FIRST among the WOW chapters: an unmeasured axis in the phase that fills it is
    // the one place a budget gets blown with nobody noticing.
    //
    // Numbers only, via textContent — no query string ever reaches the DOM (T-02-08 /
    // T-03-01). The crossfade blend pass is structurally +1 call on transition frames,
    // outside this counter. pmrem-RT counts only the targets envCrossfade itself holds
    // (A + B + blend); a day-wheel owning five sources externally reads 3 here while
    // BUDGETS' amended residency line gates 6 — see BUDGETS.md §Amendments B1.
    if (params.get('hud') === '1') {
      const hud = document.createElement('div');
      hud.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;' +
        'font:11px/1.4 monospace;color:#9fe8a4;background:rgba(0,0,0,0.65);' +
        'padding:4px 8px;border-radius:4px;';
      document.body.appendChild(hud);
      this.hud = hud;
      this.renderer.info.autoReset = false;
      this.disposers.push(() => {
        this.renderer.info.autoReset = true;
        hud.remove();
        this.hud = null;
      });
    }

    // Dev QA lever (MOB-05 verification): '?ctxloss=1' exposes a window-scoped hook
    // that forces a loss/restore via three's WEBGL_lose_context wrappers. The param
    // only toggles this hook — no string ever reaches DOM/HTML (T-02-08).
    if (params.get('ctxloss') === '1') {
      (window as unknown as Record<string, unknown>).__eptCtxLoss = {
        lose: (): void => {
          this.renderer.forceContextLoss();
        },
        restore: (): void => {
          this.renderer.forceContextRestore();
        },
      };
    }
  }

  /** Mark the frame dirty; the ticker renders once and clears the flag. */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Shallow focus for the chapters that carry it, or `null` to run colour-only and **free the
   * DoF attachments** (BUDGETS §Amendments B3 books them for Ch1 `0–48%` and Ch5 only).
   *
   * Held on Stage rather than passed through per frame, because the composer is torn down and
   * rebuilt whenever the regression ladder crosses rung 2 — a chapter that had handed its
   * focus to a composer that no longer exists would come back deep-focus with nothing to say
   * so. Calling this on a tier that runs no pass is a no-op that is REMEMBERED: mobile loses
   * DoF by design (Ruling 10 §2) and gets it back if the tier is ever raised.
   */
  setFocus(focus: Focus | null): void {
    this.focus = focus;
    this.grade?.setFocus(focus);
    this.invalidate();
  }

  /** Resident post-scratch bytes — B3's per-chapter enforcement number. 0 where no pass runs. */
  postBytes(): number {
    return this.grade === null ? 0 : this.grade.bytes();
  }

  /** Register work to re-run after a GL context restore; returns a disposer. */
  onRestore(fn: () => void): () => void {
    this.restoreHooks.add(fn);
    return () => {
      this.restoreHooks.delete(fn);
    };
  }

  /** Full release: listeners, ticker callback, renderer, canvas. */
  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.restoreHooks.clear();
    this.grade?.dispose();
    this.grade = null;
    this.renderer.dispose();
    this.canvas.remove();
  }

  /**
   * The ONE place the composer/renderer choice is made, so a still capture and a scrubbed
   * frame can never disagree about what a frame looks like. Takes no arguments on purpose:
   * the hud-off branch of the ticker must be one statement with no timing read and no `info`
   * read in it, and an argument list is a place for one to grow back.
   *
   * **Public because `qa/still.ts` needs it.** That tool renders one frame at a capture DPR
   * into a drawing buffer it resizes itself, and it did so by calling
   * `renderer.render(scene, camera)` — which, the moment a composer existed, meant every LOOK
   * capture would have been the UNGRADED frame at the composer's stale extent, while the
   * scroll showed the graded one. The five frames the LOOK gate judges would have been of a
   * pipeline nobody ships. Syncing the composer to the live drawing buffer here is what makes
   * the two paths identical; `Grade.setSize` early-outs when nothing moved, so it is free.
   */
  draw(): void {
    this.grade?.setSize(this.renderer.domElement.width, this.renderer.domElement.height);
    if (this.grade === null) this.renderer.render(this.scene, this.camera);
    else this.grade.render(this.elapsed);
  }

  private applyQuality(): void {
    const [min, max] = this.quality.settings.dprClamp;
    this.renderer.setPixelRatio(Math.min(max, Math.max(min, window.devicePixelRatio)));
    this.resize(); // setPixelRatio takes effect on the next setSize
    this.applyPost();
  }

  /**
   * **`postPasses`, consumed.** Until 2026-08-26 this field was declared by `QualityManager`
   * and read by nothing, while BUDGETS' "Post-processing passes: 1 desktop" row read as
   * *implemented* in every summary downstream of it — Ruling 10's meta-rule has this as its
   * own worked example. So the composer exists exactly where the tier says one may, and the
   * moment the regression ladder's rung 2 ("no-post") drops it on desktop the composer is
   * **disposed**, not merely bypassed: a render target nobody draws through still holds its
   * bytes, and rung 2 exists to give bytes and fill rate back.
   *
   * Falling off the pass means falling back to the mobile look — authored, graceful, and
   * still carrying seven of the finish bar's eight items, because FB-5's exposure lives on
   * the renderer and every one of FB-1…FB-4/6 is in the scene.
   */
  private applyPost(): void {
    const wanted = this.quality.settings.postPasses === 1;
    if (wanted && this.grade === null) {
      this.grade = createGrade({ renderer: this.renderer, scene: this.scene, camera: this.camera });
      this.grade.setFocus(this.focus);
    } else if (!wanted && this.grade !== null) {
      this.grade.dispose();
      this.grade = null;
    }
  }

  private resize(): void {
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    // The composer follows the drawing buffer, which Stage alone owns. A grade RT left at the
    // old extent is a stretched frame, and a stale half-res depth attachment reads as a
    // defocus that ignores the camera.
    this.grade?.setSize(this.renderer.domElement.width, this.renderer.domElement.height);
  }
}
