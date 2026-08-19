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
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { QualityManager } from './QualityManager.ts';

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** Read access for PMREM generation (02-05) — Stage stays the sole writer/creator. */
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  private readonly el: HTMLElement;
  private readonly quality: QualityManager;
  private dirty = false;
  private hidden = false;
  private readonly restoreHooks = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];

  constructor(deps: { el: HTMLElement; quality: QualityManager }) {
    this.el = deps.el;
    this.quality = deps.quality;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(new Color('#16213a')); // --nightblue: the stage backdrop
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
      this.renderer.render(this.scene, this.camera);
      this.quality.frame(time * 1000, deltaTime);
    };
    gsap.ticker.add(tick);
    this.disposers.push(() => gsap.ticker.remove(tick));

    // Dev QA lever (MOB-05 verification): '?ctxloss=1' exposes a window-scoped hook
    // that forces a loss/restore via three's WEBGL_lose_context wrappers. The param
    // only toggles this hook — no string ever reaches DOM/HTML (T-02-08).
    if (new URLSearchParams(window.location.search).get('ctxloss') === '1') {
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
