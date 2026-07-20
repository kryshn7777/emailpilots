import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderEmail } from '../renderer';
import type { Config, Campaign } from '../config';

function tmpFile(contents: string): string {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ep-tpl-')), 'template.html');
  fs.writeFileSync(f, contents);
  return f;
}

function makeConfig(overrides: { templateHtml?: string; subject?: string; physicalAddress?: string; unsubscribeEnabled?: boolean; user?: string; inboxPlacement?: 'primary' | 'bulk'; campaigns?: Campaign[] } = {}): Config {
  return {
    userName: 'Tester',
    campaigns: overrides.campaigns ?? [],
    smtp: { host: 'smtp.x.com', port: 587, user: overrides.user ?? 'me@x.com', pass: 'pw' },
    paths: {
      recipientsCsv: '/tmp/r.csv',
      recipientsJson: '/tmp/r.json',
      templateHtml: overrides.templateHtml ?? '/nonexistent/template.html',
    },
    email: { subject: overrides.subject ?? 'Default Subject' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5, minDelayMs: 0, maxDelayMs: 0,
      maxAttachmentBytes: 1024, maxPerRecipientPerDay: 3, warmupEnabled: false, warmupCurve: [],
    },
    sender: {
      physicalAddress: overrides.physicalAddress ?? '',
      unsubscribeEnabled: overrides.unsubscribeEnabled ?? false,
      // Default 'bulk' here so the footer/List-Unsubscribe tests exercise that
      // path; primary-mode tests set it explicitly.
      inboxPlacement: overrides.inboxPlacement ?? 'bulk',
    },
    cronSchedule: '0 9 * * *',
  };
}

