import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG, findModel, recommendModel, formatBytes,
  FREE_MODEL_ID, FIRST_CLASS_MODEL_ID,
} from '../ai/modelCatalog';

/**
 * The catalog is the one place a wrong constant costs a user a multi-GB download
 * that then fails checksum, so these pin its shape rather than its taste.
 */

describe('MODEL_CATALOG shape', () => {
  it('is non-empty and frozen (ids are persisted in config — they must not mutate)', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(0);
    expect(Object.isFrozen(MODEL_CATALOG)).toBe(true);
    for (const m of MODEL_CATALOG) expect(Object.isFrozen(m)).toBe(true);
  });

  it('has unique ids', () => {
    const ids = MODEL_CATALOG.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries a real sha256 for every entry', () => {
    // A truncated/uppercase/placeholder hash fails every download, and the failure
    // arrives only after the user has waited for gigabytes.
    for (const m of MODEL_CATALOG) {
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('carries a plausible exact byte size for every entry', () => {
    for (const m of MODEL_CATALOG) {
      expect(Number.isInteger(m.sizeBytes), m.id).toBe(true);
      // Big enough to be a real quantized model (the Free tier's LFM2.5 is
      // 219 MB — the floor sits below it), small enough to not be a typo'd
      // order of magnitude.
      expect(m.sizeBytes, m.id).toBeGreaterThan(100 * 1024 * 1024);
      expect(m.sizeBytes, m.id).toBeLessThan(30 * 1024 * 1024 * 1024);
    }
  });

  it('names a repo, a .gguf file and a license', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.repo, m.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(m.file, m.id).toMatch(/\.gguf$/);
      expect(m.license.length, m.id).toBeGreaterThan(0);
    }
  });

  it('carries only hand-verified entries, and declares which of them reason', () => {
    // Filenames can't prove instruction-tuning (LFM2.5-350M is pure-instruct but its
    // filename carries no "Instruct"), so every entry is HAND-VERIFIED against its
    // model card before it lands here. A reasoning build must ALSO be declared in
    // THINKING — that second list is what makes adding one a deliberate two-place
    // edit instead of an accident. Read modelCatalog.ts's docblock before touching
    // either list; ai/thinking.ts is what makes a reasoning model safe at all.
    const VERIFIED = [
      'qwen3-4b-instruct-2507-q4km',  // Qwen3 Instruct-2507: the non-thinking split
      'lfm25-350m-q4km',              // LFM2.5: instruction-tuned, no thinking blocks (model card + live load test 2026-07-18)
      'qwen3-4b-thinking-2507-q4km',  // Qwen3 Thinking-2507: reasons; opt-in only (model card + HF API 2026-09-06)
    ];
    const THINKING = ['qwen3-4b-thinking-2507-q4km'];
    for (const m of MODEL_CATALOG) {
      expect(VERIFIED, `${m.id} must be hand-verified against its model card`).toContain(m.id);
      if (/thinking|reasoning|[-_]r1[-_.]|qwq/i.test(`${m.file} ${m.name}`)) {
        expect(THINKING, `${m.id} reasons — declare it in THINKING and check ai/thinking.ts covers it`).toContain(m.id);
      }
    }
  });

  it('never lets a reasoning model become an anchor, the default offer, or the recommendation', () => {
    // The real invariant the old Instruct-only ban was protecting: reasoning latency
    // must never land on someone who did not choose it. A reply sweep runs the
    // classifier on every unread message.
    const THINKING = ['qwen3-4b-thinking-2507-q4km'];
    expect(THINKING).not.toContain(FIRST_CLASS_MODEL_ID);
    expect(THINKING).not.toContain(FREE_MODEL_ID);
    // Nothing else guards this: the onboarding offer picks MODEL_CATALOG[0] positionally.
    expect(MODEL_CATALOG[0].id).toBe(FIRST_CLASS_MODEL_ID);
    for (const tier of ['free', 'first-class'] as const) {
      for (const hasGpu of [true, false]) {
        const rec = recommendModel({ hasGpu, vramBytes: hasGpu ? 8 * 1024 ** 3 : 0 }, tier);
        expect(THINKING, `${tier}/${hasGpu ? 'gpu' : 'cpu'} recommended a reasoning model`).not.toContain(rec.model.id);
      }
    }
  });
});

