import { describe, it, expect } from 'vitest';
import {
  checkSpam,
  spamVerdict,
  sortedFindings,
  htmlToReadableText,
  categorize,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  type SpamFinding,
  type SpamCategory,
} from '../spamCheck';

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

  it('does not count mailto: links as marketing links', () => {
    // Must cross the >4 link threshold: with a single link the count is 1 and no
    // finding fires whether or not mailto: is excluded, so such a test passes
    // even against a build with the exclusion removed. Five proves the rule.
    const body = '<p>Hello there, thanks for reading our update today.</p>';
    const mailtos = '<a href="mailto:me@x.com?subject=Unsubscribe">unsubscribe</a>'.repeat(5);
    const r = checkSpam('Hello', body + mailtos, true);
    // Structural, not prose-matched, so label copy can be reworded freely.
    expect(r.findings).toHaveLength(0);
    expect(r.level).toBe('clean');
  });

  it('does count http links, so the mailto: test above is not vacuous', () => {
    const body = '<p>Hello there, thanks for reading our update today.</p>';
    const links = '<a href="https://x.com/a">a</a>'.repeat(5);
    const r = checkSpam('Hello', body + links, true);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('low');
  });

  it('warns when there is no plain-text alternative', () => {
    const withText = checkSpam('Hello', '<p>Some body content here for the reader.</p>', true);
    const noText = checkSpam('Hello', '<p>Some body content here for the reader.</p>', false);
    // The hasPlainText=false arg is the only difference, so it must be the only
    // finding — asserted by difference rather than by matching label wording.
    expect(withText.findings).toHaveLength(0);
    expect(noText.findings).toHaveLength(1);
    expect(noText.findings[0].severity).toBe('low');
    expect(noText.score).toBe(1);
  });
});

