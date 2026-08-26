/**
 * `?still=chN[.beat]` — pin an authored frame and export it at 2× DPR (D3-14).
 *
 * The phase's load-bearing QA tool, which is why it ships in wave 2 rather than at the
 * end: every later chapter plan captures its own shell-parity still with it, Phase 4's
 * reduced-motion keyframes are the same frames, and Phase 5's OG crops come out of the
 * same exports. `?still=ch1.50` is also how the real Ch1 key art replaces the placeholder.
 *
 * ## Parameter handling (T-03-01, continuing T-02-08)
 *
 * One anchored regex, and the output is two numbers: a chapter integer bounded to 1..7 and
 * a beat clamped to 0..1. **No branch of `parseStillParam` returns, stores or forwards the
 * input string** — the download filename is assembled from the parsed numbers, and the
 * only DOM the tool touches is an `<a download>` whose two properties are that filename
 * and an object URL. Nothing from the query string can reach markup, a selector, or a path.
 *
 * ## Capture (03-RESEARCH §Pattern 12)
 *
 * `Stage`'s renderer keeps `preserveDrawingBuffer` off, which is correct for performance
 * and means the drawing buffer is cleared at the next compositor step. `toBlob` copies the
 * canvas bitmap during its own synchronous phase, so a capture is safe — and ONLY safe —
 * while no task boundary separates it from an explicit `render()`. That is the reason the
 * capture block below has no `await` in it and never will: an await between the two lines
 * yields a blank frame, silently, every time.
 *
 * `Stage.resize()` is private, so the tool drives the renderer's own public API and puts
 * both the pixel ratio and the size back exactly as it found them.
 */

import type { Stage } from '../systems/Stage.ts';

export interface StillTarget {
  /** 1..7 — the shell section id, never a string from the URL. */
  chapter: number;
  /** 0..1 within that chapter, the same axis `progressMap` produces. */
  beat: number;
}

export interface StillDeps {
  target: StillTarget;
  stage: Stage;
  /** The canvas home element — the export is sized from it, never from the window. */
  el: HTMLElement;
}

/** STORYBOARD's seven chapters. A capture request outside them is junk, not a clamp. */
const CHAPTER_COUNT = 7;
/** The parity stills and the Ch1 key art are authored at 2× (ASSETS.md). */
const CAPTURE_DPR = 2;
/** Chrome encodes WebP natively — the format the ≤150 KB parity-still line is set in. */
const CAPTURE_QUALITY = 0.9;

/**
 * `'ch4.72'` → `{ chapter: 4, beat: 0.72 }`. Anything else — a missing param, a chapter
 * outside 1..7, trailing junk, any non-numeric shape — is `null`, and `null` means the
 * tool does not install at all.
 */
export function parseStillParam(raw: string | null): StillTarget | null {
  if (raw === null) return null;
  const match = /^ch(\d+(?:\.\d+)?)$/.exec(raw);
  if (match === null) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const chapter = Math.trunc(value);
  if (chapter < 1 || chapter > CHAPTER_COUNT) return null;
  const beat = Math.min(1, Math.max(0, value - chapter));
  return { chapter, beat };
}

/**
 * Scroll to the authored frame, let the master scrub drive it, then export.
 *
 * The pin is the inverse of `progressMap`: `sectionTop + beat × sectionHeight`, measured
 * off the live layout, so no Timeline change is needed and the tool cannot disagree with
 * the mapping the chapters were driven by. Two animation frames then let Lenis settle and
 * ScrollTrigger drive the chapter to exactly that progress before anything is read back.
 */
export function installStillCapture(deps: StillDeps): void {
  const section = document.querySelector<HTMLElement>(`#ch${deps.target.chapter}`);
  if (section === null) return;

  requestAnimationFrame(() => {
    const rect = section.getBoundingClientRect();
    window.scrollTo(0, rect.top + window.scrollY + deps.target.beat * rect.height);
    // Two frames: one for Lenis to reconcile its animated scroll with the native position,
    // one for ScrollTrigger's update to drive the chapter. If a build ever shows the pin
    // fighting the Lenis raf loop, the documented fallback (A6) is the Lenis instance's own
    // scrollTo(y, { immediate: true }) — which would mean exposing it from Timeline.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => capture(deps));
    });
  });
}

function capture(deps: StillDeps): void {
  const { renderer, scene, camera, canvas } = deps.stage;
  const width = deps.el.clientWidth;
  const height = deps.el.clientHeight;
  const previousPixelRatio = renderer.getPixelRatio();

  // ponytail: canvas only — the DOM overlay copy is not composited into the export. The
  // shell-parity stills sit beside their copy in the prerendered HTML, and the
  // reduced-motion and OG consumers want the clean frame. REVIEWS.md F-11 asks for the WOW
  // beats to be *reviewed* on composited full-viewport frames; that is a different capture
  // (a headless-browser page screenshot) and it belongs to 03-19-T3, not to this tool.
  renderer.setPixelRatio(CAPTURE_DPR);
  renderer.setSize(width, height, false);
  camera.updateProjectionMatrix();
  // Through Stage's own draw path, never `renderer.render` directly: on the tier that runs
  // the post pass those are two different images, and this tool exists to judge the shipped
  // one (Ruling 10 §4a — the LOOK frames).
  deps.stage.draw();
  canvas.toBlob(
    (blob) => {
      if (blob !== null) save(blob, filenameFor(deps.target));
    },
    'image/webp',
    CAPTURE_QUALITY,
  );

  renderer.setPixelRatio(previousPixelRatio);
  renderer.setSize(width, height, false);
  deps.stage.invalidate();
}

/** `ch4-072.webp` — assembled from the two parsed numbers and nothing else. */
function filenameFor(target: StillTarget): string {
  return `ch${target.chapter}-${String(Math.round(target.beat * 100)).padStart(3, '0')}.webp`;
}

function save(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a task later: click() only *starts* the download, and pulling the object URL
  // out from under it in the same task cancels it in Chromium.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
