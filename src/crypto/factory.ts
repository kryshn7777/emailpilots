import { ENC_PREFIX, isEncrypted, type SecretBox } from './secretBox';

/**
 * Pick the SecretBox for the current process, mirroring transport/factory.ts's
 * makeStrategy: one place that resolves an environment-dependent implementation
 * so callers stay ignorant of it.
 *
 * Electron  ⇒ safeStorageBox — real OS-backed protection, or a hard throw.
 * Otherwise ⇒ plaintextBox   — vitest and any pure-Node caller.
 *
 * `require('electron')` must stay INSIDE the process.versions.electron guard.
 * Vitest transforms this module to ESM where a bare `require` is a
 * ReferenceError; the guard is false there so the call is never evaluated.
 * (Same trick as config.ts's decrypt path — do not hoist it to module scope.)
 */
function electronSafeStorage(): any | null {
  try {
    if (!process.versions || !process.versions.electron) return null;
    const { safeStorage } = require('electron');
    return safeStorage || null;
  } catch {
    // Electron present but the module is unreachable (e.g. a utility process).
    return null;
  }
}

/**
 * OS-backed protection. Availability is re-checked on EVERY call rather than
 * cached at construction: safeStorage.isEncryptionAvailable() is false until
 * app.whenReady() on some platforms, so a box built at import time would
 * otherwise be permanently poisoned for the life of the process.
 */
export function safeStorageBox(ss: any): SecretBox {
  const unavailable = () =>
    new Error(
      'Secret protection is unavailable on this system (Electron safeStorage reported no backing store). ' +
      'Refusing to read or write secrets unprotected.'
    );

  // A closure, not a `this.available()` method call: callers are free to
  // destructure the box (`const { encrypt } = makeSecretBox()`), which would
  // unbind `this` and blow up inside encrypt/decrypt.
  const available = (): boolean => {
    try { return !!ss.isEncryptionAvailable(); } catch { return false; }
  };

  return {
    available,

    encrypt(plain: string): string {
      if (!plain) return '';
      if (!available()) throw unavailable();
      try {
        return ENC_PREFIX + ss.encryptString(plain).toString('base64');
      } catch (e: any) {
        // Fail closed. The pre-seam code returned `plain` here, silently writing
        // an unmarked plaintext secret that was indistinguishable on disk from
        // an encrypted one.
        throw new Error(`Failed to encrypt a secret: ${e?.message || e}`);
      }
    },

    decrypt(stored: string | undefined): string {
      if (!stored) return '';
      // Legacy plaintext is readable without the keystore. Checked BEFORE
      // available() so an install with a missing backing store can still load
      // its pre-encryption data instead of hard-failing at startup.
      if (!isEncrypted(stored)) return stored;
      if (!available()) throw unavailable();
      try {
        return ss.decryptString(Buffer.from(stored.substring(ENC_PREFIX.length), 'base64'));
      } catch (e: any) {
        throw new Error(`Failed to decrypt a secret: ${e?.message || e}`);
      }
    },
  };
}

/**
 * Non-Electron passthrough: vitest specs and any pure-Node tooling. There is no
 * safeStorage outside Electron, so there is nothing to protect WITH — this box
 * is honest about that rather than pretending.
 *
 * `available()` is false, so no caller can mistake a passthrough write for a
 * protected one. Electron NEVER receives this box (makeSecretBox returns
 * safeStorageBox whenever the runtime is Electron, even when its backing store
 * is missing — that case throws instead of degrading here).
 */
export function plaintextBox(): SecretBox {
  return {
    available: () => false,
    encrypt: (plain: string) => plain || '',
    decrypt: (stored: string | undefined) => {
      if (!stored) return '';
      if (isEncrypted(stored)) {
        // Ciphertext with no way to open it. Throwing beats the pre-seam
        // behaviour of returning the raw `ENC:...` string, which callers then
        // used AS the password and got an inscrutable SMTP auth failure.
        throw new Error(
          'Cannot decrypt: this value is protected by the OS keystore and is only readable inside the desktop app.'
        );
      }
      return stored;
    },
  };
}

/** Resolve the SecretBox for this process. Cheap; safe to call per operation. */
export function makeSecretBox(): SecretBox {
  const ss = electronSafeStorage();
  return ss ? safeStorageBox(ss) : plaintextBox();
}