describe('htmlToReadableText', () => {
  // The exact shape the Deliverability screen prefills from a default template —
  // this is what a non-technical user was being shown.
  const TEMPLATE = [
    '<!DOCTYPE html>', '<html>', '<head>', '<style>',
    '  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }',
    '</style>', '</head>', '<body>',
    '<p>Hi {{name}},</p>',
    '<p>Just following up on the role we discussed last week.</p>',
    '</body>', '</html>',
  ].join('\n');

  it('shows the words and none of the machinery', () => {
    const out = htmlToReadableText(TEMPLATE);
    expect(out).toBe('Hi {{name}},\n\nJust following up on the role we discussed last week.');
    for (const junk of ['DOCTYPE', '<style', 'font-family', '<html', '<head', '<p>', '#333']) {
      expect(out).not.toContain(junk);
    }
  });

  it('keeps paragraph breaks — one flat line is barely better than the markup', () => {
    expect(htmlToReadableText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
    expect(htmlToReadableText('a<br>b')).toBe('a\nb');
    expect(htmlToReadableText('a<br/>b')).toBe('a\nb');
  });

  it('collapses runaway blank lines', () => {
    expect(htmlToReadableText('<p>a</p><div></div><div></div><p>b</p>')).toBe('a\n\nb');
  });

  it('decodes entities without eating text the user escaped on purpose', () => {
    expect(htmlToReadableText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
    expect(htmlToReadableText('<p>use &lt;b&gt; for bold</p>')).toBe('use <b> for bold');
    expect(htmlToReadableText('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('passes plain text through untouched', () => {
    expect(htmlToReadableText('Hi Sam, following up.')).toBe('Hi Sam, following up.');
  });

  it('handles empty and nullish input', () => {
    expect(htmlToReadableText('')).toBe('');
    expect(htmlToReadableText(undefined as unknown as string)).toBe('');
  });

  it('strips scripts and comments entirely', () => {
    expect(htmlToReadableText('<p>hi</p><script>alert(1)</script><!-- note -->')).toBe('hi');
  });

  it('is display-only: it destroys the tags checkSpam needs, so the two must not be swapped', () => {
    // Body long enough that only the link rule can fire (a short one would also
    // trip "nearly empty" and muddy what this is proving).
    const withLinks = '<p>Hello there, thanks for reading our update today.</p>'
      + '<a href="https://x.com/a">a</a>'.repeat(5);
    // The HTML trips the link rule...
    const fromHtml = checkSpam('Hi', withLinks, true).findings;
    expect(fromHtml).toHaveLength(1);
    expect(fromHtml[0].label).toMatch(/links/);
    // ...but the readable text cannot, which is exactly why analysis keeps the HTML.
    expect(checkSpam('Hi', htmlToReadableText(withLinks), true).findings).toHaveLength(0);
  });
});

describe('spamVerdict', () => {
  it('maps both the rule and the AI vocabulary onto the same three states', () => {
    // The two surfaces must never describe one email differently.
    expect(spamVerdict('risky')).toEqual(spamVerdict('high'));
    expect(spamVerdict('warn')).toEqual(spamVerdict('medium'));
    expect(spamVerdict('clean')).toEqual(spamVerdict('low'));
  });

  it('gives three distinct verdicts', () => {
    const texts = (['clean', 'warn', 'risky'] as const).map(l => spamVerdict(l).text);
    expect(new Set(texts).size).toBe(3);
  });

  it('never shows a number — a score is meaningless to the reader', () => {
    for (const l of ['clean', 'warn', 'risky', 'low', 'medium', 'high'] as const) {
      expect(spamVerdict(l).text).not.toMatch(/\d/);
    }
  });

  it('pairs each verdict with its conventional colour', () => {
    expect(spamVerdict('risky').color).toBe('#dc2626');
    expect(spamVerdict('warn').color).toBe('#d97706');
    expect(spamVerdict('clean').color).toBe('#16a34a');
  });
});

describe('sortedFindings', () => {
  const f = (severity: SpamFinding['severity'], label: string, category: SpamCategory = 'wording'): SpamFinding =>
    ({ label, severity, category });

  it('orders worst-first', () => {
    const out = sortedFindings([f('low', 'c'), f('high', 'a'), f('med', 'b')]);
    expect(out.map(x => x.label)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input — the report is shared with the main process', () => {
    const input = [f('low', 'c'), f('high', 'a')];
    const snapshot = input.map(x => x.label);
    sortedFindings(input);
    expect(input.map(x => x.label)).toEqual(snapshot);
  });

  it('is stable within a severity, so equal-weight findings keep author order', () => {
    const out = sortedFindings([f('med', 'first'), f('high', 'top'), f('med', 'second')]);
    expect(out.map(x => x.label)).toEqual(['top', 'first', 'second']);
  });

  it('handles an empty list', () => {
    expect(sortedFindings([])).toEqual([]);
  });

  it('puts a real report in worst-first order', () => {
    // ALL-CAPS subject (high) + spam words (med) + long subject (low).
    const r = checkSpam(
      'FREE CASH GUARANTEE ACT NOW BECAUSE THIS OFFER IS ABOUT TO EXPIRE FOREVER OK',
      '<p>Some ordinary body text that is long enough to avoid the thin-content rule.</p>',
      true,
    );
    const order = sortedFindings(r.findings).map(x => x.severity);
    expect(order).toEqual([...order].sort((a, b) =>
      ({ high: 0, med: 1, low: 2 })[a] - ({ high: 0, med: 1, low: 2 })[b]));
    expect(order[0]).toBe('high');
  });
});

describe('categorize', () => {
  const f = (severity: SpamFinding['severity'], category: SpamCategory, label = 'x'): SpamFinding =>
    ({ label, severity, category });
  const row = (rows: ReturnType<typeof categorize>, c: SpamCategory) => rows.find(r => r.category === c)!;

  // Every input that can make checkSpam emit a finding, and the category that
  // finding must land in. If a rule is ever added without a home, this table is
  // what fails — the compiler catches a missing field, this catches a wrong one.
  const RULES: Array<[string, () => SpamFinding[], SpamCategory]> = [
    ['ALL CAPS subject', () => checkSpam('SHOUTING LOUDLY HERE', '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['long subject', () => checkSpam('x'.repeat(71), '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['empty subject', () => checkSpam('', '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['exclamations', () => checkSpam('Hi!!', '<p>Some ordinary body text, long enough.</p>', true).findings, 'wording'],
    ['$$$ amounts', () => checkSpam('Hi', '<p>Send $$$ today please, this is long enough.</p>', true).findings, 'wording'],
    ['spam words', () => checkSpam('Hi', '<p>A free discount, and this body is long enough.</p>', true).findings, 'wording'],
    ['many spam words', () => checkSpam('Hi', '<p>free cash discount guarantee winner, long enough body.</p>', true).findings, 'wording'],
    ['too many links', () => checkSpam('Hi', '<p>Body text long enough.</p>' + '<a href="https://x.com">a</a>'.repeat(9), true).findings, 'links'],
    ['some links', () => checkSpam('Hi', '<p>Body text long enough.</p>' + '<a href="https://x.com">a</a>'.repeat(5), true).findings, 'links'],
    ['image-only', () => checkSpam('Hi', '<img src="x.png"><p>tiny</p>', true).findings, 'content'],
    ['empty body', () => checkSpam('Hi', '<p>hi</p>', true).findings, 'content'],
    ['no plain text', () => checkSpam('Hi', '<p>Some ordinary body text, long enough.</p>', false).findings, 'format'],
  ];

  it.each(RULES)('routes %s to its category', (_name, run, expected) => {
    const findings = run();
    expect(findings.length).toBeGreaterThan(0);
    // Every finding this input produced is categorised, and the rule under test
    // put at least one into the expected bucket.
    for (const f of findings) expect(CATEGORY_ORDER).toContain(f.category);
    expect(findings.some(x => x.category === expected)).toBe(true);
  });

  it('covers every category — a new one cannot be added and silently never render', () => {
    // CATEGORY_ORDER is derived from CATEGORY_LABEL, so the compiler already
    // rejects a missing entry. This pins the half the compiler can't see: that
    // Object.keys order is the intended display order, and that the derivation
    // didn't quietly lose or reorder anything.
    expect(CATEGORY_ORDER).toEqual(['subject', 'wording', 'links', 'content', 'format']);
    expect(CATEGORY_ORDER).toHaveLength(Object.keys(CATEGORY_LABEL).length);
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABEL[c]).toBeTruthy();
    // Every category has a row, so no finding can land somewhere unrendered.
    expect(categorize([]).map(r => r.category)).toEqual(CATEGORY_ORDER);
  });

  it('always returns all five rows, in fixed order, even for a clean email', () => {
    const clean = checkSpam('Following up', '<p>Hi Sam, following up on our chat last week. Thanks.</p>', true);
    expect(clean.findings).toHaveLength(0);
    const rows = categorize(clean.findings);
    // The whole point: a pass must enumerate what passed.
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.category)).toEqual([...CATEGORY_ORDER]);
    expect(rows.map(r => r.label)).toEqual(CATEGORY_ORDER.map(c => CATEGORY_LABEL[c]));
    expect(rows.every(r => r.status === 'pass')).toBe(true);
    expect(rows.every(r => r.findings.length === 0)).toBe(true);
  });

  it('derives status from the worst severity in the row', () => {
    const rows = categorize([f('low', 'subject'), f('med', 'wording'), f('high', 'links')]);
    expect(row(rows, 'subject').status).toBe('warn');   // low  → Check
    expect(row(rows, 'wording').status).toBe('warn');   // med  → Check
    expect(row(rows, 'links').status).toBe('fail');     // high → Fix
    expect(row(rows, 'content').status).toBe('pass');   // none → OK
  });

  it('lets one high finding outrank a med in the same row', () => {
    const rows = categorize([f('med', 'wording', 'mild'), f('high', 'wording', 'severe')]);
    expect(row(rows, 'wording').status).toBe('fail');
    // and worst-first within the row, so the severe one is read first
    expect(row(rows, 'wording').findings.map(x => x.label)).toEqual(['severe', 'mild']);
  });

  it('does not mutate its input — the report is shared with the main process', () => {
    const input = [f('low', 'wording', 'a'), f('high', 'wording', 'b')];
    const snapshot = input.map(x => x.label);
    categorize(input);
    expect(input.map(x => x.label)).toEqual(snapshot);
  });

  it('keeps every finding — nothing is dropped between checkSpam and the card', () => {
    const r = checkSpam('FREE MONEY ACT NOW!!!', '<p>hi</p>', false);
    const total = categorize(r.findings).reduce((n, row) => n + row.findings.length, 0);
    expect(total).toBe(r.findings.length);
    expect(total).toBeGreaterThan(0);
  });
});
