import { describe, it, expect } from 'vitest';
import { classifyMxRecords } from '../mxValidation';

describe('classifyMxRecords', () => {
  it('flags an RFC 7505 null MX (empty exchange) as null-mx', () => {
    // What dns.resolveMx returns for a domain publishing `MX 0 .` (e.g. example.com).
    expect(classifyMxRecords([{ exchange: '', priority: 0 }])).toBe('null-mx');
  });

  it('flags a null MX expressed with a "." exchange as null-mx', () => {
    expect(classifyMxRecords([{ exchange: '.', priority: 0 }])).toBe('null-mx');
  });

  it('tolerates a whitespace-only exchange as null-mx', () => {
    expect(classifyMxRecords([{ exchange: '   ' }])).toBe('null-mx');
  });

  it('treats one or more real MX hosts as accepts', () => {
    expect(classifyMxRecords([{ exchange: 'aspmx.l.google.com', priority: 1 }])).toBe('accepts');
    expect(
      classifyMxRecords([
        { exchange: 'alt1.aspmx.l.google.com', priority: 5 },
        { exchange: 'aspmx.l.google.com', priority: 1 },
      ]),
    ).toBe('accepts');
  });

  it('treats a mix of a null placeholder + a real host as accepts', () => {
    expect(
      classifyMxRecords([
        { exchange: '.', priority: 0 },
        { exchange: 'mail.realdomain.com', priority: 10 },
      ]),
    ).toBe('accepts');
  });

  it('returns no-mx for an empty array so the caller may A/AAAA-fallback', () => {
    expect(classifyMxRecords([])).toBe('no-mx');
  });
});