describe('renderEmail', () => {
  it('injects the message into the template and personalizes {{name}}', () => {
    const tpl = tmpFile('<body>Hello {{name}}<div>{{{message}}}</div></body>');
    const out = renderEmail({ email: 'sam@x.com', name: 'Sam', messageType: 'text', messageContent: 'Apply now please' }, makeConfig({ templateHtml: tpl }));
    expect(out.body).toContain('Hello Sam');
    expect(out.body).toContain('Apply now please');
  });

  it('falls back to the raw message when there is no template file', () => {
    const out = renderEmail({ email: 'sam@x.com', name: 'Sam', messageType: 'text', messageContent: 'Raw body {{name}}' }, makeConfig());
    expect(out.body).toContain('Raw body Sam');
  });

  it('uses the per-recipient subject over the default, with personalization', () => {
    const cfg = makeConfig({ subject: 'Default Subject' });
    const withOverride = renderEmail({ email: 's@x.com', name: 'Sam', subject: 'Hi {{name}}', messageType: 'text', messageContent: 'x' }, cfg);
    expect(withOverride.subject).toBe('Hi Sam');
    const withoutOverride = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'x' }, cfg);
    expect(withoutOverride.subject).toBe('Default Subject');
  });

  it('renders Direct-Text paragraphs as <br> line breaks in the HTML body (U20)', () => {
    const tpl = tmpFile('<body><div>{{{message}}}</div></body>');
    const msg = 'Hi {{name}},\n\nSecond paragraph.\nSame paragraph, new line.';
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: msg }, makeConfig({ templateHtml: tpl }));
    expect(out.body).toContain('Hi Sam,<br><br>Second paragraph.<br>Same paragraph');
    // The plain-text part round-trips exactly: single break stays single,
    // double stays double, and no literal <br> leaks through.
    expect(out.text).not.toContain('<br>');
    expect(out.text).toContain('Hi Sam,\n\nSecond paragraph.\nSame paragraph, new line.');
  });

  it('does not inject <br> inside a Mustache tag wrapped across a line break (U20)', () => {
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'Hi {{\nname}}!\nBye.' }, makeConfig());
    expect(out.body).toContain('Hi Sam!<br>Bye.');
  });

  it('renders newlines as <br> in the no-template fallback too (U20)', () => {
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'One.\n\nTwo.' }, makeConfig());
    expect(out.body).toContain('One.<br>');
    expect(out.body).toContain('Two.');
  });

  it('leaves file-type (HTML) message content untouched by newline conversion (U20)', () => {
    const html = '<p>Para one</p>\n<p>Para two</p>';
    const f = tmpFile(html);
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'file', messageContent: f }, makeConfig());
    expect(out.body).not.toContain('<br>');
    expect(out.body).toContain('<p>Para one</p>');
  });

  it('uses the campaign subject when the recipient has none', () => {
    const cfg = makeConfig({ subject: 'Global Subject', campaigns: [{ id: 'c1', name: 'Job Hunting', subject: 'Application from {{name}}' }] });
    const out = renderEmail({ email: 's@x.com', name: 'Sam', campaignId: 'c1', messageType: 'text', messageContent: 'x' }, cfg);
    expect(out.subject).toBe('Application from Sam');
  });

  it('lets the recipient subject win over the campaign subject', () => {
    const cfg = makeConfig({ subject: 'Global Subject', campaigns: [{ id: 'c1', name: 'Job Hunting', subject: 'Campaign Subject' }] });
    const out = renderEmail({ email: 's@x.com', name: 'Sam', campaignId: 'c1', subject: 'My Own Subject', messageType: 'text', messageContent: 'x' }, cfg);
    expect(out.subject).toBe('My Own Subject');
  });

  it('uses the campaign inline template over the on-disk global template', () => {
    const tpl = tmpFile('<body>GLOBAL {{{message}}}</body>');
    const cfg = makeConfig({ templateHtml: tpl, campaigns: [{ id: 'c1', name: 'Job Hunting', template: '<body>CAMPAIGN {{name}}: {{{message}}}</body>' }] });
    const out = renderEmail({ email: 's@x.com', name: 'Sam', campaignId: 'c1', messageType: 'text', messageContent: 'hello' }, cfg);
    expect(out.body).toContain('CAMPAIGN Sam: hello');
    expect(out.body).not.toContain('GLOBAL');
  });

  it('falls back to the global subject when the campaign id is unknown', () => {
    const cfg = makeConfig({ subject: 'Global Subject', campaigns: [{ id: 'c1', name: 'Job Hunting', subject: 'Campaign Subject' }] });
    const out = renderEmail({ email: 's@x.com', name: 'Sam', campaignId: 'ghost', messageType: 'text', messageContent: 'x' }, cfg);
    expect(out.subject).toBe('Global Subject');
  });

  it('produces a non-empty plain-text alternative with tags stripped', () => {
    const tpl = tmpFile('<body><p>Hello {{name}}</p></body>');
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'Body text' }, makeConfig({ templateHtml: tpl }));
    expect(out.text).toContain('Hello Sam');
    expect(out.text).not.toContain('<p>');
  });

  it('adds an unsubscribe footer + List-Unsubscribe header when enabled', () => {
    const out = renderEmail(
      { email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'x' },
      makeConfig({ unsubscribeEnabled: true, physicalAddress: '123 Runway Rd', user: 'pilot@x.com' }),
    );
    expect(out.body.toLowerCase()).toContain('unsubscribe');
    expect(out.body).toContain('123 Runway Rd');
    expect(out.listUnsubscribe).toBe('mailto:pilot@x.com?subject=Unsubscribe');
  });

  it('omits unsubscribe when disabled', () => {
    const out = renderEmail({ email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'x' }, makeConfig({ unsubscribeEnabled: false }));
    expect(out.listUnsubscribe).toBeUndefined();
  });

  it('primary mode drops List-Unsubscribe, footer, and <head>/<style>', () => {
    const tpl = tmpFile('<html><head><style>body{color:#333}</style></head><body><p>Hello {{name}}</p><div>{{{message}}}</div></body></html>');
    const out = renderEmail(
      { email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'Apply now' },
      makeConfig({ templateHtml: tpl, inboxPlacement: 'primary', unsubscribeEnabled: true, physicalAddress: '123 Runway Rd', user: 'pilot@x.com' }),
    );
    expect(out.listUnsubscribe).toBeUndefined();
    expect(out.body).not.toContain('<style');
    expect(out.body).not.toContain('<head');
    expect(out.body.toLowerCase()).not.toContain('unsubscribe');
    expect(out.body).not.toContain('123 Runway Rd');
    // Content still renders + personalizes.
    expect(out.body).toContain('Hello Sam');
    expect(out.body).toContain('Apply now');
  });

  it('bulk mode keeps List-Unsubscribe and the footer', () => {
    const tpl = tmpFile('<html><head><style>body{color:#333}</style></head><body><p>Hi {{name}}</p><div>{{{message}}}</div></body></html>');
    const out = renderEmail(
      { email: 's@x.com', name: 'Sam', messageType: 'text', messageContent: 'x' },
      makeConfig({ templateHtml: tpl, inboxPlacement: 'bulk', unsubscribeEnabled: true, physicalAddress: '123 Runway Rd', user: 'pilot@x.com' }),
    );
    expect(out.listUnsubscribe).toBe('mailto:pilot@x.com?subject=Unsubscribe');
    expect(out.body.toLowerCase()).toContain('unsubscribe');
    expect(out.body).toContain('123 Runway Rd');
    // Styling is preserved in bulk mode.
    expect(out.body).toContain('<style');
  });
});

describe('renderEmail merge-var defaults', () => {
  it('resolves {{var|default}} in the body when fields are empty', () => {
    const out = renderEmail(
      { email: 's@x.com', name: '', company: '', messageType: 'text', messageContent: 'Hi {{name|there}}, from {{company|your team}}.' },
      makeConfig(),
    );
    expect(out.body).toContain('Hi there, from your team.');
  });

  it('resolves {{var|default}} in the subject when the field is empty', () => {
    const out = renderEmail(
      { email: 's@x.com', company: '', subject: 'Re: {{company|your team}}', messageType: 'text', messageContent: 'body' },
      makeConfig(),
    );
    expect(out.subject).toBe('Re: your team');
  });

  it('still renders present values normally (regression guard)', () => {
    const out = renderEmail(
      { email: 's@x.com', name: 'Jane', company: 'Acme', subject: 'Re: {{company|your team}}', messageType: 'text', messageContent: 'Hi {{name|there}}.' },
      makeConfig(),
    );
    expect(out.body).toContain('Hi Jane.');
    expect(out.subject).toBe('Re: Acme');
  });
});
