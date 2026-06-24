# Testing Patterns

**Analysis Date:** 2026-06-24

## Test Framework

**Runner:**
- vitest 4.1.8
- Config: `vitest.config.ts` at root
- Environment: Node.js (`environment: 'node'`)

**Assertion Library:**
- vitest built-in `expect()` (Vitest uses Chai assertions)

**Run Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode
npm run test-send        # Manual integration test (runs src/index.ts --test)
```

**Config Details:**
File: `vitest.config.ts`
```typescript
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

## Test File Organization

**Location:**
- Co-located in `src/__tests__/` directory (separate from source but in same package)
- Not alongside source files (no sibling `.test.ts` pattern)

**Naming:**
- Suffix: `.test.ts` — vitest auto-discovers via glob `src/**/*.test.ts`
- Module name matches source: `rateLimiter.ts` → `rateLimiter.test.ts`

**File List:**
- `src/__tests__/csvMapping.test.ts` — CSV parsing and field detection
- `src/__tests__/multiAccount.test.ts` — Multi-account integration
- `src/__tests__/rateLimiter.test.ts` — Rate limiting logic
- `src/__tests__/renderer.test.ts` — Email rendering (Mustache + templates)
- `src/__tests__/replyStore.test.ts` — Reply persistence
- `src/__tests__/sequenceRunner.test.ts` — Drip sequence state machine
- `src/__tests__/smtpUtils.test.ts` — SMTP helper functions
- `src/__tests__/spamCheck.test.ts` — Spam scoring
- `src/__tests__/suppressionManager.test.ts` — Suppression list persistence

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../myFunction';

