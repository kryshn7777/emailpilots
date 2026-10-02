// UI contract — static checks on index.html + style.css for defects no DOM-less
// unit test can see. Vitest runs in node, so these read the shipped files as text.
//
//  - A duplicate id is a dead control: getElementById binds only the first copy
//    (25bf73f shipped a second #toggle-scheduler-btn that never responded).
//  - The page CSP is script-src 'self', which silently blocks inline on*= handlers
//    (the first-run "Add Your First Recipient" button relied on one).
//  - Toasts raised while the login gate is up must stack above it, or every
//    sign-in error the gate reports through a toast is invisible.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

/** z-index declared in the first rule block for `selector` (exact class/id). */
function zIndexOf(selector: string): number {
  const escaped = selector.replace(/[.#]/g, (c) => '\\' + c);
  const m = new RegExp(`${escaped}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css);
  if (!m) throw new Error(`no z-index rule for ${selector}`);
  return Number(m[1]);
}

describe('index.html contract', () => {
  it('has no duplicate ids', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('has no inline event handlers, which its own CSP blocks', () => {
    expect(html).toContain("script-src 'self'");
    const inline = [...html.matchAll(/<[^>]*\s(on[a-z]+)\s*=/gi)].map((m) => m[1]);
    expect(inline).toEqual([]);
  });
});

describe('style.css contract', () => {
  it('stacks toasts above the login gate', () => {
    expect(zIndexOf('.toast-layer')).toBeGreaterThan(zIndexOf('.login-screen'));
  });
});
