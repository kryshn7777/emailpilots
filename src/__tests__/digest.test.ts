import { describe, it, expect } from 'vitest';
import { computeAwayDigest, digestLine } from '../digest';

const base = (sent = 10, replies = 2, interested = 1) => ({ sent, replies, interested, at: '2026-07-18T00:00:00.000Z' });

describe('computeAwayDigest', () => {
  it('no baseline (first boot) → never shows', () => {
    expect(computeAwayDigest(null, { sent: 50, replies: 5, interested: 2 }).show).toBe(false);
  });

  it('activity since baseline → shows with deltas', () => {
    const r = computeAwayDigest(base(10, 2, 1), { sent: 15, replies: 4, interested: 2 });
    expect(r).toEqual({ show: true, deltaSent: 5, deltaReplies: 2, deltaInterested: 1 });
  });

  it('replies alone are enough to show (the reward case)', () => {
    const r = computeAwayDigest(base(10, 2, 1), { sent: 10, replies: 3, interested: 1 });
    expect(r.show).toBe(true);
    expect(r.deltaReplies).toBe(1);
  });

  it('no change → quiet', () => {
    expect(computeAwayDigest(base(), { sent: 10, replies: 2, interested: 1 }).show).toBe(false);
  });

  it('lifetime zero sends → quiet even if a stray reply appears', () => {
    expect(computeAwayDigest(base(0, 0, 0), { sent: 0, replies: 1, interested: 0 }).show).toBe(false);
  });

  it('state reset (negative deltas) clamps and stays quiet', () => {
    const r = computeAwayDigest(base(100, 10, 5), { sent: 3, replies: 0, interested: 0 });
    expect(r).toEqual({ show: false, deltaSent: 0, deltaReplies: 0, deltaInterested: 0 });
  });
});

describe('digestLine', () => {
  it('reward first, interested folded in, next-run appended', () => {
    const line = digestLine({ show: true, deltaSent: 5, deltaReplies: 2, deltaInterested: 1 }, 'Monday at 09:00');
    expect(line).toBe('2 replies (1 interested) · 5 sent · Next: Monday at 09:00');
  });

  it('singular reply, no interested, no next-run', () => {
    const line = digestLine({ show: true, deltaSent: 0, deltaReplies: 1, deltaInterested: 0 }, null);
    expect(line).toBe('1 reply');
  });

  it('sends only', () => {
    const line = digestLine({ show: true, deltaSent: 7, deltaReplies: 0, deltaInterested: 0 }, 'Today at 15:00');
    expect(line).toBe('7 sent · Next: Today at 15:00');
  });
});
