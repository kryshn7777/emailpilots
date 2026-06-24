import { describe, it, expect } from 'vitest';
import Mustache from 'mustache';
import { applyMergeDefaults } from '../mergeDefaults';

// Full pipeline exactly as renderEmail uses it: defaults pre-pass, then Mustache.
function render(template: string, record: Record<string, any>): string {
  return Mustache.render(applyMergeDefaults(template, record), record);
}

describe('applyMergeDefaults', () => {
  it('renders the value when the field is present', () => {
    expect(render('Hi {{name|there}}', { name: 'Jane' })).toBe('Hi Jane');
  });

  it('falls back to the default when the field is an empty string', () => {
    expect(render('Hi {{name|there}}', { name: '' })).toBe('Hi there');
  });

  it('falls back when the field is whitespace-only', () => {
    expect(render('Hi {{name|there}}', { name: '   ' })).toBe('Hi there');
  });

  it('falls back when the key is missing entirely', () => {
    expect(render('Hi {{name|there}}', {})).toBe('Hi there');
  });

  it('HTML-escapes a present value in a double-stache tag', () => {
    expect(render('{{co|x}}', { co: 'A & B' })).toBe('A &amp; B');
  });

  it('HTML-escapes the default in a double-stache tag', () => {
    expect(render('{{co|A & B}}', {})).toBe('A &amp; B');
  });

  it('does NOT escape a present value in a triple-stache tag', () => {
    expect(render('{{{co|x}}}', { co: 'A & B' })).toBe('A & B');
  });

  it('does NOT escape the default in a triple-stache tag', () => {
    expect(render('{{{co|A & B}}}', {})).toBe('A & B');
  });

  it('leaves a no-pipe tag untouched (regression guard)', () => {
    expect(applyMergeDefaults('Hi {{name}}', { name: 'Jane' })).toBe('Hi {{name}}');
    expect(render('Hi {{name}}', { name: 'Jane' })).toBe('Hi Jane');
  });

  it('treats an empty default as empty output on a missing key', () => {
    expect(render('Hi {{name|}}!', {})).toBe('Hi !');
  });

  it('resolves multiple tokens on one line, mixed present/empty', () => {
    const out = render('Hi {{name|there}}, saw {{company|your team}}', { name: '', company: 'Acme' });
    expect(out).toBe('Hi there, saw Acme');
  });

  it('trims whitespace around the default', () => {
    expect(render('Hi {{name|  there  }}', {})).toBe('Hi there');
  });
});
