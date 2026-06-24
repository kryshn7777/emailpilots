# Coding Conventions

**Analysis Date:** 2026-06-24

## Naming Patterns

**Files:**
- camelCase for all TypeScript files: `emailService.ts`, `rateLimiter.ts`, `campaignStore.ts`
- Test files placed in `src/__tests__/` directory with `.test.ts` suffix: `rateLimiter.test.ts`, `sequenceRunner.test.ts`
- Store files follow pattern: `{entity}Store.ts` for persistence (e.g., `accountStore.ts`, `campaignStore.ts`, `replyStore.ts`)
- Utility files describe their purpose: `smtpUtils.ts`, `csvMapping.ts`, `atomicWrite.ts`

**Functions:**
- camelCase: `verifyConnection()`, `tryConsume()`, `normalizeAppPassword()`, `friendlySmtpError()`
- Pure logic functions exposed as exports: `recordBelongsToAccount()`, `deriveImapHost()`, `isValidEmail()`
- Private methods use private keyword: `private load()`, `private save()`, `private isPermanentBounce()`
- Helper/factory functions named descriptively: `tmpDir()`, `deps()`, `makeConfig()`

**Variables:**
- camelCase: `emailsToday`, `seqStep`, `maxPerDay`, `perRecipientToday`
- Type abbreviations discouraged; spell out: `checkResult`, `result`, `email` (not `em`, `addr`)
- Constants in SCREAMING_SNAKE_CASE for magic values: `MAX_EXTRA_ACCOUNTS`, `NOW`, `DAY`, `HTML_ENTITIES`
- Map/dict keys often lowercase normalized: `.toLowerCase()` for email lookups

**Types:**
- PascalCase interfaces: `EmailService`, `RateLimiter`, `MailProcessor`, `SuppressionManager`
- Exported interfaces describe contracts: `Config`, `Account`, `Campaign`, `SequenceStep`, `CheckResult`, `SendResult`
- Generic interfaces for dependency injection: `SeqDeps` (sequence dependencies injected for testability)

**React Components (landing/):**
- PascalCase .tsx files matching export: `Hero.tsx`, `Button.tsx`, `Pricing.tsx`
- Exported component functions named same as file: `export function Hero()`, `export function Button()`
- UI component subfolder: `components/ui/` for reusable primitives like `Button.tsx`, `DeviceFrame.tsx`, `Reveal.tsx`
- Props typed as inline type on function parameter: `function Button({ href = '#', children, variant = 'primary', className, ...rest }: Props)`

## Code Style

**Formatting:**
- No Prettier config — code follows ESLint defaults implied by TypeScript strict mode
- Consistent indentation: 2 spaces (seen in all JSON files and component renders)
- Line length not strictly enforced; pragmatic wrapping when readability suffers
- Template literals for multi-line strings and HTML: `` `<div>...</div>` ``
- Comments on separate line before code block

**Linting:**
- TypeScript strict mode enabled: `"strict": true` in `tsconfig.json`
- ESLint rules not explicitly configured in repo; inferred from code patterns:
  - No var — const/let only
  - camelCase naming enforced by convention
  - Unused variables caught at compile time (TS strict)

**Semicolons:**
- Always used (evident throughout all source files)

## Import Organization

**Order (observed pattern):**
1. Third-party library imports (`import dotenv from 'dotenv'`, `import nodemailer from 'nodemailer'`)
2. Node built-ins (`import fs from 'fs'`, `import path from 'path'`, `import cron from 'node-cron'`)
3. Local imports from current package (`import { Config } from './config'`, `import { RateLimiter } from '../rateLimiter'`)
4. Type-only imports grouped: `import type { Account } from './config'`, `import type { Props } from './types'`

**Path Aliases:**
- No aliases configured; relative imports used throughout: `'./config'`, `'../rateLimiter'`, `'../../lib/cn'`
- Paths.json not configured in TypeScript

**Re-exports:**
- No barrel files (index.ts re-exports) observed; direct imports from source modules

## Error Handling

**Patterns:**
- Try-catch blocks wrapping file I/O: `fs.readFileSync()`, `fs.writeFileSync()`, `JSON.parse()`
- Error fallback in catch: return empty/default value when not-critical, re-throw when critical
  - Example `rateLimiter.ts`: On corrupt limits.json, reset to `fresh` state instead of crashing
  - Example `suppressionManager.ts`: Log error but return empty map, continue operation
  - Example `accountStore.ts`: Log error and return `[]` for missing file
- SMTP errors translated to user-friendly messages: `friendlySmtpError(raw?: string): string` in `smtpUtils.ts`
- Permanent bounces detected by error code: `isPermanentBounce()` checks `error?.code === 'EENVELOPE'` + response code range

**Exception Handling:**
- Global uncaught exception handlers in `index.ts` — log with stack and exit gracefully
- Unhandled promise rejections caught separately: `process.on('unhandledRejection')`
- No throw statements in UI (renderer/landing) — errors logged instead

## Logging

**Framework:** Plain `console` object (console.log, console.error, console.warn, console.info)

**Patterns:**
- `console.log()` for info-level messages: application flow, configuration loaded
- `console.error()` for errors: file read failures, connection errors, exit-time crashes
- `console.warn()` for warnings: suppressed emails, missing files, deprecated paths
- No structured logging (no winston, bunyan, pino); output goes to stdout/stderr

