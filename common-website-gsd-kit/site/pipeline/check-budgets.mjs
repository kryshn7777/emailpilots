#!/usr/bin/env node
/**
 * Mechanical budget gates (BUDGETS.md §Payload budgets, D2-08) — runs after `astro build`.
 *
 *   a) EAGER    — gz sum of inline <script> bodies + every eagerly referenced JS file and
 *                 its statically imported chunks. FAIL over 10240 B (build gate).
 *   b) BOUNDARY — src scan: only a dynamic import() may reference src/island/. FAIL on any
 *                 static import (one static import silently merges the island into the
 *                 eager bundle — 02-RESEARCH.md Pitfall 5).
 *   c) BASE     — dist scan: no href="/..." / src="/..." / url(/...) that escapes the build's
 *                 base (D2-06 — the classic prod-only 404 under /MailAutomation/).
 *   d) ISLAND   — gz of the dynamic-import chunk graph (located via the ISLAND_ENTRY marker).
 *                 [PROVISIONAL] report only this wave: warn over 307200 B, never fail (02-05
 *                 ratifies the line against the real island).
 *
 * Pure Node, zero dependencies. One machine-readable summary line per check.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const srcDir = path.join(root, 'src');

const EAGER_LIMIT = 10240;
const ISLAND_WARN = 307200;

let BASE = process.env.SITE_BASE ?? '/';
if (!BASE.endsWith('/')) BASE += '/';

if (!existsSync(dist)) {
  console.error('check-budgets: dist/ not found — run `astro build` first.');
  process.exit(1);
}

/** Recursively list files under dir with one of the given extensions. */
function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

const gz = (data) => gzipSync(data).length;

/** Static import specifiers in bundled/human JS: `from "x"` + bare `import "x"` — never `import(`. */
function staticImportSpecs(code) {
  const specs = [];
  for (const m of code.matchAll(/from\s*["']([^"']+)["']/g)) specs.push(m[1]);
  // Bare side-effect imports: quote must directly follow `import` (a `(` would make it dynamic).
  for (const m of code.matchAll(/(^|[^.\w$])import\s*["']([^"']+)["']/g)) specs.push(m[2]);
  return specs;
}

/** Follow the static-import graph from a JS file; returns the set of local files reached. */
function staticGraph(entryFile, seen = new Set()) {
  if (seen.has(entryFile) || !existsSync(entryFile)) return seen;
  seen.add(entryFile);
  const code = readFileSync(entryFile, 'utf8');
  for (const spec of staticImportSpecs(code)) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // bare/external: nothing local to add
    const resolved = spec.startsWith('/')
      ? path.join(dist, stripBase(spec))
      : path.resolve(path.dirname(entryFile), spec);
    staticGraph(resolved, seen);
  }
  return seen;
}

/** '/MailAutomation/_astro/x.js' → '_astro/x.js' (also handles plain '/x.js'). */
function stripBase(url) {
  if (url.startsWith(BASE)) return url.slice(BASE.length);
  return url.replace(/^\//, '');
}

let failed = false;

// ---------- a) EAGER ----------
{
  let inlineBytes = 0;
  const eagerFiles = new Set();
  const missing = [];
  for (const html of walk(dist, ['.html'])) {
    const doc = readFileSync(html, 'utf8');
    for (const m of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1];
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/);
      if (srcMatch) {
        const file = path.join(dist, stripBase(srcMatch[1]));
        // A referenced-but-missing entry would silently measure as 0 — that is a lie, fail loud.
        if (!existsSync(file)) missing.push(srcMatch[1]);
        for (const f of staticGraph(file)) eagerFiles.add(f);
      } else if (m[2].trim() !== '') {
        inlineBytes += gz(m[2]);
        // An inlined module can still statically import emitted chunks.
        for (const spec of staticImportSpecs(m[2])) {
          if (spec.startsWith('/') || spec.startsWith('.')) {
            const file = spec.startsWith('/')
              ? path.join(dist, stripBase(spec))
              : path.resolve(dist, spec);
            for (const f of staticGraph(file)) eagerFiles.add(f);
          }
        }
      }
    }
  }
  let fileBytes = 0;
  for (const f of eagerFiles) fileBytes += gz(readFileSync(f));
  const total = inlineBytes + fileBytes;
  const ok = total <= EAGER_LIMIT && missing.length === 0;
  console.log(
    `BUDGET eager: ${total} B gz / ${EAGER_LIMIT} B (inline ${inlineBytes} + ${eagerFiles.size} file(s) ${fileBytes}) — ${ok ? 'PASS' : 'FAIL'}`
  );
  for (const s of missing) console.error(`  missing eager file (dist/base mismatch?): ${s}`);
  if (!ok) failed = true;
}

