# Coding Conventions

**Analysis Date:** 2026-08-18

**Source codebase:** the Email Pilots product app at `C:\AntigravityProjects\MailAutomation` (`src/` + `electron/`). This document extracts conventions worth carrying into the new website workspace (`common-website-gsd-kit/site`), and flags which ones are app-specific.

## Naming Patterns

**Files:**
- camelCase for all TypeScript modules: `src/mailProcessor.ts`, `src/rateLimiter.ts`, `src/suppressionManager.ts`, `src/transport/smtpStrategy.ts`
- One module = one responsibility; file name matches its primary export (`src/rateLimiter.ts` exports `RateLimiter`)
- No `index.ts` barrel files anywhere (`src/index.ts` is the CLI entry point, not a barrel). Zero `export * from` in the codebase — import from the concrete module.
- Subdirectories group a subsystem, not a layer: `src/transport/`, `src/ai/`, `src/crypto/`, `src/licensing/`

**Functions:**
- camelCase, verb-first: `loadEnvInto`, `atomicWriteFileSync`, `readJsonState`, `makeStrategy`, `computeIdleNudge`, `buildDomainAuthReport`
- Factory functions prefixed `make*` (`makeSecretBox` in `src/crypto/factory.ts`, `makeStrategy` in `src/transport/factory.ts`) or `build*`
- Predicates prefixed `is*`/`has*`: `isSuppressed`, `isMsBasicAuthDeadHost` (`src/providerDetect.ts`), `hasCredentials` (`src/campaignRunner.ts`)
- Event-subscription functions return an unsubscribe function: `onStateFileError(fn): () => void` (`src/jsonState.ts`), same pattern in `electron/preload.ts` (`onRepliesUpdated` returns a disposer)

**Variables:**
- camelCase locals; SCREAMING_SNAKE_CASE for module-level constants: `MAX_EXTRA_ACCOUNTS` (`src/accountStore.ts`), `MAX_DELAY_DAYS` (`src/sequenceStore.ts`), `MODEL_CATALOG` (`src/ai/modelCatalog.ts`), `TOUR_STEPS` (`src/tour.ts`)
- Renderer localStorage keys use an `ept` prefix and a `*_KEY` constant name: `GS_DISMISS_KEY = 'eptGettingStartedDismissed'` (`src/main.ts` top)

**Types:**
- PascalCase for classes, interfaces, and type aliases — no `I` prefix: `SendStrategy`, `SendResult`, `StrategyDeps` (`src/transport/sendStrategy.ts`), `JsonStateResult<T>` (`src/jsonState.ts`)
- Discriminated unions for results: `type JsonStateResult<T> = { ok: true; data: T | null } | { ok: false; error: string }`
- String-literal unions over enums (no TypeScript `enum` in the codebase): `type StateFileKind = 'suppression' | 'replies'`; log levels `'info' | 'error' | 'success' | 'system'` (`electron/main.ts`)
- Custom error classes extend `Error`, carry structured readonly fields, and set `this.name` by assignment in the constructor (see `StateFileError` in `src/jsonState.ts` — assignment chosen over class fields because two tsconfig projects resolve `useDefineForClassFields` differently)

## Code Style

**Formatting:**
- **No formatter.** No Prettier, no Biome, no `.editorconfig`. Style is enforced by review, not tooling.
- Indentation is **mixed** in the app: older/larger files lean 4-space (`electron/main.ts`, `src/mailProcessor.ts`); newer modules and all tests use 2-space (`src/jsonState.ts`, `src/atomicWrite.ts`, `src/transport/`). Rule followed in practice: match the file you are editing. **For the new website: pick 2-space and keep it uniform (matches the newer code and every test).**
- Single quotes, semicolons always, trailing commas in multiline literals.
- Compact single-line guards are acceptable: `if (raw.trim() === '') return { ok: false, error: '…' };` and `try { fs.unlinkSync(tmp); } catch {}`

