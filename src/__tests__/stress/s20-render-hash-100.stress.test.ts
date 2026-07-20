// STRESS S20 — renderEmail + contentHash across 100 recipients in three
// campaign modes (inline campaign template / disk template.html / raw message):
// determinism, subject precedence, primary-mode stripping, and exactly which
// cohort a global-subject edit re-hashes (R10 boundary, made precise).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderEmail } from '../../renderer';
import { contentHash } from '../../sentLedger';
import { makeStressConfig, stressDir, rmDir, silenceConsole } from './helpers';

const N = 100;
const mode = (i: number) => i % 3;       // 0: camp1 (inline tpl) · 1: camp2 (disk tpl) · 2: no campaign (disk tpl)
const hasCustomSubject = (i: number) => i % 10 === 0;

function makeRecords(): any[] {
  return Array.from({ length: N }, (_, i) => ({
    email: `r${i}@stress.test`,
    name: `Recipient ${i}`,
    active: true,
    messageType: 'text',
    messageContent: `Body ${i} for {{name}}.`,
    ...(mode(i) === 0 ? { campaignId: 'camp1' } : mode(i) === 1 ? { campaignId: 'camp2' } : {}),
    ...(hasCustomSubject(i) ? { subject: 'Custom & subject {{name}}' } : {}),
  }));
}

describe('S20 — render/hash stability across 100 recipients × 3 campaign modes', () => {
  let dir: string;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s20');
    unquiet = silenceConsole();
    fs.writeFileSync(
      path.join(dir, 'template.html'),
      '<html><head><title>T</title></head><body><style>.x{color:red}</style><p>Global wrap: {{{message}}}</p></body></html>',
    );
  });
  afterEach(() => {
    unquiet();
    rmDir(dir);
  });

  const cfgWith = (subject: string) => makeStressConfig(dir, {
    email: { subject },
    campaigns: [
      { id: 'camp1', name: 'C1', subject: 'C1: {{name}}', template: '<div>C1 wrap: {{{message}}}</div>' },
      { id: 'camp2', name: 'C2' }, // no overrides → global template + subject
    ],
  });

  it('deterministic rendering, 100 unique hashes, correct template + subject precedence per cohort', { timeout: 30_000 }, () => {
    const cfg = cfgWith('Quick follow-up');
    const records = makeRecords();
    const hashes = new Set<string>();

    for (let i = 0; i < N; i++) {
      const a = renderEmail(records[i], cfg);
      const b = renderEmail(records[i], cfg);
      // Double-render determinism → stable content identity for the ledger.
      expect(contentHash(a.subject, a.body)).toBe(contentHash(b.subject, b.body));
      hashes.add(contentHash(a.subject, a.body));

      // Merge vars rendered.
      expect(a.body).toContain(`Body ${i} for Recipient ${i}.`);

      // Template precedence: inline campaign template beats template.html.
      if (mode(i) === 0) {
        expect(a.body).toContain('C1 wrap:');
        expect(a.body).not.toContain('Global wrap:');
      } else {
        expect(a.body).toContain('Global wrap:');
        // Primary placement strips <head> and <style> from the disk template.
        expect(a.body).not.toContain('<style>');
        expect(a.body).not.toContain('<head>');
      }

      // Subject precedence: record > campaign > global — and htmlUnescape keeps
      // the literal '&' (Mustache would have escaped it).
      if (hasCustomSubject(i)) {
        expect(a.subject).toBe(`Custom & subject Recipient ${i}`);
      } else if (mode(i) === 0) {
        expect(a.subject).toBe(`C1: Recipient ${i}`);
      } else {
        expect(a.subject).toBe('Quick follow-up');
      }

      // No unsubscribe header in primary mode.
      expect(a.listUnsubscribe).toBeUndefined();
    }

    expect(hashes.size).toBe(N); // unique bodies → unique identities
  });

  it('editing the GLOBAL subject re-hashes exactly the global-subject cohort — campaign/custom subjects are immune', { timeout: 30_000 }, () => {
    const before = cfgWith('Quick follow-up');
    const after = cfgWith('Quick follow-up!'); // one-char edit
    const records = makeRecords();

    let flipped = 0;
    for (let i = 0; i < N; i++) {
      const a = renderEmail(records[i], before);
      const b = renderEmail(records[i], after);
      const changed = contentHash(a.subject, a.body) !== contentHash(b.subject, b.body);
      const usesGlobalSubject = !hasCustomSubject(i) && mode(i) !== 0;
      expect(changed, `record ${i}`).toBe(usesGlobalSubject);
      if (changed) flipped++;
    }

    // 100 minus camp1 cohort (34: i%3===0) minus custom-subject records outside
    // camp1. Computed, not hardcoded, so the cohort math stays honest.
    const expected = Array.from({ length: N }, (_, i) => i)
      .filter(i => !hasCustomSubject(i) && mode(i) !== 0).length;
    expect(flipped).toBe(expected);
  });
});
