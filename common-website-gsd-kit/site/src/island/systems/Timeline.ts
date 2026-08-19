/**
 * Timeline — owner of the master scrub (D2-11): the Lenis + ScrollTrigger scroll
 * foundation on the shell's NATIVE scroll, wired exactly per the verified snippet
 * (02-RESEARCH.md Pattern 3, lenis README). One gsap ticker drives everything
 * (D-11): it pumps lenis.raf here and the demand render in Stage.
 *
 * Native scroll is preserved — no scroll-jacking, no snap. Back button, anchor
 * links (the anchors option below), keyboard scroll, and find-in-page keep
 * working because Lenis wraps the browser's own scroll and nothing
 * preventDefaults wheel/touch.
 * Resize/orientation ride ScrollTrigger's default autoRefreshEvents; the
 * ignoreMobileResize config kills the mobile address-bar jump (orientation
 * changes still refresh via 'resize').
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { progressMap, type SectionRange } from './progressMap.ts';
import type { Chapter, ChapterDef } from '../chapters/Chapter.ts';

interface Registered {
  def: ChapterDef;
  chapter: Chapter;
}

export class Timeline {
  private readonly invalidate: () => void;
  private readonly lenis: Lenis;
  private readonly trigger: ScrollTrigger;
  private readonly tickerCb: (time: number) => void;
  private readonly registered: Registered[] = [];
  private ranges: SectionRange[] = [];
  private last: { chapterIndex: number; progress: number } | null = null;

  constructor(deps: { invalidate: () => void }) {
    this.invalidate = deps.invalidate;

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    // [VERIFIED: lenis README] — wiring verbatim; the gsap ticker is the single driver.
    const lenis = new Lenis({ anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    this.tickerCb = (time: number): void => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(this.tickerCb);
    gsap.ticker.lagSmoothing(0);
    this.lenis = lenis;

    // Master scrub: document scroll → progressMap → chapter.update(progress) —
    // the ONLY way scenes are driven (D2-12).
    this.trigger = ScrollTrigger.create({
      start: 0,
      end: () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
      onUpdate: () => this.drive(),
      onRefresh: () => {
        this.measure();
        this.drive();
      },
    });
  }

  /** Register a chapter against its shell section (Phase 3 calls this seven times). */
  register(def: ChapterDef, chapter: Chapter): void {
    this.registered.push({ def, chapter });
    this.measure();
    this.last = null; // force a drive so the new chapter gets its initial progress
    this.drive();
  }

  dispose(): void {
    this.trigger.kill();
    gsap.ticker.remove(this.tickerCb);
    this.lenis.destroy();
    this.registered.length = 0;
    this.ranges = [];
  }

  /** Re-measure section pixel ranges (runs at every ScrollTrigger refresh). */
  private measure(): void {
    const scrollY = window.scrollY;
    this.ranges = this.registered.map(({ def }) => {
      const rect = def.element.getBoundingClientRect();
      return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    });
  }

  private drive(): void {
    if (this.registered.length === 0) return;
    const { chapterIndex, progress } = progressMap(window.scrollY, this.ranges);
    if (
      this.last !== null &&
      this.last.chapterIndex === chapterIndex &&
      this.last.progress === progress
    ) {
      return;
    }
    this.last = { chapterIndex, progress };
    this.registered[chapterIndex].chapter.update(progress);
    this.invalidate();
  }
}
