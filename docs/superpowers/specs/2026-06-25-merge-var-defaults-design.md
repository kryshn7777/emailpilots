# Inline Merge-Var Default Values — Design

**Date:** 2026-06-25
**Status:** Approved (design)
**Scope:** Add a per-placeholder fallback so empty merge vars render a default instead of a blank gap.

## Problem

Recipient emails are rendered with Mustache against the recipient record
(`src/renderer.ts` → `Mustache.render(templateContent, record)`). Merge vars come
from CSV columns and built-in fields (`name`, `email`, `subject`, …). When a record is
missing a referenced field, Mustache renders an empty string with no error:

```
Template:  Hi {{name}}, saw {{company}} is hiring.
Record:    { name: "", company: "" }
Output:    Hi , saw  is hiring.
```

Empty gaps look broken and read as mass-mail, which hurts deliverability — the opposite
of the app's anti-spam goal. There is currently no way to supply a default.

## Goal

Let a template author write a fallback inline, next to the variable, with no config or UI:

```
Hi {{name|there}}, saw {{company|your team}} is hiring.
```

- `name` empty → `Hi there, …`
- `company` empty → `… saw your team is hiring.`
- present values render normally (unchanged behavior).

## Syntax

| Form | Behavior |
|------|----------|
| `{{var\|default}}` | HTML-escaped value; on empty, HTML-escaped `default` |
| `{{{var\|default}}}` | Raw value; on empty, raw `default` |
| `{{var}}` / `{{{var}}}` | Unchanged — no pipe, Mustache handles as today |

- **Key**: characters except `{`, `}`, `|`. Trimmed.
- **Default**: characters except `{`, `}`. Trimmed at both ends. May be empty
  (`{{x|}}` = explicit "blank if missing", same as today but intentional).
- No nested tags inside a default (braces disallowed) — keeps parsing unambiguous.

## "Empty" definition

A value is empty when:

```
value == null  ||  key absent  ||  String(value).trim() === ''
```

Whitespace-only counts as empty. This also closes an existing gap where a
whitespace-only CSV cell would render as "present".

## Architecture

### New unit: `src/mergeDefaults.ts`

Pure, dependency-light, browser-safe — same pattern as `src/csvMapping.ts` and
`src/spamCheck.ts` (runs in both renderer preview and main-process send; unit-testable).

```ts
import Mustache from 'mustache';

/**
 * Resolve inline merge-var defaults ({{var|default}} / {{{var|default}}}) against
 * a recipient record, BEFORE the template is handed to Mustache.render.
 *
 * Only pipe-bearing tags are rewritten; ordinary {{var}} tags are left untouched
 * for Mustache to handle exactly as before.
 */
export function applyMergeDefaults(template: string, record: Record<string, any>): string;
```

Behavior per matched token:

- **Value present** → replace the token with the plain Mustache tag (`{{key}}` or
  `{{{key}}}`) so Mustache still performs lookup + escaping uniformly.
- **Value empty** → splice in the literal default:
  - double `{{ }}` → `Mustache.escape(default)`
  - triple `{{{ }}}` → raw `default`

### Wiring: `src/renderer.ts` (2 call sites)

1. **Body** — call `applyMergeDefaults(templateContent, record)` immediately before
   the existing `Mustache.render(templateContent, record)` (currently L125). Because
   this runs *after* the `{{{message}}}` injection (L118), defaults also work inside the
   recipient's own message text, not just the wrapper template.

2. **Subject** — call `applyMergeDefaults(subjectTpl, record)` before
   `Mustache.render(subjectTpl, record)` (currently L149). The subsequent
   `htmlUnescape` round-trips the escaped default back to plain text, consistent with
   how present values are already handled.

No other call sites change. `renderEmail` is the single source of truth for both send
paths and both preview paths, so every consumer inherits the feature automatically.

## Parsing details

Apply triple-stache regex **before** double-stache (since `{{{` contains `{{`):

- Triple: `\{\{\{\s*([^{}|]+?)\s*\|\s*([^{}]*?)\s*\}\}\}`
- Double: `\{\{\s*([^{}|]+?)\s*\|\s*([^{}]*?)\s*\}\}`

Group 1 = key, group 2 = default. Global flag; each match resolved independently
against `record`.

## Data flow

```
template.html (or campaign template)
  └─ {{{message}}} injected (split/join)            renderer.ts L118
  └─ applyMergeDefaults(templateContent, record)    NEW — pipe tokens → value | default
  └─ Mustache.render(...)                           renderer.ts L125 — remaining {{vars}}
  └─ primary-tab strip / footer                     unchanged
subjectTpl
  └─ applyMergeDefaults(subjectTpl, record)         NEW
  └─ Mustache.render(...) → htmlUnescape            renderer.ts L149
```

## Error handling

- Pure string transform; no I/O, no throws. Malformed tokens that don't match the
  regex are simply left for Mustache (degrades to current behavior — never errors).
- A default that itself contains `{` or `}` won't match → treated as a normal tag by
  Mustache (no silent corruption).

## Testing

New `src/__tests__/mergeDefaults.test.ts` (vitest, mirrors `accountStore.test.ts`):

1. Present value → value rendered, default ignored.
2. Empty string value → default.
3. Whitespace-only value → default.
4. Missing key → default.
5. Double-stache: value HTML-escaped; default HTML-escaped on empty.
6. Triple-stache: value raw; default raw on empty.
7. No-pipe tag → untouched (regression guard).
8. Empty default `{{x|}}` with missing key → empty output.
9. Multiple tokens in one line, mixed present/empty.
10. Default trimming: `{{name| there }}` → `there`.

Plus an integration assertion via `renderEmail` (existing render path) confirming a
default resolves end-to-end in both body and subject.

## Out of scope (YAGNI)

- Nested variables inside a default (`{{a|{{b}}}}`).
- Per-field default config map / table.
- A single global fallback setting.
- Any UI change. Authors type the syntax directly into existing template/message/subject
  fields.

## Backward compatibility

Templates with no `|` inside tags are byte-for-byte unaffected. Existing recipients,
campaigns, and saved templates render identically. Purely additive.
