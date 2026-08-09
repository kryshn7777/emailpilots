import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

interface ScrollDirectorOptions {
  reducedMotion: boolean;
  onProgress: (t: number) => void;
}

/**
 * Owns Lenis + the single master ScrollTrigger. Lenis scrolls the real
 * window (no scrollerProxy); gsap.ticker is the one clock driving it.
 * In Phase 2 the master trigger drives the chapter timeline from chapters.ts —
 * for Phase 1 it feeds raw progress to the debug scene.
 */
export class ScrollDirector {
  private lenis: Lenis | null = null;
  private trigger: ScrollTrigger;
  private tick: ((time: number) => void) | null = null;

  constructor(options: ScrollDirectorOptions) {
    history.scrollRestoration = 'manual';

    if (!options.reducedMotion) {
      this.lenis = new Lenis({ autoRaf: false });
      this.lenis.on('scroll', ScrollTrigger.update);
      this.tick = (time: number) => this.lenis?.raf(time * 1000);
      gsap.ticker.add(this.tick);
      gsap.ticker.lagSmoothing(0);
    }

    this.trigger = ScrollTrigger.create({
      start: 0,
      end: () => document.documentElement.scrollHeight - window.innerHeight,
      scrub: true,
      onUpdate: (self) => options.onProgress(self.progress),
    });
  }

  /** Instant scroll-to-top for page swaps (Lenis-aware). */
  scrollTop(): void {
    if (this.lenis) this.lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }

  /** Re-measure after a Swup container swap changed the page height. */
  refresh(): void {
    ScrollTrigger.refresh();
  }

  dispose(): void {
    this.trigger.kill();
    if (this.tick) gsap.ticker.remove(this.tick);
    this.lenis?.destroy();
  }
}
