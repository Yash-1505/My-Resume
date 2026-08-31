/**
 * vault.js — Encrypted local storage for the BYOK LLM API key.
 *
 * SECURITY MODEL (read this before touching this file):
 * - The API key is NEVER stored in plaintext anywhere — not in localStorage,
 *   not in a cookie, not on any server. It only ever exists in plaintext
 *   transiently, in this module's private memory, during an "unlocked"
 *   session, and only to attach it to an outgoing request header.
 * - Encryption: AES-256-GCM. Key derivation: PBKDF2-SHA256, 250,000
 *   iterations (OWASP 2023 minimum recommendation), random 16-byte salt
 *   per encryption. Random 12-byte IV per encryption (GCM requires a
 *   fresh IV every time — reusing one with the same key breaks GCM's
 *   security guarantees entirely).
 * - The passphrase itself is NEVER stored anywhere, in any form. It only
 *   exists in memory for the moment it takes to derive a key from it.
 * - Nothing in this module ever calls console.log/warn/error with the key
 *   or passphrase, and nothing writes them into the DOM.
 * - The decrypted key is cleared from memory on page unload and via the
 *   explicit lock() call — never persists across a tab close.
 */
(function () {
  const STORAGE_KEY = 'pf_ai_vault';
  const PBKDF2_ITERATIONS = 250000;

  let sessionKeyPlaintext = null; // private to this closure — never exposed on window

  function toB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function fromB64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
  }

  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable — can't be pulled back out as raw bytes
      ['encrypt', 'decrypt']
    );
  }

  /** Encrypts apiKey with a key derived from passphrase, stores the result. Overwrites any existing vault. */
  async function saveKey(apiKey, passphrase, meta) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKey));
    const record = {
      salt: toB64(salt),
      iv: toB64(iv),
      ciphertext: toB64(ciphertext),
      meta: meta || {}, // non-secret config: provider, endpoint, model — fine in plaintext
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }

  function hasStoredKey() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  function getMeta() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw).meta || null; } catch (e) { return null; }
  }

  /** Decrypts the stored key into session memory. Throws on wrong passphrase or corrupt data. */
  async function unlock(passphrase) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('No key saved yet.');
    const record = JSON.parse(raw);
    const salt = fromB64(record.salt);
    const iv = fromB64(record.iv);
    const ciphertext = fromB64(record.ciphertext);
    const key = await deriveKey(passphrase, salt);
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    } catch (e) {
      throw new Error('Wrong passphrase.'); // GCM auth tag mismatch surfaces as a generic decrypt failure
    }
    sessionKeyPlaintext = new TextDecoder().decode(plaintext);
    return true;
  }

  function isUnlocked() {
    return sessionKeyPlaintext !== null;
  }

  /** Clears the decrypted key from memory. Does NOT delete the stored encrypted vault. */
  function lock() {
    sessionKeyPlaintext = null;
  }

  /** Permanently deletes the stored vault (encrypted blob) and clears memory. */
  function wipe() {
    localStorage.removeItem(STORAGE_KEY);
    sessionKeyPlaintext = null;
  }

  /**
   * The only way anything outside this module ever touches the plaintext
   * key: pass a callback that receives it and returns a Promise. The key
   * is handed to your callback, used, and never returned or stored by
   * this function. Throws if the vault isn't unlocked.
   */
  async function withKey(callback) {
    if (sessionKeyPlaintext === null) throw new Error('Vault is locked. Unlock it first.');
    return callback(sessionKeyPlaintext);
  }

  // Defense in depth: never let the decrypted key survive a tab close/reload.
  window.addEventListener('pagehide', () => { sessionKeyPlaintext = null; });
  window.addEventListener('beforeunload', () => { sessionKeyPlaintext = null; });

  window.AIVault = { saveKey, hasStoredKey, getMeta, unlock, isUnlocked, lock, wipe, withKey };
})();
