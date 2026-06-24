# Inline Merge-Var Default Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let template authors write `{{var|default}}` / `{{{var|default}}}` so an empty merge var renders a fallback instead of a blank gap.

**Architecture:** A new pure module `src/mergeDefaults.ts` runs a pre-pass over the template string, rewriting pipe-bearing tags into either a plain Mustache tag (value present) or the literal default (value empty), then `src/renderer.ts` calls it immediately before each existing `Mustache.render` (body + subject). Ordinary `{{var}}` tags are left untouched.

**Tech Stack:** TypeScript, Mustache (`mustache` v4), Vitest.

## Global Constraints

- **Backward-compatible / additive only.** Tags without a `|` must render byte-for-byte identically to today. (`[[non-breaking-additive-changes]]`)
- **Pure + browser-safe module.** `src/mergeDefaults.ts` imports only `mustache` — no `fs`, no electron, no node-only APIs — so it runs in the renderer preview and the main-process send alike, mirroring `src/csvMapping.ts` and `src/spamCheck.ts`.
- **TDD.** Every behavior gets a failing test first. Test runner: Vitest (`describe`/`it`/`expect`).
- **Flat keys only.** Lookups are literal `record[key]` against flat recipient records (CSV merge vars are flat); dotted/nested paths in defaults are out of scope.
- **"Empty" = `value == null` OR key absent OR `String(value).trim() === ''`.**

---

### Task 1: Pure `applyMergeDefaults` module

**Files:**
- Create: `src/mergeDefaults.ts`
- Test: `src/__tests__/mergeDefaults.test.ts`

**Interfaces:**
- Consumes: `Mustache.escape` from `mustache`.
- Produces: `export function applyMergeDefaults(template: string, record: Record<string, any>): string` — resolves pipe-bearing tags; leaves no-pipe tags for Mustache. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/mergeDefaults.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/mergeDefaults.test.ts`
Expected: FAIL — `Failed to resolve import "../mergeDefaults"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/mergeDefaults.ts`:

```ts
import Mustache from 'mustache';

/**
 * Resolve inline merge-var defaults against a recipient record, BEFORE the
 * template is handed to Mustache.render. Supports:
 *
 *   {{ var | default }}    HTML-escaped value; on empty, HTML-escaped default
 *   {{{ var | default }}}  raw value;          on empty, raw default
 *
 * A value is "empty" when the key is absent, null/undefined, or trims to ''.
 * Only pipe-bearing tags are touched; ordinary {{var}} tags are left for
 * Mustache to render exactly as before. Pure + browser-safe (no fs), mirroring
 * csvMapping.ts / spamCheck.ts so it runs in both the renderer preview and the
 * main-process send and is unit-testable.
 */

// Triple matched before double, since "{{{" contains "{{". Key excludes braces
// and the pipe; default excludes braces (no nested tags) so parsing stays
// unambiguous. \s* around each capture trims surrounding whitespace. Both
// patterns REQUIRE a pipe, so rewritten no-pipe tags are never re-matched.
const TRIPLE = /\{\{\{\s*([^{}|]+?)\s*\|\s*([^{}]*?)\s*\}\}\}/g;
const DOUBLE = /\{\{\s*([^{}|]+?)\s*\|\s*([^{}]*?)\s*\}\}/g;

function isEmpty(value: any): boolean {
  return value == null || String(value).trim() === '';
}

