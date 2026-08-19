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
import { ACESFilmicToneMapping, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { QualityManager } from './QualityManager.ts';

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

  constructor(deps: { el: HTMLElement; quality: QualityManager }) {
    this.el = deps.el;
    this.quality = deps.quality;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(new Color('#16213a')); // --nightblue: the stage backdrop
    // Filmic tone mapping for the HDR environment light (Q1 crossfade reads as light,
    // not clipped white); output color space stays three's sRGB default.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.canvas = this.renderer.domElement;
    this.el.appendChild(this.canvas);

    this.camera = new PerspectiveCamera(40, 1, 0.1, 100);

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
      for (const fn of this.restoreHooks) fn();
      this.invalidate();
    };
    this.canvas.addEventListener('webglcontextrestored', onRestored);
    this.disposers.push(() => this.canvas.removeEventListener('webglcontextrestored', onRestored));

    // Demand render on the single gsap ticker (D-11 one-ticker law).
    const tick = (time: number, deltaTime: number): void => {
      if (this.hidden || !this.dirty) return;
      this.dirty = false;
      if (this.hud === null) {
        this.renderer.render(this.scene, this.camera);
      } else {
        // Instrumented render ('?hud=1', Q1 protocol): manual info reset because
        // autoReset wipes the counters at the end of every render() call.
        this.renderer.info.reset();
        const t0 = performance.now();
        this.renderer.render(this.scene, this.camera);
        const ms = performance.now() - t0;
        const targets = this.hudTargetCount === null ? '-' : String(this.hudTargetCount());
        this.hud.textContent =
          `calls ${this.renderer.info.render.calls} | ${ms.toFixed(2)} ms | pmrem-RT ${targets}`;
      }
      this.quality.frame(time * 1000, deltaTime);
    };
    gsap.ticker.add(tick);
    this.disposers.push(() => gsap.ticker.remove(tick));

    const params = new URLSearchParams(window.location.search);

    // Dev instrumentation overlay ('?hud=1', Q1 protocol): scene draw calls, render
    // ms (performance.now deltas), live PMREM-class target count. Numbers only via
    // textContent — no query string ever reaches the DOM (T-02-08). The crossfade
    // blend pass is structurally +1 call on transition frames, outside this counter.
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
    this.renderer.dispose();
    this.canvas.remove();
  }

  private applyQuality(): void {
    const [min, max] = this.quality.settings.dprClamp;
    this.renderer.setPixelRatio(Math.min(max, Math.max(min, window.devicePixelRatio)));
    this.resize(); // setPixelRatio takes effect on the next setSize
  }

  private resize(): void {
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
