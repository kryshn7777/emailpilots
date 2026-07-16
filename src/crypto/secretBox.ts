/**
 * At-rest secret protection — the interface half.
 *
 * Every secret this app persists (SMTP passwords, MSAL token caches, and from
 * the secureJson layer up, contacts/replies/drafts) goes through a SecretBox so
 * there is exactly ONE place that decides how bytes are protected. Before this
 * seam existed the `ENC:` scheme was copy-pasted across three files, each with
 * subtly different failure behaviour.
 *
 * Wire format is unchanged and MUST stay unchanged — `ENC:` + base64 of an
 * Electron safeStorage blob (Windows DPAPI / macOS Keychain / Linux Secret
 * Service). Existing installs have this on disk already.
 */

/** Marker for a safeStorage-protected value. Anything lacking it is legacy plaintext. */
export const ENC_PREFIX = 'ENC:';

export interface SecretBox {
  /**
   * Whether `encrypt()` produces real ciphertext. When false, either `encrypt()`
   * throws (Electron without safeStorage — fail closed) or the box is the
   * non-Electron passthrough. Never treat false as "safe to persist secrets".
   */
  available(): boolean;

  /**
   * Empty in ⇒ empty out (callers use '' to mean "no secret"; there is nothing
   * to protect and an encrypted '' would defeat the blank-means-keep contract).
   * Otherwise returns `ENC:<base64>`.
   *
   * THROWS when protection is unavailable. That is the point: a silent plaintext
   * fallback writes an unmarked secret to disk that reads back looking identical
   * to a deliberate one.
   */
  encrypt(plain: string): string;

  /**
   * Empty/undefined ⇒ ''. `ENC:` ⇒ decrypted plaintext. Anything else is
   * returned verbatim — legacy plaintext tolerance, so installs written before
   * encryption existed keep loading and get upgraded on their next write.
   *
   * THROWS only when an `ENC:` value cannot be decrypted. Callers that must not
   * throw (loadConfig) catch and degrade to '' — an empty password fails auth
   * with a clear message, whereas returning the ciphertext string would send
   * `ENC:...` as the password and produce a baffling one.
   */
  decrypt(stored: string | undefined): string;
}

/** True for values written by a SecretBox. Cheap prefix test, no crypto. */
export function isEncrypted(v: string | undefined): boolean {
  return typeof v === 'string' && v.startsWith(ENC_PREFIX);
}
