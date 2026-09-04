"use client";

import type { Note, NoteLock } from "@/lib/types";

// =========================================================
// Locking a note.
//
// Real encryption, not a screen the UI puts in front of the words. The body
// stored in Postgres is AES-GCM ciphertext; the key is derived in this browser
// from what the reader types and is never written down, never sent anywhere,
// and never recoverable. Supabase holds a note it cannot read, and so do I.
//
// The whole security of it rests on three things, so they are stated here
// rather than left to be inferred from the code:
//
//   1. The key comes from PBKDF2-SHA256 over the password with a per-note
//      random salt. Iterations are high enough to make guessing expensive and
//      low enough to unlock without a visible pause.
//   2. The IV is 12 fresh random bytes on *every* save. Reusing an IV under
//      one key is the one mistake that breaks GCM outright.
//   3. GCM authenticates as well as encrypts, so a wrong password does not
//      quietly produce garbage — it throws, and that is how the prompt knows
//      to say no.
//
// There is deliberately no "recover", no hint that encodes the password and no
// second copy of the plaintext. A forgotten password is a lost note.
// =========================================================

const ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function subtle(): SubtleCrypto {
  const c = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (!c?.subtle) {
    // Only ever true on a page served over plain HTTP, or during SSR.
    throw new Error("Locking needs a secure context (https or localhost).");
  }
  return c.subtle;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ---------------------------------------------------------
// base64, without pulling in a dependency for it
// ---------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// A DataView over exactly the bytes, which is what WebCrypto wants and what a
// Uint8Array from a larger buffer would not give it.
const view = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// ---------------------------------------------------------
// Key derivation
// ---------------------------------------------------------

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt: view(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------
// Locking and unlocking
// ---------------------------------------------------------

export interface Locked {
  /** base64 ciphertext — what goes in the note's `body` */
  body: string;
  lock: NoteLock;
}

/** Encrypt a note body under a fresh salt and IV. */
export async function lockBody(
  plaintext: string, password: string, hint?: string | null,
): Promise<Locked> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: view(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    body: toBase64(new Uint8Array(cipher)),
    lock: { v: 1, salt: toBase64(salt), iv: toBase64(iv), hint: hint?.trim() || null },
  };
}

/** Re-encrypt an already-locked note after an edit, under a new IV. */
export async function relockBody(
  plaintext: string, password: string, lock: NoteLock,
): Promise<Locked> {
  const salt = fromBase64(lock.salt);
  const iv = randomBytes(IV_BYTES);          // never the old one
  const key = await deriveKey(password, salt);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: view(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { body: toBase64(new Uint8Array(cipher)), lock: { ...lock, iv: toBase64(iv) } };
}

export class WrongPassword extends Error {
  constructor() { super("That is not the password."); }
}

/**
 * Decrypt, or throw `WrongPassword`.
 *
 * GCM's tag check is what tells the two apart: a wrong key fails
 * authentication rather than returning plausible nonsense, so there is no
 * guessing about whether the result is really the note.
 */
export async function unlockBody(
  body: string, password: string, lock: NoteLock,
): Promise<string> {
  const key = await deriveKey(password, fromBase64(lock.salt));
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: view(fromBase64(lock.iv)) },
      key,
      view(fromBase64(body)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPassword();
  }
}

// ---------------------------------------------------------
// What is unlocked right now
//
// Held in a module-level map rather than anywhere durable: a reload should ask
// again. Writing it to localStorage would hand the password to exactly the
// people the lock is for.
// ---------------------------------------------------------

const openNotes = new Map<string, string>();
const listeners = new Set<() => void>();

function announce() { for (const fn of listeners) fn(); }

export function rememberPassword(noteId: string, password: string) {
  openNotes.set(noteId, password);
  announce();
}

export function forgetPassword(noteId: string) {
  openNotes.delete(noteId);
  announce();
}

export function forgetEverything() {
  openNotes.clear();
  announce();
}

export function passwordFor(noteId: string): string | null {
  return openNotes.get(noteId) ?? null;
}

export function isOpen(noteId: string): boolean {
  return openNotes.has(noteId);
}

/** Lets a component re-render when a note is unlocked or locked again. */
export function subscribeToOpenNotes(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const isLocked = (note: Pick<Note, "lock">): boolean => note.lock != null;
