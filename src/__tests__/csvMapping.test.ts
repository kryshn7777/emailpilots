import { describe, it, expect } from 'vitest';
import { detectMapping, isValidEmail, buildRecordsFromRows } from '../csvMapping';

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('  jane@example.com  ')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('detectMapping', () => {
  it('matches standard headers case-insensitively', () => {
    const m = detectMapping(['Email Address', 'Full Name', 'Subject', 'Message']);
    expect(m.email).toBe('Email Address');
    expect(m.name).toBe('Full Name');
    expect(m.subject).toBe('Subject');
    expect(m.message).toBe('Message');
  });
  it('prefers an exact "name" header over "company"', () => {
    const m = detectMapping(['Company', 'Name', 'email']);
    expect(m.name).toBe('Name');
    expect(m.email).toBe('email');
  });
  it('falls back to company when no name column exists', () => {
    const m = detectMapping(['company', 'email']);
    expect(m.name).toBe('company');
  });
  it('returns null for fields with no matching column', () => {
    const m = detectMapping(['email']);
    expect(m.email).toBe('email');
    expect(m.subject).toBeNull();
    expect(m.message).toBeNull();
  });
});

describe('buildRecordsFromRows', () => {
  const mapping = { email: 'email', name: 'name', subject: 'subject', message: 'message' };

  it('builds well-formed recipient records', () => {
    const rows = [{ email: 'a@x.com', name: 'A', subject: 'Hi', message: 'Hello {{name}}' }];
    const { records, summary } = buildRecordsFromRows(rows, mapping, []);
    expect(summary.added).toBe(1);
    expect(records[0]).toMatchObject({
      active: true,
      email: 'a@x.com',
      name: 'A',
      subject: 'Hi',
      messageType: 'text',
      messageContent: 'Hello {{name}}',
      scheduledDays: [],
      scheduledTimes: [],
      entropyMinutes: 0,
    });
    expect(records[0].attachments).toEqual([]);
  });

  it('skips invalid emails and counts them', () => {
    const rows = [
      { email: 'good@x.com', name: '', subject: '', message: '' },
      { email: 'bad-email', name: '', subject: '', message: '' },
    ];
    const { records, summary } = buildRecordsFromRows(rows, mapping, []);
    expect(records).toHaveLength(1);
    expect(summary.added).toBe(1);
    expect(summary.skippedInvalid).toBe(1);
  });

  it('skips emails already present in existingEmails (case-insensitive)', () => {
    const rows = [{ email: 'Dup@X.com', name: '', subject: '', message: '' }];
    const { records, summary } = buildRecordsFromRows(rows, mapping, ['dup@x.com']);
    expect(records).toHaveLength(0);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it('dedupes repeated emails within the same file', () => {
    const rows = [
      { email: 'one@x.com', name: 'First', subject: '', message: '' },
      { email: 'ONE@x.com', name: 'Second', subject: '', message: '' },
    ];
    const { records, summary } = buildRecordsFromRows(rows, mapping, []);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('First');
    expect(summary.added).toBe(1);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it('retains unmapped columns as merge variables', () => {
    const rows = [{ email: 'a@x.com', name: 'A', company: 'Acme', role: 'CTO' }];
    const map = { email: 'email', name: 'name', subject: null, message: null };
    const { records } = buildRecordsFromRows(rows, map, []);
    expect(records[0].company).toBe('Acme');
    expect(records[0].role).toBe('CTO');
  });

  it('returns nothing when no email column is mapped', () => {
    const rows = [{ email: 'a@x.com', name: 'A' }];
    const map = { email: null, name: 'name', subject: null, message: null };
    const { records, summary } = buildRecordsFromRows(rows, map, []);
    expect(records).toHaveLength(0);
    expect(summary.added).toBe(0);
  });
});
