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
  if (sections.length === 0) return { chapterIndex: 0, progress: 0 };
  if (scrollY < sections[0].top) return { chapterIndex: 0, progress: 0 };

  // The last section whose top has been reached; a gap between sections therefore
  // holds the previous chapter (clamped to progress 1) until the next top arrives.
  let index = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].top <= scrollY) index = i;
    else break;
  }

  const { top, bottom } = sections[index];
  const span = bottom - top;
  const progress =
    span <= 0 ? (scrollY >= top ? 1 : 0) : Math.min(1, Math.max(0, (scrollY - top) / span));
  return { chapterIndex: index, progress };
}