**Linting:**
- **No ESLint.** The type checker is the only static gate — and it does not run in the build. See TESTING.md ("Typecheck is a manual gate").
- Strictness lives in `tsconfig` instead: all three projects set `"strict": true`. The renderer project (`tsconfig.vite.json`) additionally enforces `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- `any` is used pragmatically at boundaries (IPC payloads, caught errors `catch (e: any)`), never in core data models. Boundary casts are explicit and often commented: `const isExe = !!(process as any).pkg;` (`src/config.ts`).

## Import Organization

**Order (observed consistently, e.g. `electron/main.ts`, `src/config.ts`):**
1. External packages / Electron (`import { app, BrowserWindow, … } from 'electron'`)
2. Node builtins — bare specifiers, no `node:` prefix (`import path from 'path'`, `import fs from 'fs'`)
3. Project modules by relative path (`../src/config`, `./transport/oauthMicrosoft`)

**Style:**
- Named imports everywhere; default exports are not used for project modules
- `import type { … }` for type-only imports, used consistently (`import type { StrategyDeps } from '../src/transport/sendStrategy'`); inline `type` qualifiers inside mixed imports (`import { SentLog, type SentLogEntry } from '../src/sentLog'`)
- Long import lists wrapped multiline with one name per group of related exports

**Path Aliases:**
- None. All imports are relative (`../../jsonState` from nested test dirs). No `paths` mapping in any tsconfig. For the website: aliases are fine to introduce, but the app precedent is plain relative paths.

## Error Handling

The app has a deliberate, documented error doctrine — the single most transferable convention:

**Result objects over throws at query boundaries:**
- Functions that read state return a discriminated union instead of throwing: `readJsonState<T>` returns `{ ok: true, data: T | null } | { ok: false, error }` and "never throws" (`src/jsonState.ts`)
- `data: null` distinguishes "file absent (legitimately empty)" from `ok: false` "present but unreadable" — collapsing those two cases caused real data loss (audit S2)

**Fail-closed vs fail-open is decided per store, by purpose:**
- Guards that BLOCK sends (suppression list, reply store) fail **closed**: unreadable file ⇒ throw `StateFileError`, abort the send, never clobber the file (`src/suppressionManager.ts`, `src/replyStore.ts`)
- Records that only SUBTRACT work (sent ledger) fail **open**: corrupt file resets rather than blocking (`src/sentLedger.ts`) — and tests pin the asymmetry so nobody "fixes" it (`src/__tests__/audit/s2-corrupt-state-fails-open-and-clobbers.audit.test.ts`)

**Custom error types are narrow and load-bearing:**
- `StateFileError` (`src/jsonState.ts`) is thrown ONLY from a store's `assertReadable`; other code discriminates on `instanceof`, so widening what throws it is forbidden by comment

**Best-effort cleanup is explicit and commented:**
- Empty catch blocks always carry a reason: `try { fs.unlinkSync(tmp); } catch {}` with a comment "Clean up the orphaned temp file before surfacing the failure" (`src/atomicWrite.ts`); `catch { /* best effort */ }` (`src/__tests__/stress/helpers.ts`)

**User-facing error translation lives in one place:**
- Raw SMTP/provider errors map to human copy via `friendlySmtpError` (`src/smtpUtils.ts`); IPC handlers return `true/false` or `{ ok, error }` shapes, never leak raw exceptions to the renderer

**Durability:**
- Every JSON state write goes through `atomicWriteFileSync` (`src/atomicWrite.ts`) — temp file + rename so a crash can never truncate the target

## Logging

**Framework:** console only — no logging library.

**Patterns:**
- Main process funnels UI-visible logs through `sendLog(msg, type)` (`electron/main.ts:145`) with levels `'info' | 'error' | 'success' | 'system'`; it prints `[TYPE] msg` via `rawConsoleLog = console.log.bind(console)` (bound early because `console.log` gets wrapped later — always use the raw binding inside the log pipeline itself to avoid recursion)
- `src/` modules use plain `console.log/warn/error` (e.g. 29 call sites in `src/mailProcessor.ts`)
- EPIPE hardening at process level: stdout/stderr `error` listeners swallow EPIPE only, re-throw everything else (`electron/main.ts` top) — a stray `console.log` must never crash the packaged app
- Never log secrets: `SendResult.raw` is documented "never crosses IPC, never logged" (`src/transport/sendStrategy.ts`); passwords never reach logs (redaction contract in `CLAUDE.md`)

## Comments

This codebase's comment culture is its strongest convention. **Comments explain WHY, with receipts.**

**When to Comment:**
- Every non-obvious decision gets the rationale inline, often citing the audit ID that motivated it: `// A1 fix: preserve runner-owned seq* drip progress …` (`electron/main.ts` `save-recipients` handler), `(audit S2)`, `(audit K3)` throughout `src/jsonState.ts`
- Comments pin what must NOT change: "Thrown ONLY from a store's assertReadable … Widening what can throw it silently widens that check" (`src/jsonState.ts`)
- Deliberate simplifications with a known ceiling are marked `ponytail:` naming the ceiling and upgrade path: `// ponytail: 5 pages × 50 = 250 msgs/sweep is plenty …` (`src/graphMailReader.ts:6`), `src/main.ts:23`, `electron/main.ts:395`
- Rejected alternatives are recorded where a future reader would "improve" them back: "Not an EventEmitter: an emitter with an 'error' event and no listener THROWS …" (`src/jsonState.ts`)

