# Testing Patterns

**Analysis Date:** 2026-08-18

**Source codebase:** the Email Pilots product app at `C:\AntigravityProjects\MailAutomation`. Suite verified live during this analysis: **83 test files, 702 tests, all passing in ~27s** (`npx vitest run`, 2026-08-18).

## Test Framework

**Runner:**
- Vitest 4 (`vitest@^4.1.8` in `package.json`)
- Config: `vitest.config.ts` — deliberately minimal:
  ```ts
  export default defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  });
  ```
- Environment is `node` for EVERYTHING — no jsdom, no browser mode. All tests are pure-Node specs; renderer DOM logic is factored into pure modules (`src/spamCheck.ts`, `src/csvMapping.ts`, `src/onboarding.ts`, `src/nextRun.ts`) so it can be tested without a DOM.

**Assertion Library:** Vitest built-in `expect`.

**Run Commands:**
```bash
npm test              # vitest run (all tests, CI mode)
npm run test:watch    # vitest (watch mode)
# no coverage script exists
```

**CI:** `.github/workflows/ci.yml` — Node 22 on ubuntu-latest, `npm ci` + `npm test`, with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` because the tests never need the Electron binary. No lint step, no typecheck step in CI.

## Typecheck Is a Manual Gate (repo rule — carry this forward)

**Vite/esbuild transpile without type-checking, so type errors land silently.** There is no `tsc` npm script. The manual gate (also codified as the `/typecheck` skill in `.claude/skills/typecheck/SKILL.md`) runs all three tsconfig projects:

```bash
npx tsc -p tsconfig.json --noEmit           # CORE     — src/** (strict)
npx tsc -p tsconfig.electron.json --noEmit  # ELECTRON — electron/** + the src files it imports (strict, NodeNext)
npx tsc -p tsconfig.vite.json --noEmit      # RENDERER — src/main.ts only (strict + noUnusedLocals/noUnusedParameters/noFallthroughCasesInSwitch)
```

A TypeScript change is not done until CORE and ELECTRON are clean for the touched files. **Website implication:** if the new site also builds through Vite, the same trap applies — make `tsc --noEmit` (or `astro check` / equivalent) an explicit verify step, ideally in CI, which the app repo never did.

## Test File Organization

**Location — two patterns coexist:**
- Central: `src/__tests__/*.test.ts` (the majority, 38 files) — plus two special subdirectories (below)
- Co-located: newer subsystems put tests next to the module — `src/transport/factory.test.ts`, `src/ai/personalizer.test.ts`, `src/ai/replyClassifier.test.ts`, `src/ai/spamAdvisor.test.ts`, `src/ai/writingAssistant.test.ts`

**Naming:**
- Regular: `<module>.test.ts` matching the module under test (`rateLimiter.test.ts` ↔ `src/rateLimiter.ts`); behavior-scoped variants allowed (`mailProcessor.onFailure.test.ts`, `mailProcessor.sentLog.test.ts`)
- Audit regression repros: `src/__tests__/audit/<id>-<slug>.audit.test.ts` (15 files), e.g. `s2-corrupt-state-fails-open-and-clobbers.audit.test.ts`, `a1-save-recipients-clobbers-sequence-state.audit.test.ts` — the id (`a1`, `s2`, `csa5`, `k3`) traces to a numbered finding in the repo-root `AUDIT*.md` documents
- Stress scenarios: `src/__tests__/stress/sNN-<slug>.stress.test.ts` (24 files, `s00`–`s23`), 100-emails-per-scenario load tests with shared harness files `src/__tests__/stress/helpers.ts` and `pollerHarness.ts` (plain `.ts`, never collected — only `*.test.ts` matches the include glob)

**Structure:**
```
src/
├── __tests__/
│   ├── <module>.test.ts          # unit/behavior specs
│   ├── audit/                    # FIX-GUARD regression repros, one per audit finding
│   │   └── <id>-<slug>.audit.test.ts
│   └── stress/                   # 100x load scenarios + shared harness (helpers.ts)
│       └── sNN-<slug>.stress.test.ts
├── transport/factory.test.ts     # co-located style (newer subsystems)
└── ai/*.test.ts
```

## Test Structure

**Suite Organization** (real example, `src/__tests__/rateLimiter.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RateLimiter, RateLimits } from '../rateLimiter';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-rl-'));
}

function limits(overrides: Partial<RateLimits> = {}): RateLimits {
  return { maxPerDay: 50, maxPerWindow: 10, /* …full defaults… */ ...overrides };
}

