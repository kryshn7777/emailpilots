/**
 * Scroll-px → chapter progress mapping (D2-11 Timeline's math) — leaf-pure so
 * node:test drives synthetic layouts directly. Timeline measures the section
 * pixel ranges (at ScrollTrigger refresh) and feeds scrollY through here; the
 * result drives `chapter.update(progress)` — the ONLY way scenes are driven.
 */

export interface SectionRange {
  /** Document-space top of the section in px. */
  top: number;
  /** Document-space bottom of the section in px (top + height). */
  bottom: number;
}

export interface ChapterProgress {
  chapterIndex: number;
  /** 0..1 within the chapter, clamped at both ends. */
  progress: number;
}

export function progressMap(
  scrollY: number,
  sections: readonly SectionRange[]
): ChapterProgress {
  void scrollY;
  void sections;
  throw new Error('not implemented');
}