// ---------- b) BOUNDARY ----------
{
  const violations = [];
  const islandDir = path.join(srcDir, 'island') + path.sep;
  for (const file of walk(srcDir, ['.ts', '.astro', '.mjs', '.js'])) {
    if (file.startsWith(islandDir)) continue; // the island may import itself
    const code = readFileSync(file, 'utf8');
    for (const spec of staticImportSpecs(code)) {
      if (spec.includes('island/') || /(^|\/)island$/.test(spec)) {
        violations.push(`${path.relative(root, file)} -> ${spec}`);
      }
    }
  }
  const ok = violations.length === 0;
  console.log(`BUDGET boundary: ${violations.length} static island ref(s) — ${ok ? 'PASS' : 'FAIL'}`);
  for (const v of violations) console.error(`  breach: ${v}`);
  if (!ok) failed = true;
}

// ---------- c) BASE SAFETY ----------
{
  const violations = [];
  for (const file of walk(dist, ['.html', '.css', '.js'])) {
    const text = readFileSync(file, 'utf8');
    const hits = [
      ...text.matchAll(/(?:href|src)=["']\/(?!\/)([^"']*)["']/g),
      ...text.matchAll(/url\(\s*["']?\/(?!\/)([^"')]*)["']?\s*\)/g),
    ];
    for (const m of hits) {
      const url = `/${m[1]}`;
      if (!url.startsWith(BASE)) {
        violations.push(`${path.relative(dist, file)}: ${m[0]}`);
      }
    }
  }
  const ok = violations.length === 0;
  console.log(
    `BUDGET base-safety: ${violations.length} violation(s) (base=${BASE}) — ${ok ? 'PASS' : 'FAIL'}`
  );
  for (const v of violations) console.error(`  unsafe: ${v}`);
  if (!ok) failed = true;
}

// ---------- d) ISLAND [PROVISIONAL] ----------
{
  // Primary locator: the ISLAND_ENTRY marker. Rolldown tree-shakes unused exports out of
  // dynamic chunks, so ALSO locate by definition: the target files of dynamic import() in
  // dist JS — "the chunk graph reachable only from the dynamic import".
  const distJs = walk(dist, ['.js']);
  const entries = new Set(distJs.filter((f) => readFileSync(f, 'utf8').includes('ISLAND_ENTRY')));
  for (const f of distJs) {
    for (const m of readFileSync(f, 'utf8').matchAll(/import\(\s*[`"']([^`"']+)[`"']\s*\)/g)) {
      const spec = m[1];
      const resolved = spec.startsWith('/')
        ? path.join(dist, stripBase(spec))
        : path.resolve(path.dirname(f), spec);
      if (existsSync(resolved)) entries.add(resolved);
    }
  }
  if (entries.size === 0) {
    console.log('BUDGET island: chunk not located (no marker, no dynamic import target) — WARN');
  } else {
    const files = new Set();
    for (const e of entries) for (const f of staticGraph(e)) files.add(f);
    let total = 0;
    for (const f of files) total += gz(readFileSync(f));
    const over = total > ISLAND_WARN;
    console.log(
      `BUDGET island: ${total} B gz / ${ISLAND_WARN} B [PROVISIONAL] (${files.size} chunk(s)) — ${over ? 'WARN (over provisional line)' : 'PASS'}`
    );
  }
}

process.exit(failed ? 1 : 0);
