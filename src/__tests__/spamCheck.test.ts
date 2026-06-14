import { describe, it, expect } from 'vitest';
import { checkSpam } from '../spamCheck';

describe('checkSpam', () => {
  it('passes a normal, personal message', () => {
    const r = checkSpam(
      'Following up on my application',
      '<p>Hi {{name}}, just following up on the role we discussed. Thanks for your time.</p>',
      true,
    );
    expect(r.level).toBe('clean');
    expect(r.score).toBeLessThan(3);
  });

  it('flags a spammy message as risky', () => {
    const r = checkSpam(
      'FREE MONEY ACT NOW!!!',
      '<p>CONGRATULATIONS winner! Click here to claim your free cash. 100% guarantee, buy now!</p>',
      false,
    );
    expect(r.level).toBe('risky');
    expect(r.findings.length).toBeGreaterThan(2);
  });

  it('does not count a mailto: unsubscribe link as a marketing link', () => {
    const html = '<p>Hello there, thanks for reading our update today.</p>'
      + '<a href="mailto:me@x.com?subject=Unsubscribe">unsubscribe</a>';
    const r = checkSpam('Hello', html, true);
    expect(r.findings.some(f => /link/i.test(f.label))).toBe(false);
  });

  it('warns when there is no plain-text alternative', () => {
    const r = checkSpam('Hello', '<p>Some body content here for the reader.</p>', false);
    expect(r.findings.some(f => /plain-text/i.test(f.label))).toBe(true);
  });
});
