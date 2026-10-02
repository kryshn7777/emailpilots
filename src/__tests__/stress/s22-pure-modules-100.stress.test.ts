// STRESS S22 — pure-module sweep at 100-scale: CSV mapping/dedupe, MX
// classification, account-store upsert cycling, and hostile account-id
// sanitization.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectMapping, buildRecordsFromRows, isValidEmail } from '../../csvMapping';
import { classifyMxRecords } from '../../mxValidation';
import { readAccounts, upsertAccount, removeAccount, MAX_EXTRA_ACCOUNTS } from '../../accountStore';
import { accountStateFileName } from '../../accountFiles';
import type { Account } from '../../config';
import { stressDir, rmDir, silenceConsole } from './helpers';

describe('S22 — pure modules at 100-scale', () => {
  let dir: string;
  let unquiet: () => void;
  beforeEach(() => {
    dir = stressDir('s22');
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    rmDir(dir);
  });

  it('CSV: 100 rows → 60 added, 30 duplicate-skipped, 10 invalid-skipped; accountId column stripped; merge vars kept', { timeout: 120_000 }, () => {
    const mapping = detectMapping(['E-Mail Address', 'Full Name', 'Subject Line', 'Message Body', 'company', 'accountId']);
    expect(mapping.email).toBe('E-Mail Address');
    expect(mapping.name).toBe('Full Name');
    expect(mapping.subject).toBe('Subject Line');
    expect(mapping.message).toBe('Message Body');

    const rows: Record<string, string>[] = [];
    for (let i = 0; i < 60; i++) {
      rows.push({
        'E-Mail Address': `csv${i}@x.test`, 'Full Name': `P ${i}`,
        'Subject Line': `S${i}`, 'Message Body': `M${i}`,
        company: `Co${i}`, accountId: 'evil-account',
      });
    }
    for (let i = 0; i < 20; i++) rows.push({ 'E-Mail Address': `csv${i}@x.test` });          // dupes within file
    for (let i = 0; i < 10; i++) rows.push({ 'E-Mail Address': `not-an-email-${i}` });        // invalid
    for (let i = 0; i < 10; i++) rows.push({ 'E-Mail Address': `existing${i}@x.test` });      // dupes vs existing

    const existing = Array.from({ length: 10 }, (_, i) => `EXISTING${i}@x.test`); // case-insensitive match
    const { records, summary } = buildRecordsFromRows(rows, mapping, existing);

    expect(summary).toEqual({ added: 60, skippedDuplicate: 30, skippedInvalid: 10 });
    expect(records).toHaveLength(60);
    expect(records[0].company).toBe('Co0');            // merge var retained
    expect(records[0].accountId).toBeUndefined();      // reserved column stripped
    expect(records.every(r => isValidEmail(r.email))).toBe(true);
  });

  it('MX classification: null-MX never falls back, 100-record lists classify exactly', () => {
    expect(classifyMxRecords([])).toBe('no-mx');
    expect(classifyMxRecords([{ exchange: '.', priority: 0 }])).toBe('null-mx');
    expect(classifyMxRecords([{ exchange: '' }, { exchange: '.' }])).toBe('null-mx');

    const hundredReal = Array.from({ length: 100 }, (_, i) => ({ exchange: `mx${i}.x.test`, priority: i }));
    expect(classifyMxRecords(hundredReal)).toBe('accepts');
    // One real MX among 99 null entries still accepts.
    expect(classifyMxRecords([...Array.from({ length: 99 }, () => ({ exchange: '.' })), { exchange: 'mx.x.test' }])).toBe('accepts');
  });

  it('accountStore: 100 upserts cycling 5 ids stay 5 accounts; removes work; hostile ids cannot escape basePath', { timeout: 120_000 }, () => {
    for (let i = 0; i < 100; i++) {
      const id = `acct${(i % 5) + 1}`;
      const acc: Account = {
        id, label: `v${i}`, host: 'smtp.x.test', port: 587,
        user: `${id}@x.test`, pass: '', enabled: true,
      };
      const all = upsertAccount(dir, acc);
      expect(all.length).toBeLessThanOrEqual(5);
    }
    const finalList = readAccounts(dir);
    expect(finalList).toHaveLength(5);
    // Last write per id won.
    expect(finalList.find(a => a.id === 'acct1')?.label).toBe('v95');
    expect(finalList.length).toBeLessThanOrEqual(MAX_EXTRA_ACCOUNTS);

    expect(removeAccount(dir, 'acct3')).toHaveLength(4);
    expect(readAccounts(dir).some(a => a.id === 'acct3')).toBe(false);

    // Hostile ids sanitize to underscores — no path traversal into parent dirs.
    expect(accountStateFileName('limits', '../evil')).toBe('limits.___evil.json');
    expect(accountStateFileName('limits', '..\\..\\x')).toBe('limits.______x.json'); // one '_' per replaced char
    expect(accountStateFileName('limits', 'a/b:c')).toBe('limits.a_b_c.json');
    expect(accountStateFileName('limits', 'default')).toBe('limits.json');
    expect(accountStateFileName('limits')).toBe('limits.json');
  });
});
