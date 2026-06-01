const ITERATIONS = 200_000;
const KEY_LEN = 256;

function toBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return toBase64(salt);
}

async function deriveKey(password, saltB64) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(saltB64),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LEN },
    false,
    ["encrypt", "decrypt"],
  );
}

let cachedKey = null;
let cachedSalt = null;

export async function unlock(password, saltB64) {
  cachedKey = await deriveKey(password, saltB64);
  cachedSalt = saltB64;
  return cachedKey;
}

export function lock() {
  cachedKey = null;
  cachedSalt = null;
}

export function isUnlocked() {
  return !!cachedKey;
}

export async function encryptString(plain) {
  if (!cachedKey) throw new Error("locked");
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cachedKey,
    enc.encode(plain),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptString(payload) {
  if (!cachedKey) throw new Error("locked");
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cachedKey, data);
  return new TextDecoder().decode(plain);
}

export async function verifyPassword(password, saltB64, sampleCiphertext) {
  try {
    await unlock(password, saltB64);
    if (sampleCiphertext) await decryptString(sampleCiphertext);
    return true;
  } catch {
    lock();
    return false;
  }
}
