import { describe, it, expect } from 'vitest';
import {
  checkSpam,
  spamVerdict,
  sortedFindings,
  htmlToReadableText,
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
    const r = checkSpam('Following up on Tuesday', body + mailtos, true);
    // Structural, not prose-matched, so label copy can be reworded freely.
    expect(r.findings).toHaveLength(0);
    expect(r.level).toBe('clean');
  });

  it('does count http links, so the mailto: test above is not vacuous', () => {
    const body = '<p>Hello there, thanks for reading our update today.</p>';
    const links = '<a href="https://x.com/a">a</a>'.repeat(5);
    const r = checkSpam('Following up on Tuesday', body + links, true);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('low');
  });

  it('warns when there is no plain-text alternative', () => {
    const withText = checkSpam('Following up on Tuesday', '<p>Some body content here for the reader.</p>', true);
    const noText = checkSpam('Following up on Tuesday', '<p>Some body content here for the reader.</p>', false);
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
    const fromHtml = checkSpam('Following up on Tuesday', withLinks, true).findings;
    expect(fromHtml).toHaveLength(1);
    expect(fromHtml[0].label).toMatch(/links/);
    // ...but the readable text cannot, which is exactly why analysis keeps the HTML.
    expect(checkSpam('Following up on Tuesday', htmlToReadableText(withLinks), true).findings).toHaveLength(0);
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

describe('checkSpam rule routing', () => {
  // Every input that can make checkSpam emit a finding, and the category that
  // finding must land in. If a rule is ever added without a home, this table is
  // what fails — the compiler catches a missing field, this catches a wrong one.
  const RULES: Array<[string, () => SpamFinding[], SpamCategory]> = [
    ['ALL CAPS subject', () => checkSpam('SHOUTING LOUDLY HERE', '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['long subject', () => checkSpam('x'.repeat(71), '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['empty subject', () => checkSpam('', '<p>Some ordinary body text, long enough.</p>', true).findings, 'subject'],
    ['exclamations', () => checkSpam('Hi!!', '<p>Some ordinary body text, long enough.</p>', true).findings, 'wording'],
    ['$$$ amounts', () => checkSpam('Following up on Tuesday', '<p>Send $$$ today please, this is long enough.</p>', true).findings, 'wording'],
    ['spam words', () => checkSpam('Following up on Tuesday', '<p>A free discount, and this body is long enough.</p>', true).findings, 'wording'],
    ['many spam words', () => checkSpam('Following up on Tuesday', '<p>free cash discount guarantee winner, long enough body.</p>', true).findings, 'wording'],
    ['too many links', () => checkSpam('Following up on Tuesday', '<p>Body text long enough.</p>' + '<a href="https://x.com">a</a>'.repeat(9), true).findings, 'links'],
    ['some links', () => checkSpam('Following up on Tuesday', '<p>Body text long enough.</p>' + '<a href="https://x.com">a</a>'.repeat(5), true).findings, 'links'],
    ['image-only', () => checkSpam('Following up on Tuesday', '<img src="x.png"><p>tiny</p>', true).findings, 'content'],
    ['empty body', () => checkSpam('Following up on Tuesday', '<p>hi</p>', true).findings, 'content'],
    ['no plain text', () => checkSpam('Following up on Tuesday', '<p>Some ordinary body text, long enough.</p>', false).findings, 'format'],
  ];

  it.each(RULES)('routes %s to its category', (_name, run, expected) => {
    const findings = run();
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some(x => x.category === expected)).toBe(true);
  });
});

// Deliverability audit DLV-6: two link shapes receivers treat as phishing signals
// were invisible to the advisory scan — URL shorteners (SpamAssassin/Gmail flag
// them: the destination is hidden) and anchor text that LOOKS like a URL but
// points somewhere else (the classic phishing pattern). Structural assertions
// (category + severity), not label prose, per the repo convention.
describe('checkSpam — phishing-shaped links (DLV-6)', () => {
  const body = '<p>Here is the deck I mentioned yesterday, have a look when you can.</p>';

  it('flags a shortened link (bit.ly & co) as a medium links finding', () => {
    const r = checkSpam('Following up on Tuesday', body + '<a href="https://bit.ly/3xYz">deck</a>', true);
    expect(r.findings.filter(f => f.category === 'links')).toMatchObject([{ severity: 'med' }]);
  });

  it('does not flag an ordinary full-length link', () => {
    const r = checkSpam('Following up on Tuesday', body + '<a href="https://acme.com/deck">deck</a>', true);
    expect(r.findings).toHaveLength(0);
  });

  it('flags link text that shows a different domain than the href points to', () => {
    const r = checkSpam('Following up on Tuesday', body + '<a href="https://evil.example/x">https://acme.com/deck</a>', true);
    expect(r.findings.filter(f => f.category === 'links')).toMatchObject([{ severity: 'high' }]);
  });

  it('does not flag link text that matches the href host, or that is not a URL', () => {
    const same = checkSpam('Following up on Tuesday', body + '<a href="https://acme.com/deck">www.acme.com/deck</a>', true);
    const words = checkSpam('Following up on Tuesday', body + '<a href="https://acme.com/deck">the deck</a>', true);
    expect(same.findings).toHaveLength(0);
    expect(words.findings).toHaveLength(0);
  });
});

// Deliverability audit DLV-16: the vocabulary rule matched substrings, so
// "freelance", "incoming" and "Cashman" tripped it on perfectly ordinary notes —
// an advisory that cries wolf is one the user learns to ignore. Whole-word
// matching only. Same pass adds the bare-IP link, a classic phishing shape
// receivers score hard.
describe('checkSpam — whole-word vocabulary + bare-IP links (DLV-16)', () => {
  const body = '<p>Here is the deck I mentioned yesterday, have a look when you can.</p>';

  it('does not flag words hiding inside ordinary ones (freelance, incoming, Cashman)', () => {
    const r = checkSpam('Intro', '<p>I am a freelance designer handling incoming requests for Cashman Ltd.</p>', true);
    expect(r.findings.filter(f => f.category === 'wording')).toHaveLength(0);
  });

  it('still flags the same words when they stand alone', () => {
    const r = checkSpam('Free guide', '<p>Buy now, 100% guaranteed. Act now.</p>', true);
    expect(r.findings.filter(f => f.category === 'wording')).toMatchObject([{ severity: 'high' }]);
  });

  it('flags a link that points at a bare IP address', () => {
    const r = checkSpam('Following up on Tuesday', body + '<a href="http://203.0.113.5/deck">deck</a>', true);
    expect(r.findings.filter(f => f.category === 'links')).toMatchObject([{ severity: 'high' }]);
  });
});

// Deliverability audit DLV-18 (live report, 2026-08-29): subject "Hello", body
// "Hi cutie", sent from an outlook.com mailbox via Graph, landed in Gmail's spam
// folder with the banner "similar to messages that were identified as spam in the
// past" — and this file had rated it clean (one medium "nearly empty" finding,
// score 2, under the warn bar). A subject that says nothing is the single most
// common spam subject; it is a similarity signal on its own.
describe('checkSpam — generic subject (DLV-18)', () => {
  const body = '<p>Hi Sam, thanks for the time on Tuesday. Attached is the deck we discussed.</p>';

  it('rates the reported message ("Hello" / "Hi cutie") as warn, not clean', () => {
    const r = checkSpam('Hello', 'Hi cutie', true);
    expect(r.findings.filter(f => f.category === 'subject')).toMatchObject([{ severity: 'med' }]);
    // Must clear the warn bar: mailProcessor.warnIfSpammy only logs a non-clean
    // report, and the preview banner only lists findings when not clean.
    expect(r.level).toBe('warn');
  });

  it('matches the greeting/test subjects regardless of case, spacing and punctuation', () => {
    for (const s of ['hello', 'Hi!', ' Hey ', 'HI THERE', 'Hello there.', 'Test', 'testing', 'Quick question?', 'Important']) {
      expect(checkSpam(s, body, true).findings.some(f => f.category === 'subject'), s).toBe(true);
    }
  });

  it('leaves a specific subject alone, including one that merely starts with a greeting', () => {
    for (const s of ['Following up on Tuesday', 'Hello from the Acme design team', 'Test results for the Q3 build', 'Quick question about your React role']) {
      expect(checkSpam(s, body, true).findings, s).toHaveLength(0);
    }
  });
});