**JSDoc/TSDoc:**
- `/** … */` docblocks on every exported function, interface, and non-trivial field — prose sentences, not `@param` tag soup (see `src/transport/sendStrategy.ts`, `src/atomicWrite.ts`, `src/config.ts`)
- Single-line `/** … */` above individual interface fields where the field is subtle (`SendResult.raw`, `StateFileError.filePath`)

## Function Design

**Size:** small pure functions preferred in `src/` leaf modules (`src/nextRun.ts`, `src/domainAuth.ts`, `src/providerDetect.ts` are pure logic, no DOM/DNS/IO — this is what makes them trivially testable). Orchestrators (`src/mailProcessor.ts` ~451 lines, `electron/main.ts` ~2434 lines) are long by nature; the renderer `src/main.ts` (~6573 lines) is the acknowledged monolith — do not replicate that on the website.

**Parameters:**
- Options/overrides objects with `Partial<T>` + spread defaults: `function limits(overrides: Partial<RateLimits> = {}): RateLimits { return { …defaults, ...overrides }; }` — used in production config merging (`src/mergeDefaults.ts`) and every test factory
- Dependency injection by constructor/argument, not by module mocking: `MailProcessor(config, emailService, onSuccess, accountId, onFailure)`; Electron-only capabilities injected into pure-Node code via a deps object (`StrategyDeps` in `src/transport/sendStrategy.ts`)

**Return Values:**
- Structured result objects with a reason, not booleans alone: `tryConsume() → { allowed: boolean, reason?: string }` (`src/rateLimiter.ts`); `verifyConnection() → { ok: boolean; error?: string }`
- Subscriptions return disposers (see Naming)

## Module Design

**Exports:**
- Named exports only; a module exports its class/functions plus the types callers need
- Types co-located with the code that owns them (`Config`, `Account` live in `src/config.ts`; transport types in `src/transport/sendStrategy.ts`) — no central `types.ts` except per-subsystem (`src/ai/types.ts`)

**Layering (hard rule, enforced by comment and structure):**
- `src/` is pure Node, shared with the CLI — **`src/` must never import `electron/`** (`src/jsonState.ts` docblock states it outright). Electron capabilities cross the boundary only via injected callbacks/deps (`StrategyDeps`, the `onStateFileError` listener registry).
- `electron/main.ts` is the single IPC surface (56 `ipcMain.handle` registrations); `electron/preload.ts` exposes a typed `electronAPI` via `contextBridge`, one method per channel, comments on non-obvious ones

**Barrel Files:** none — see Naming.

## Website-Relevant Carry-Overs (summary)

1. `"strict": true` TypeScript from day one; add `noUnusedLocals`/`noUnusedParameters` (the renderer project already proves the codebase can live with them)
2. camelCase files, named exports, no barrels, no default exports
3. Discriminated-union results (`{ ok: true, … } | { ok: false, error }`) instead of throwing across module boundaries
4. Rationale-first comments; `ponytail:` markers for deliberate ceilings
5. 2-space indent, single quotes, semicolons — and since the app has no formatter, the website should ADD one (Prettier/Biome) rather than inherit the mixed-indent drift
6. `Partial<T>`-overrides factories for config/test data
7. Remember the build does not type-check (Vite/esbuild transpile only) — wire `tsc --noEmit` into the website's verify loop explicitly

---

*Convention analysis: 2026-08-18*
