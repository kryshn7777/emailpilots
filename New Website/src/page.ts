/**
 * DOM-side behaviors that must re-bind after every Swup container swap:
 * scroll reveals and the magnetic CTA. Deliberately dependency-free — this
 * ships in the initial bundle, before the lazy engine chunk.
 */

let observer: IntersectionObserver | null = null;
const magnetCleanups: (() => void)[] = [];

export function bindPage(): void {
  bindReveals();
  bindMagnets();
}

function bindReveals(): void {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.25 },
  );
  for (const el of document.querySelectorAll('[data-reveal]')) {
    if (!el.classList.contains('is-in')) observer.observe(el);
  }
}

function bindMagnets(): void {
  for (const cleanup of magnetCleanups.splice(0)) cleanup();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const el of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = 0;

    const tick = (): void => {
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.2) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const onMove = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 130;
      if (dist < radius) {
        const pull = 1 - dist / radius;
        targetX = dx * pull * 0.4;
        targetY = dy * pull * 0.4;
      } else {
        targetX = 0;
        targetY = 0;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    magnetCleanups.push(() => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
      el.style.transform = '';
    });
  }
}
