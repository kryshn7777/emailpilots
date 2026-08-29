import { describe, it, expect } from 'vitest';
import {
  TOUR_STEPS,
  VIEW_HINTS,
  visibleSteps,
  placeCard,
  spotlightRects,
  CARD_MIN_Y,
  type TourGateState,
  type Rect,
} from '../tour';

const connected: TourGateState = { connected: true, exploring: false, hasRecipients: false, hasSequences: false };
const unconnected: TourGateState = { connected: false, exploring: true, hasRecipients: false, hasSequences: false };

describe('TOUR_STEPS data', () => {
  it('stays a short tour with unique, well-formed steps', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(8);
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.target).toMatch(/^#[\w-]+$/); // parity-mirrored id selectors only
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.view.length).toBeGreaterThan(0);
    }
  });

  it('hints only cover views the tour does not visit', () => {
    const tourViews = new Set(TOUR_STEPS.map(s => s.view));
    for (const view of Object.keys(VIEW_HINTS)) {
      expect(tourViews.has(view)).toBe(false);
    }
  });
});

describe('visibleSteps', () => {
  it('shows every step to a connected user', () => {
    expect(visibleSteps(TOUR_STEPS, connected).length).toBe(TOUR_STEPS.length);
  });

  it('drops the connection-gated steps for an unconnected user, preserving order', () => {
    const vis = visibleSteps(TOUR_STEPS, unconnected);
    const ids = vis.map(s => s.id);
    expect(ids).not.toContain('flight-plan');
    expect(ids).not.toContain('deliverability');
    const all = TOUR_STEPS.map(s => s.id).filter(id => ids.includes(id));
    expect(ids).toEqual(all);
  });
});

describe('placeCard', () => {
  const vp = { w: 1000, h: 700 };
  const card = { w: 340, h: 180 };

  it('places below when there is room', () => {
    const p = placeCard({ x: 100, y: 100, w: 200, h: 40 }, card, vp);
    expect(p.placement).toBe('below');
    expect(p.y).toBe(100 + 40 + 12);
    expect(p.x).toBe(100);
  });

  it('flips above near the bottom edge', () => {
    const p = placeCard({ x: 100, y: 600, w: 200, h: 60 }, card, vp);
    expect(p.placement).toBe('above');
    expect(p.y).toBe(600 - 12 - 180);
  });

  it('falls back to the side when neither above nor below fits', () => {
    const p = placeCard({ x: 100, y: 60, w: 200, h: 600 }, { w: 340, h: 300 }, vp);
    expect(p.placement).toBe('right');
    expect(p.x).toBe(100 + 200 + 12);
  });

  it('clamps into the viewport horizontally', () => {
    const p = placeCard({ x: 900, y: 100, w: 80, h: 40 }, card, vp);
    expect(p.x + card.w).toBeLessThanOrEqual(vp.w - 12);
  });

  it('never rises into the native caption-button strip', () => {
    const p = placeCard({ x: 10, y: 0, w: 60, h: 10 }, { w: 340, h: 900 }, vp);
    expect(p.y).toBeGreaterThanOrEqual(CARD_MIN_Y);
  });
});

describe('spotlightRects', () => {
  const vp = { w: 1000, h: 700 };

  it('tiles the viewport exactly around the padded hole', () => {
    const t: Rect = { x: 200, y: 200, w: 100, h: 50 };
    const r = spotlightRects(t, vp, 8);
    expect(r.hole).toEqual({ x: 192, y: 192, w: 116, h: 66 });
    // top band spans the full width down to the hole
    expect(r.top).toEqual({ x: 0, y: 0, w: vp.w, h: 192 });
    // bottom band starts at the hole's lower edge
    expect(r.bottom.y).toBe(192 + 66);
    expect(r.bottom.h).toBe(vp.h - (192 + 66));
    // side bands share the hole's vertical extent
    expect(r.left).toEqual({ x: 0, y: 192, w: 192, h: 66 });
    expect(r.right).toEqual({ x: 192 + 116, y: 192, w: vp.w - (192 + 116), h: 66 });
    // total area = overlay area (no gaps, no overlap)
    const area = (q: Rect) => q.w * q.h;
    const total = area(r.top) + area(r.bottom) + area(r.left) + area(r.right) + area(r.hole);
    expect(total).toBe(vp.w * vp.h);
  });

  it('spotlights a target in the title-bar strip at full height, unclipped', () => {
    // GUI2's scheduler tile lives at y≈3, h≈38: the hole must keep its whole
    // height (plus padding, clamped at the viewport edge), not a sliver.
    const r = spotlightRects({ x: 600, y: 3, w: 200, h: 38 }, vp, 8);
    expect(r.hole.y).toBe(0);
    expect(r.hole.h).toBe(49);
    expect(r.top.h).toBe(0);
  });

  it('clamps the hole to the viewport edges', () => {
    const r = spotlightRects({ x: 950, y: 650, w: 100, h: 100 }, vp, 8);
    expect(r.hole.x + r.hole.w).toBeLessThanOrEqual(vp.w);
    expect(r.hole.y + r.hole.h).toBeLessThanOrEqual(vp.h);
    expect(r.bottom.h).toBe(0);
    expect(r.right.w).toBe(0);
  });
});