export function applyMergeDefaults(template: string, record: Record<string, any>): string {
  if (!template) return template;

  // Triple first so its inner "{{" isn't consumed by the double pass.
  let out = template.replace(TRIPLE, (_m, key: string, def: string) =>
    isEmpty(record[key]) ? def : `{{{${key}}}}`
  );

  out = out.replace(DOUBLE, (_m, key: string, def: string) =>
    isEmpty(record[key]) ? Mustache.escape(def) : `{{${key}}}`
  );

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/mergeDefaults.test.ts`
Expected: PASS — 12 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mergeDefaults.ts src/__tests__/mergeDefaults.test.ts
git commit -m "feat: add applyMergeDefaults for inline merge-var fallbacks"
```

---

### Task 2: Wire defaults into `renderEmail`

**Files:**
- Modify: `src/renderer.ts` (import line 2; body render ~line 125; subject render ~line 149)
- Test: `src/__tests__/renderer.test.ts`

**Interfaces:**
- Consumes: `applyMergeDefaults(template, record)` from Task 1; existing `renderEmail(record, config)`.
- Produces: no new exports — `renderEmail` now resolves pipe defaults in both body and subject.

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { renderEmail } from '../renderer';

// Minimal config: template file intentionally absent (so the recipient message
// IS the body), bulk placement and no unsubscribe so no footer/strip interferes.
function makeConfig(): any {
  return {
    paths: { templateHtml: path.join(os.tmpdir(), 'ep-no-such-template-xyz.html') },
    campaigns: [],
    sender: { inboxPlacement: 'bulk', unsubscribeEnabled: false, physicalAddress: '' },
    smtp: { user: 'me@example.com' },
    email: { subject: 'Default subject' },
  };
}

describe('renderEmail merge-var defaults', () => {
  it('resolves defaults in the body when fields are empty', () => {
    const record: any = {
      messageType: 'text',
      messageContent: 'Hi {{name|there}}, from {{company|your team}}.',
      subject: 'x',
      name: '',
      company: '',
    };
    const out = renderEmail(record, makeConfig());
    expect(out.body).toContain('Hi there, from your team.');
  });

  it('resolves defaults in the subject when the field is empty', () => {
    const record: any = {
      messageType: 'text',
      messageContent: 'body',
      subject: 'Re: {{company|your team}}',
      company: '',
    };
    const out = renderEmail(record, makeConfig());
    expect(out.subject).toBe('Re: your team');
  });

  it('still renders present values normally (regression guard)', () => {
    const record: any = {
      messageType: 'text',
      messageContent: 'Hi {{name|there}}.',
      subject: 'Re: {{company|your team}}',
      name: 'Jane',
      company: 'Acme',
    };
    const out = renderEmail(record, makeConfig());
    expect(out.body).toContain('Hi Jane.');
    expect(out.subject).toBe('Re: Acme');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/renderer.test.ts`
Expected: FAIL — the two default tests fail; body shows `Hi , from .` and subject shows `Re: ` (defaults not yet applied). The present-values test already passes.

- [ ] **Step 3: Add the import**

In `src/renderer.ts`, after line 2 (`import Mustache from 'mustache';`), add:

```ts
import { applyMergeDefaults } from './mergeDefaults';
```

- [ ] **Step 4: Apply defaults to the body before render**

In `src/renderer.ts`, locate (currently ~line 125):

```ts
  let rendered = Mustache.render(templateContent, record);
```

Replace with:

```ts
  templateContent = applyMergeDefaults(templateContent, record);
  let rendered = Mustache.render(templateContent, record);
```

(`templateContent` is declared `let`, so reassignment is valid. Running here — after the `{{{message}}}` injection — means defaults also work inside the recipient's own message text.)

- [ ] **Step 5: Apply defaults to the subject before render**

In `src/renderer.ts`, locate (currently ~line 149):

```ts
  const subject = htmlUnescape(Mustache.render(subjectTpl, record));
```

Replace with:

```ts
  const subject = htmlUnescape(Mustache.render(applyMergeDefaults(subjectTpl, record), record));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/__tests__/renderer.test.ts`
Expected: PASS — 3 passing.

- [ ] **Step 7: Run the full suite for regressions**

Run: `npm test`
Expected: PASS — all existing tests (accountStore, etc.) plus the two new files green.

- [ ] **Step 8: Commit**

```bash
git add src/renderer.ts src/__tests__/renderer.test.ts
git commit -m "feat: resolve {{var|default}} fallbacks in email body and subject"
```

---

## Self-Review

**Spec coverage:**
- Syntax (double/triple, no-pipe untouched) → Task 1 tests + impl. ✓
- "Empty" definition (null/missing/whitespace) → Task 1 `isEmpty` + 3 tests. ✓
- New `src/mergeDefaults.ts` pure module → Task 1. ✓
- Escaping: double escapes default, triple raw → Task 1 tests 5–8. ✓
- Wiring at body (post-message-injection) + subject → Task 2 steps 4–5. ✓
- End-to-end via `renderEmail` (body + subject) → Task 2 `renderer.test.ts`. ✓
- Parsing: triple-before-double, braces/pipe excluded → impl comments + regex. ✓
- Backward compatibility (no-pipe identical) → Task 1 regression test + Task 2 step 7 full suite. ✓
- Out-of-scope items (nested vars, config table, global setting, UI) → not implemented. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code.

**Type consistency:** `applyMergeDefaults(template: string, record: Record<string, any>): string` defined in Task 1, consumed with the same signature in Task 2 (import + 2 call sites). `Mustache.escape` used consistently. Names match across tasks.
