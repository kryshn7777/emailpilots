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