describe('myFunction', () => {
  it('does something specific', () => {
    const result = myFunction();
    expect(result).toBe(true);
  });

  it('handles edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

**Patterns:**
- Top-level `describe()` wraps all tests for a module
- Each `it()` tests one behavior/assertion path
- Test names describe the behavior being tested (not "works" but "enforces daily cap")
- Nested `describe()` blocks group related tests (optional; used in some files)

**Setup Pattern:**
- Helper functions defined before tests: `tmpDir()`, `limits()`, `makeConfig()`, `deps()`
- Factories create fresh test data: `limits(overrides)` merges defaults with test-specific values
- Temp directories created per test via `fs.mkdtempSync()` — no shared state

**Teardown Pattern:**
- No explicit teardown observed; temp directories auto-cleaned by OS
- File-based tests write to mkdtemp — never to project files
- Mock state reset between tests via fresh function calls (no beforeEach)

**Assertion Pattern:**
```typescript
expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
expect(blocked.reason).toMatch(/daily send cap/);
expect(records).toHaveLength(1);
expect(record).toMatchObject({ active: true, email: 'a@x.com' });
```

- `toBe()` for exact value/boolean matching
- `toMatch()` for regex matching (error messages)
- `toHaveLength()` for array/collection size
- `toMatchObject()` for partial object matching
- `toContain()` for array/string membership
- `toBeGreaterThan()` for numeric comparison
- `toBeUndefined()` for null checks

## Mocking

**Framework:** No external mocking library (no vitest.mock or jest.mock)

**Patterns:**
Dependency injection used instead of mocking:
```typescript
// From sequenceRunner.test.ts
function deps(opts: { replied?: boolean; sendResult?: boolean }): SeqDeps & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    now: () => NOW,
    hasRepliedSince: () => !!opts.replied,
    send: async (rec: any) => { sent.push(rec); return opts.sendResult !== false; },
  };
}
```

**What to Mock:**
- External I/O that's slow/unreliable: not mocked, use temp files instead
- Time: inject `now()` function returning fixed timestamp (enables deterministic drip tests)
- Network calls: not tested; SMTP in unit tests uses dry-run paths or skipped
- Reply detection: injected as boolean function in `SeqDeps`

**What NOT to Mock:**
- File system — real temp directories used for persistence tests
- JSON parsing — tested with real JSON to catch parsing bugs
- Mustache rendering — real templates and data tested
- Rate limiter state — persisted to real limits.json, read back to verify

## Fixtures and Factories

**Test Data:**
```typescript
function makeConfig(overrides: { templateHtml?: string; ... } = {}): Config {
  return {
    userName: 'Tester',
    campaigns: overrides.campaigns ?? [],
    smtp: { host: 'smtp.x.com', port: 587, user: overrides.user ?? 'me@x.com', pass: 'pw' },
    paths: { ... },
    email: { subject: overrides.subject ?? 'Default Subject' },
    limits: { ... },
    sender: { ... },
    cronSchedule: '0 9 * * *',
  };
}

function limits(overrides: Partial<RateLimits> = {}): RateLimits {
  return {
    maxPerDay: 50,
    maxPerWindow: 10,
    maxWindowsPerDay: 5,
    minDelayMs: 0,
    maxDelayMs: 0,
    maxAttachmentBytes: 10 * 1024 * 1024,
    maxPerRecipientPerDay: 99,
    warmupEnabled: false,
    warmupCurve: [],
    ...overrides,
  };
}
```

**Location:**
- Defined at top of test file, before `describe()` blocks
- Not extracted to separate fixture files
- Factories support defaults + overrides for test-specific customization

## Coverage

**Requirements:** Not enforced (no coverage threshold in CI)

**View Coverage:**
```bash
vitest run --coverage  # Run with coverage reporter (if installed)
```

**Current Coverage Gaps:**
- Landing page (React) has no tests
- Electron main process (`electron/main.ts`) not tested
- IPC handlers not unit tested (integration only)
- SMTP send itself not tested (would require test account)
- Scheduler cron tasks tested indirectly via state assertions

## Test Types

**Unit Tests:**
- Scope: Single function/class in isolation
- Approach: Pure logic tested with fixtures, no external I/O (except temp files for persistence)
- Examples:
  - `rateLimiter.test.ts`: Tests `RateLimiter` class methods with temp limits.json
  - `csvMapping.test.ts`: Tests parsing functions with synthetic data
  - `renderer.test.ts`: Tests email rendering with temp template files
  - `spamCheck.test.ts`: Tests spam scoring logic (pure function)

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Real Config objects, temp file system, multi-step flows
- Examples:
  - `sequenceRunner.test.ts`: Tests drip state machine with injected time/send
  - `multiAccount.test.ts`: Tests multiple account persistence interaction
  - `suppressionManager.test.ts`: Tests suppression list across multiple instances

**E2E Tests:**
- Framework: Not used (no Playwright/Cypress tests observed)
- Alternative: Manual `npm run test-send` runs the full app with `--test` flag
- Landing page E2E: Playwright core available in landing/package.json but no tests written

## Common Patterns

**Async Testing:**
```typescript
it('sends the initial step when due', async () => {
  const d = deps({ sendResult: true });
  const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1' };
  const changed = await advanceSequenceRecord(rec, [seq], d);
  expect(changed).toBe(true);
});
```

- `async` keyword on test function
- `await` on async function calls (`advanceSequenceRecord()`)
- Vitest awaits returned promise automatically

**Error Testing:**
```typescript
it('skips invalid emails and counts them', () => {
  const rows = [
    { email: 'good@x.com', name: '', subject: '', message: '' },
    { email: 'bad-email', name: '', subject: '', message: '' },
  ];
  const { records, summary } = buildRecordsFromRows(rows, mapping, []);
  expect(records).toHaveLength(1);
  expect(summary.skippedInvalid).toBe(1);
});
```

- Errors caught internally, results inspected
- No `expect(() => ...).toThrow()` (errors handled gracefully in code)
- Validation tested via summary/count

**State Persistence Testing:**
```typescript
it('persists counters across instances', () => {
  const dir = tmpDir();
  new RateLimiter(dir, limits()).tryConsume('a@x.com', 0);
  expect(new RateLimiter(dir, limits()).getUsage().emailsToday).toBe(1);
});
```

- Two instances created separately
- First modifies state (writes to limits.json)
- Second reads same file, verifies state persisted
- Confirms file-based sharing works across process boundaries

**Race Condition Testing:**
```typescript
it('two live instances for the same account do not clobber each others counts', () => {
  const dir = tmpDir();
  const a = new RateLimiter(dir, limits({ maxPerDay: 3 }));
  const b = new RateLimiter(dir, limits({ maxPerDay: 3 }));
  a.tryConsume('a@x.com', 0);
  b.tryConsume('b@x.com', 0);  // must build on a's persisted send, not overwrite it
  expect(new RateLimiter(dir, limits()).getUsage().emailsToday).toBe(2);
});
```

- Multiple instances created targeting same file
- Operations on both instances
- Fresh instance reads verify both counts were preserved
- Catches file-overwrite race condition

## Testing Best Practices Observed

1. **Use real file I/O for persistence tests** — temp files catch actual bugs (atomic writes, JSON parsing)
2. **Inject dependencies for control** — `SeqDeps`, `now()` injection enables deterministic time-based tests
3. **Factory functions for config** — `makeConfig(overrides)` reduces boilerplate and test readability
4. **Test both success and failure paths** — rate limits hit/passed, emails valid/invalid, files exist/missing
5. **No global test state** — each test creates fresh temp dirs and objects
6. **Comprehensive edge cases** — warmup ramps, duplicate detection, per-recipient limits, attachment size checks
7. **Descriptive test names** — "enforces daily cap" tells you what's being protected, not just "works"

---

*Testing analysis: 2026-06-24*
