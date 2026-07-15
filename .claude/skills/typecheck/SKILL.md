---
name: typecheck
description: Type-check the Email Pilots app across all three tsconfig projects (core, electron, renderer). Use after any TypeScript change, since Vite/esbuild do NOT type-check and errors otherwise land silently. Reports CORE / ELECTRON / RENDERER pass/fail.
---

# /typecheck — full TypeScript check

The build path (Vite + esbuild) transpiles without checking types. There is no `tsc` npm
script, and the three tsconfigs are otherwise orphaned. This skill runs all three so type
errors don't ship silently.

## Steps

Run each command from the repo root and record its result. On Windows/PowerShell, chain
with `;` and `if ($?) { … }` — not `&&`.

1. **CORE** — `src/**` business logic:
   ```
   npx tsc -p tsconfig.json --noEmit
   ```
2. **ELECTRON** — main process, IPC, and the `src` files it imports:
   ```
   npx tsc -p tsconfig.electron.json --noEmit
   ```
3. **RENDERER** — `src/main.ts` (strict `noUnusedLocals` / `noUnusedParameters`):
   ```
   npx tsc -p tsconfig.vite.json --noEmit
   ```

## Report

Summarize as:

```
CORE      OK | N errors
ELECTRON  OK | N errors
RENDERER  OK | N errors
```

For any failing project, list the `error TS…` lines with `file:line`. Fix only errors that
your change introduced — the codebase may carry pre-existing errors (especially RENDERER,
which enforces unused-locals). If you hit pre-existing ones unrelated to the current task,
report them but don't fix unprompted.

Do not consider a TypeScript task complete until CORE and ELECTRON are clean for the files
you touched.