describe('findModel', () => {
  it('finds a known id and rejects anything else', () => {
    expect(findModel(MODEL_CATALOG[0].id)?.id).toBe(MODEL_CATALOG[0].id);
    expect(findModel('nope')).toBeUndefined();
    expect(findModel('')).toBeUndefined();
    expect(findModel(undefined)).toBeUndefined();
  });
});

describe('recommendModel', () => {
  const GB = 1024 * 1024 * 1024;

  it('never refuses a GPU-less machine — it tells the truth instead', () => {
    // The CPU path genuinely works (an explicit gpu:'cpu' opt-out in localLlama.ts).
    // Offering nothing would be wrong; offering it silently would be the trap.
    const r = recommendModel({ hasGpu: false, totalRamBytes: 16 * GB });
    expect(r.model).toBeDefined();
    expect(r.comfortable).toBe(false);
    expect(r.reason).toMatch(/processor|slow/i);
  });

  it('is comfortable on a GPU with ample VRAM', () => {
    const r = recommendModel({ hasGpu: true, vramBytes: 12 * GB, totalRamBytes: 32 * GB });
    expect(r.comfortable).toBe(true);
  });

  it('warns when VRAM is below what the model prefers', () => {
    const r = recommendModel({ hasGpu: true, vramBytes: 2 * GB, totalRamBytes: 16 * GB });
    expect(r.comfortable).toBe(false);
    expect(r.reason).toMatch(/memory|slow/i);
  });

  it('treats UNKNOWN vram as fine rather than scaring the user off', () => {
    // Some drivers don't report VRAM. The loader fits the model to whatever is free
    // at load time, so guessing "too small" here would reject a working setup.
    const r = recommendModel({ hasGpu: true, vramBytes: 0, totalRamBytes: 16 * GB });
    expect(r.comfortable).toBe(true);
  });

  it('defaults to the First Class pick — existing callers must see pre-freemium behaviour', () => {
    // ai/hardware.ts calls recommendModel(hw) with no tier; until #7 wires the
    // real entitlement, that must keep recommending exactly the old model.
    const r = recommendModel({ hasGpu: true, vramBytes: 12 * GB, totalRamBytes: 32 * GB });
    expect(r.model.id).toBe(FIRST_CLASS_MODEL_ID);
  });

  it('free tier gets the small model, comfortable even without a GPU', () => {
    // CPU-viability is the point of shipping a 219 MB model: the no-GPU branch is
    // the Free pick's common case, not its sad path — never scare a free user off.
    const noGpu = recommendModel({ hasGpu: false, totalRamBytes: 8 * GB }, 'free');
    expect(noGpu.model.id).toBe(FREE_MODEL_ID);
    expect(noGpu.comfortable).toBe(true);
    const gpu = recommendModel({ hasGpu: true, vramBytes: 2 * GB, totalRamBytes: 16 * GB }, 'free');
    expect(gpu.model.id).toBe(FREE_MODEL_ID);
    expect(gpu.comfortable).toBe(true);
  });

  it('per-tier anchor ids resolve to real catalog entries with the right licences', () => {
    // #7 keys the gate off these ids, and the licence strings are shown before a
    // download — lfm1.0 is a commercial-use tripwire (free under $10M revenue)
    // that must never be relabelled as an open licence.
    expect(findModel(FIRST_CLASS_MODEL_ID)?.license).toBe('apache-2.0');
    expect(findModel(FREE_MODEL_ID)?.license).toBe('lfm1.0');
  });
});

describe('formatBytes', () => {
  it('formats GB and MB, and degrades on nonsense', () => {
    expect(formatBytes(2497281120)).toBe('2.3 GB');
    expect(formatBytes(500 * 1024 * 1024)).toBe('500 MB');
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});
