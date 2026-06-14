import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderEmail } from '../renderer';
import type { Config } from '../config';

function tmpFile(contents: string): string {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ep-tpl-')), 'template.html');
  fs.writeFileSync(f, contents);
  return f;
}

function makeConfig(overrides: { templateHtml?: string; subject?: string; physicalAddress?: string; unsubscribeEnabled?: boolean; user?: string; inboxPlacement?: 'primary' | 'bulk' } = {}): Config {
  return {
    userName: 'Tester',
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
