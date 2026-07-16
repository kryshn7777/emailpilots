import { describe, it, expect } from 'vitest';
import { makeSecretBox, safeStorageBox, plaintextBox } from '../crypto/factory';
import { isEncrypted, ENC_PREFIX } from '../crypto/secretBox';

/**
 * Stand-in for Electron's safeStorage. "Encryption" is a 'K' prefix — enough to
 * prove the box round-trips, marks, and base64-wraps, without needing Electron.
 */
function fakeSafeStorage(opts: {
  available?: boolean;
  encryptThrows?: boolean;
  decryptThrows?: boolean;
  availableThrows?: boolean;
} = {}) {
  const state = { available: opts.available !== false };
  return {
    state,
    isEncryptionAvailable: () => {
      if (opts.availableThrows) throw new Error('backing store exploded');
      return state.available;
    },
    encryptString: (s: string) => {
      if (opts.encryptThrows) throw new Error('encrypt boom');
      return Buffer.from('K' + s, 'utf-8');
    },
    decryptString: (b: Buffer) => {
      if (opts.decryptThrows) throw new Error('decrypt boom');
      return b.toString('utf-8').slice(1);
    },
  };
}

describe('isEncrypted', () => {
  it('recognises only the ENC: marker', () => {
    expect(isEncrypted('ENC:abc')).toBe(true);
    expect(isEncrypted('hunter2')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    // Lookalikes must not be mistaken for ciphertext.
    expect(isEncrypted('enc:abc')).toBe(false);
    expect(isEncrypted(' ENC:abc')).toBe(false);
  });
});

describe('safeStorageBox', () => {
  it('round-trips a secret through the ENC: wire format', () => {
    const box = safeStorageBox(fakeSafeStorage());
    const stored = box.encrypt('hunter2');
    expect(stored.startsWith(ENC_PREFIX)).toBe(true);
    // The payload must be base64 of the blob, not the raw secret.
    expect(stored).not.toContain('hunter2');
    expect(box.decrypt(stored)).toBe('hunter2');
  });

  it('maps empty in to empty out (blank means "no secret", not "encrypt nothing")', () => {
    const box = safeStorageBox(fakeSafeStorage());
    expect(box.encrypt('')).toBe('');
    expect(box.decrypt('')).toBe('');
    expect(box.decrypt(undefined)).toBe('');
  });

  it('returns legacy plaintext verbatim so pre-encryption installs keep loading', () => {
    const box = safeStorageBox(fakeSafeStorage());
    expect(box.decrypt('hunter2')).toBe('hunter2');
  });

  // --- The defect this seam exists to kill -------------------------------
  it('THROWS rather than writing plaintext when the backing store is missing', () => {
    const box = safeStorageBox(fakeSafeStorage({ available: false }));
    expect(box.available()).toBe(false);
    expect(() => box.encrypt('hunter2')).toThrow(/unavailable/i);
  });

  it('THROWS rather than writing plaintext when encryptString fails', () => {
    const box = safeStorageBox(fakeSafeStorage({ encryptThrows: true }));
    expect(() => box.encrypt('hunter2')).toThrow(/Failed to encrypt/i);
  });

  it('never returns the plaintext it was asked to protect on failure', () => {
    for (const ss of [fakeSafeStorage({ available: false }), fakeSafeStorage({ encryptThrows: true })]) {
      const box = safeStorageBox(ss);
      let out: string | undefined;
      try { out = box.encrypt('hunter2'); } catch { /* expected */ }
      expect(out).toBeUndefined();
    }
  });
  // ----------------------------------------------------------------------

  it('throws on undecryptable ciphertext instead of handing back the ENC: string', () => {
    const box = safeStorageBox(fakeSafeStorage({ decryptThrows: true }));
    expect(() => box.decrypt('ENC:garbage')).toThrow(/Failed to decrypt/i);
  });

  it('reads legacy plaintext even with no backing store', () => {
    // Only ENC: values need the keystore; a missing store must not brick an
    // unencrypted install at startup.
    const box = safeStorageBox(fakeSafeStorage({ available: false }));
    expect(box.decrypt('hunter2')).toBe('hunter2');
  });

  it('re-checks availability per call rather than caching it at construction', () => {
    // safeStorage reports unavailable until app.whenReady() on some platforms.
    // A box built at import time must recover, not stay poisoned for the process.
    const ss = fakeSafeStorage({ available: false });
    const box = safeStorageBox(ss);
    expect(box.available()).toBe(false);
    ss.state.available = true;
    expect(box.available()).toBe(true);
    expect(box.decrypt(box.encrypt('hunter2'))).toBe('hunter2');
  });

  it('treats a throwing isEncryptionAvailable as unavailable, not as a crash', () => {
    const box = safeStorageBox(fakeSafeStorage({ availableThrows: true }));
    expect(box.available()).toBe(false);
    expect(() => box.encrypt('hunter2')).toThrow(/unavailable/i);
  });

  it('survives being destructured (no `this` binding)', () => {
    const { encrypt, decrypt } = safeStorageBox(fakeSafeStorage());
    expect(decrypt(encrypt('hunter2'))).toBe('hunter2');
  });
});

describe('plaintextBox', () => {
  it('reports itself unavailable so no caller mistakes it for protection', () => {
    expect(plaintextBox().available()).toBe(false);
  });

  it('passes plaintext through in both directions', () => {
    const box = plaintextBox();
    expect(box.encrypt('hunter2')).toBe('hunter2');
    expect(box.decrypt('hunter2')).toBe('hunter2');
    expect(box.encrypt('')).toBe('');
    expect(box.decrypt(undefined)).toBe('');
  });

  it('throws on ENC: input instead of returning ciphertext as if it were the secret', () => {
    // The pre-seam behaviour returned the raw 'ENC:...' string, which callers
    // then used AS the password — producing a baffling SMTP auth failure.
    expect(() => plaintextBox().decrypt('ENC:abc')).toThrow(/desktop app/i);
  });
});

describe('makeSecretBox', () => {
  it('returns the passthrough box outside Electron (vitest, CLI)', () => {
    // Guards the require('electron') hoisting hazard: if that call escaped its
    // process.versions.electron guard, this would throw a ReferenceError under
    // vitest's ESM transform.
    expect(process.versions.electron).toBeUndefined();
    const box = makeSecretBox();
    expect(box.available()).toBe(false);
    expect(box.encrypt('hunter2')).toBe('hunter2');
  });
});