**When to Log:**
- Email sent successfully: `console.log(` `Email sent successfully to: ${to} (SMTP ${info.response})`
- Errors in background tasks: `console.error('Failed to load limits.json:', e)`
- Suppression actions: `console.warn('Suppressed ${email}: rejected by mail server.')`
- Configuration issues: logged at startup if missing or malformed
- No debug-level logging observed; only info/warn/error

## Comments

**When to Comment:**
- Complex algorithm explanation: see `advanceSequenceRecord()` in `sequenceRunner.ts` (rules documented before code)
- Design rationale for non-obvious choices: `// Display name in From (...) reads as personal mail...` in `emailService.ts`
- SMTP/email spec references: `// RFC 8058`, `// RFC 2369` clarify why certain headers are added
- Multiline comments explain state machine: sequence step advancement rules prefixed with comment block

**JSDoc/TSDoc:**
- Used for public APIs and public methods: `/** ... */` blocks above function signatures
- Parameter docs in docstring: `@param accountId`, `@param basePath`
- Returns documented: `@returns ...` implied but not always explicit
- Example from `sequenceRunner.ts`:
  ```typescript
  /**
   * Advance one recipient through its sequence by at most one step, mutating the
   * record's seq* fields in place. Returns true when something changed (so the
   * caller persists). Pure except for the injected deps — no fs/cron/network.
   */
  export async function advanceSequenceRecord(record: any, sequences: Sequence[], deps: SeqDeps): Promise<boolean>
  ```

## Function Design

**Size:**
- Most functions 10–50 lines; some utility helpers 2–5 lines
- Long functions broken into private helpers: `buildAttachments()` calls multiple file-check helpers
- Pure functions preferred: `advanceSequenceRecord()` injected with deps to avoid side effects in tests

**Parameters:**
- Explicit over implicit: pass config objects rather than reading globals
- Config dependency passed in constructor: `constructor(private config: Config, ...)`
- Deps injected for testability: `SeqDeps` interface passed to `advanceSequenceRecord()`
- Spread/rest parameters used for options: `SendOptions = {}` in `sendMail()`

**Return Values:**
- Result objects with named properties over tuples: `CheckResult { allowed, reason, exhausted }`
- Nullable results used: `null` for "not found" (see `detectMapping()` returns `null` for unmatched fields)
- Boolean for yes/no decisions: `allowed`, `changed`, `isSuppressed()`
- Promises for async operations: `Promise<boolean>` for sends, `Promise<SendResult>` for mail delivery

## Module Design

**Exports:**
- Classes exported for stateful services: `EmailService`, `RateLimiter`, `MailProcessor`, `SuppressionManager`
- Pure functions exported: `recordBelongsToAccount()`, `friendlySmtpError()`, `renderEmail()`
- Interfaces exported alongside implementations: `Config` interface paired with `loadConfig()` function
- Type-only exports for contracts: `export type SuppressionReason`, `export interface CheckResult`

**Barrel Files:**
- Not used; direct imports preferred (no `src/index.ts` re-export)

**Module Organization:**
- One class per file (typically): `EmailService` in `emailService.ts`, `RateLimiter` in `rateLimiter.ts`
- Helper functions alongside related class: `verifyConnection()` is a method on `EmailService`
- Shared utilities in standalone files: `atomicWrite.ts`, `smtpUtils.ts`, `csvMapping.ts`

## React Conventions (landing/)

**Functional Components:**
- All components are functional (no class components): `export function Hero() { ... }`
- React hooks used for state/side-effects: `useState()`, `useRef()`, `useEffect()`, `useLenis()`, `useGSAP()`
- Component files named exact same as export: `Hero.tsx` exports `Hero()`

**Props:**
- Props typed inline: `type Props = { href?: string; children: ReactNode; ... }`
- Destructuring in function parameter: `function Button({ href, children, variant, ...rest }: Props)`
- Default values in destructuring: `variant = 'primary'`, `href = '#'`
- Spread remaining props: `{...rest}` passed to underlying element

**Styling:**
- Tailwind v4 classes inline in className: `className="relative z-10 mx-auto flex min-h-screen"`
- Utility class helper: `cn()` from `lib/cn.ts` concatenates conditional classes
- No CSS-in-JS; CSS Modules not used
- Style objects for dynamic values: `style={{ background: 'linear-gradient(...)' }}`

**Hooks & Effects:**
- GSAP animations via `useGSAP()` hook scoped: `useGSAP(() => { ... }, { scope: root })`
- Scroll state managed externally: `scroll` object in `lib/scroll.ts` (non-React, shared read)
- Lazy components with Suspense: `const SkyCanvas = lazy(() => import('./three/SkyCanvas'))`
- Cleanup functions in useEffect: return function to cancel animations or clear timers

## TypeScript

**Type Annotations:**
- Strict mode enforced: explicit return types on functions
- Any type avoided — inferred where possible, explicit generics when needed
- Type guards used: `(a): a is Account => a !== null` in array filter
- Optional properties marked: `subject?: string`, `label?: string`

---

*Convention analysis: 2026-06-24*