describe('RateLimiter', () => {
  it('enforces the daily cap', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerDay: 3 }));
    // … three allowed sends …
    const blocked = rl.tryConsume('d@x.com', 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/daily send cap/);
  });
});
```

**Patterns:**
- `describe` names the unit; `it` titles are full behavior sentences, including negative space: `'fires onFailure (and NOT onSuccess) when sendMail throws an account-level error'`
- Setup: local factory functions per file (`tmpDir()`, `limits(overrides)`, `makeConfig(...)`) — `Partial<T>` + spread defaults, never shared global fixtures
- Teardown: `beforeEach`/`afterEach` create/remove a per-test temp dir:
  ```ts
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-s2-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  ```
- Env-var seams saved and restored in `afterEach` (`MAIL_DATA_DIR` redirects `getBasePath()` — see `src/__tests__/mailProcessor.onFailure.test.ts:41-45`, `setDataDir()` in `stress/helpers.ts`)
- Assertion messages carry the loop label in table-driven tests: `expect(res.ok, label).toBe(false)`
- Table-driven inputs as `Array<[label, value]>` — see the `CORRUPTIONS` table of "every way a state file realistically goes bad" in `s2-corrupt-state-fails-open-and-clobbers.audit.test.ts`
- **Audit tests open with a header comment** stating the bug, the fix, and the scope boundary ("AUDIT FIX-GUARD — S2 is FIXED; this asserts the corrected behavior… SentLedger is deliberately NOT changed, and that asymmetry is the point") — tests double as decision records that pin behavior against future "fixes"
- Time-sensitive tests derive timestamps from `Date.now()`, never hardcoded dates — a fixed-date fixture in the Graph reply-poller tests self-broke on calendar drift against a 7-day lookback window (repo memory: stale-date-fixtures-timebomb)

## Mocking

**House rules** — stated verbatim in `src/__tests__/stress/helpers.ts` and followed suite-wide:
> no `vi.mock`, no fake timers — plain-object fakes + injected state; every scenario runs against its own mkdtemp dir; zero real network

- **Zero `vi.mock()` module mocks in the entire suite** (verified by grep). Zero `vi.useFakeTimers`. Test seams are constructor/argument injection, not module interception.
- Plain-object fakes cast at the boundary:
  ```ts
  // src/__tests__/mailProcessor.onFailure.test.ts
  const svc = {
    sendMail: async () => { throw Object.assign(new Error('535 auth failed'), { code: 'EAUTH', responseCode: 535 }); },
  } as unknown as EmailService;
  const proc = new MailProcessor(makeConfig(recipientsJson), svc, onSuccess, 'acct-1', onFailure);
  ```
- Sentinel-identity checks for injected strategies: `expect(makeStrategy(cfg({ transport: 'browser' }), { createBrowserStrategy })).toBe(sentinel)` (`src/transport/factory.test.ts`)
- Sanctioned `vi.*` usage is limited to:
  - `vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))` for HTTP-API modules (`src/__tests__/graphStrategy.test.ts`, `graphReplyPoller.test.ts`, `licensing.test.ts`)
  - `vi.spyOn(console, 'warn').mockImplementation(() => {})` to silence expected noise (`sentCopy.test.ts`, `sentLog.test.ts`, `stress/helpers.ts:289-291`)
  - `vi.fn()` for callable fakes whose call counts matter (`sentCopy.test.ts` IMAP client fake)

**What to Mock:**
- The network edge only: SMTP/IMAP clients, `fetch` (Graph API, license API). Console, when a test intentionally exercises a warning path.

**What NOT to Mock:**
- The filesystem — tests run against REAL files in per-test `mkdtempSync` dirs; corruption cases write actual truncated/garbage files and reload real stores from disk. This is why the fail-open/fail-closed behavior is trustworthy.
- Timers/clocks — pacing is tested with `minDelayMs: 0` configs instead of fake time.
- Any in-repo module.

## Fixtures and Factories

**Test Data:**
```ts
// Per-file factory with Partial overrides — the universal pattern
function makeStressConfig(dir: string, overrides: StressOverrides = {}): Config {
  const base: Config = { smtp: {…}, paths: {…pointed at dir…}, limits: {…generous…}, … };
  return { ...base, ...overrides /* with per-section deep merges */ };
}
```
- `StressOverrides` (`stress/helpers.ts:48-54`) shows the deep-partial pattern: `Partial<Omit<Config, sections>>` plus `Partial<Config['section']>` per nested section

**Location:**
- No fixture files, no JSON blobs, no factory library. Data is built in code, in the test file (or `stress/helpers.ts` for the stress suite). State files are written with `fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([...]))` inline.

## Coverage

**Requirements:** none enforced. No coverage script, no thresholds, no coverage tooling installed. The regression discipline substitutes: every confirmed audit bug gets a permanent `.audit.test.ts` repro before/with its fix.

## Test Types

**Unit Tests:** `src/__tests__/*.test.ts` + co-located — pure logic modules tested directly (`domainAuth`, `nextRun`, `csvMapping`, `spamCheck`, `smtpUtils`), stores tested against real temp-dir files.

**Integration Tests:** same runner, no separate tier — e.g. `multiAccount.test.ts` and `mailProcessor.*.test.ts` run the real `MailProcessor`/`campaignRunner` pipeline end-to-end with only the transport faked.

**Regression (audit) Tests:** `src/__tests__/audit/` — one file per audited bug, header comment documents the finding; suffix `.audit.test.ts`.

**Stress Tests:** `src/__tests__/stress/` — 100-recipient scenarios (cap exhaustion, warmup curve, failure injection, suppression race, bounce storm, stats conservation), suffix `.stress.test.ts`, run in the normal `npm test` (no separate command; whole suite stays ~27s).

**E2E Tests:** none. No Playwright/Cypress; the Electron UI layer (`electron/main.ts` IPC handlers, `src/main.ts` renderer) is untested — its logic is pushed down into the pure modules instead. Manual verification uses the `/test-send` skill (guard-railed live-engine dry run rerouting to the sender's own inbox; `TEST_MODE=true` mandatory).

## Common Patterns

**Async Testing:**
```ts
it('fires onFailure … when sendMail throws', async () => {
  const res = await proc.processEmails();
  expect(res.failed).toBe(1);
});
```
Plain `async`/`await`; no `done` callbacks, no waitFor helpers.

**Error Testing:**
```ts
// Thrown errors — regex match on the message
expect(() => makeStrategy(cfg({ transport: 'browser' }))).toThrow(/browser/i);

// Result-object errors — assert the discriminant, then narrow
const res = readJsonState(path.join(dir, 'bad.json'));
expect(res.ok).toBe(false);
if (!res.ok) expect(res.error).toMatch(/empty|truncat/i);

// Rich error fields survive the pipeline
expect(failures[0].error.code).toBe('EAUTH');
```

**Persistence Testing** (a house specialty worth copying anywhere state exists):
```ts
// Re-instantiate against the same dir to prove persistence…
expect(new RateLimiter(dir, L).getUsage().maxPerDay).toBe(50);
// …and hand-corrupt the on-disk file to prove recovery behavior
const state = JSON.parse(fs.readFileSync(file, 'utf-8'));
state.warmupOverrideDate = '2000-01-01';
fs.writeFileSync(file, JSON.stringify(state));
expect(new RateLimiter(dir, L).getUsage().warmupOverriddenToday).toBe(false);
```

## Website-Relevant Carry-Overs (summary)

1. Vitest with a minimal config and a single `include` glob; keep the whole suite fast enough to run on every change (702 tests in ~27s here)
2. Behavior-sentence `it` titles; header comments on regression tests explaining the bug they pin
3. DI + plain-object fakes over `vi.mock`; stub only the true edges (fetch, network clients)
4. Real filesystem/temp-dir testing over fs mocks when state files exist
5. `Partial<T>` factory functions per test file, no fixture blobs
6. The `.audit.test.ts` convention: every real bug found gets a permanent named repro
7. Add what the app lacks: a typecheck step in CI and (if useful) coverage — the app's gaps here are known debt, not a pattern to copy

---

*Testing analysis: 2026-08-18*
