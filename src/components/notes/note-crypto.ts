"use client";

import type { Note, NoteLock, NoteVault } from "@/lib/types";

// =========================================================
// Locking a note.
//
// Real encryption, not a screen the UI puts in front of the words. The body
// stored in Postgres is AES-GCM ciphertext; the key is derived in this browser
// from what the reader types and is never written down, never sent anywhere,
// and never recoverable. Supabase holds a note it cannot read, and so do I.
//
// There is one password for everything. It is proved against a vault record on
// the profile — a fixed sentence encrypted under the derived key — so the
// password itself is stored nowhere, not even as a hash. Notes locked before
// the vault existed keep their own password and join the vault the next time
// they are opened; nothing is stranded and nothing is silently re-keyed.
//
// The security rests on four things, so they are stated rather than inferred:
//
//   1. The key comes from PBKDF2-SHA256 with a random salt. Iterations are
//      high enough to make guessing expensive, low enough to unlock without a
//      visible pause.
//   2. The IV is 12 fresh random bytes on *every* save. Under one shared vault
//      key this is no longer merely good practice — reusing an IV across two
//      notes under the same key breaks GCM outright — so it is never read from
//      an existing lock, only generated.
//   3. GCM authenticates as well as encrypts, so a wrong password throws
//      rather than quietly producing garbage.
//   4. Nothing derived from the password is persisted. A reload asks again.
//
// There is deliberately no recovery. A forgotten password is a lost note.
// =========================================================

const ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** What the vault encrypts to prove a password. Its content is not a secret. */
const CHECK_PHRASE = "humoyun.notes.vault.v2";

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

// A buffer over exactly these bytes, which is what WebCrypto wants and what a
// view into a larger buffer would not give it.
const view = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

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

async function seal(plaintext: string, key: CryptoKey): Promise<{ body: string; iv: string }> {
  const iv = randomBytes(IV_BYTES);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: view(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { body: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) };
}

export class WrongPassword extends Error {
  constructor() { super("That is not the password."); }
}

async function open(body: string, iv: string, key: CryptoKey): Promise<string> {
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: view(fromBase64(iv)) },
      key,
      view(fromBase64(body)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPassword();
  }
}

// ---------------------------------------------------------
// The vault
// ---------------------------------------------------------

/** Create the one password. Called once, the first time a note is locked. */
export async function createVault(password: string, hint?: string | null): Promise<NoteVault> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  const { body, iv } = await seal(CHECK_PHRASE, key);
  return { v: 2, salt: toBase64(salt), iv, check: body, hint: hint?.trim() || null };
}

/** True when this is the vault password. Throws nothing; answers yes or no. */
export async function vaultAccepts(vault: NoteVault, password: string): Promise<boolean> {
  try {
    const key = await deriveKey(password, fromBase64(vault.salt));
    return (await open(vault.check, vault.iv, key)) === CHECK_PHRASE;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// Notes
// ---------------------------------------------------------

export interface Sealed {
  /** base64 ciphertext — what goes in the note's `body` */
  body: string;
  lock: NoteLock;
}

/**
 * Lock a note under the vault password.
 *
 * The IV is always fresh. With one key shared across every note, an IV taken
 * from an existing lock would be reused under that key, which is the single
 * mistake that takes GCM apart — so there is no code path here that can copy
 * one forward.
 */
export async function lockWithVault(
  plaintext: string, vault: NoteVault, password: string,
): Promise<Sealed> {
  const key = await deriveKey(password, fromBase64(vault.salt));
  const { body, iv } = await seal(plaintext, key);
  return { body, lock: { v: 2, iv } };
}

/** The salt a note's lock was built on: its own if v1, the vault's if v2. */
function saltFor(lock: NoteLock, vault: NoteVault | null): Uint8Array {
  if (lock.v === 2) {
    if (!vault) throw new Error("This note needs the vault password, which is not set up.");
    return fromBase64(vault.salt);
  }
  if (!lock.salt) throw new Error("This lock is missing its salt.");
  return fromBase64(lock.salt);
}

export async function unlockNote(
  note: Pick<Note, "body" | "lock">, password: string, vault: NoteVault | null,
): Promise<string> {
  if (!note.lock) return note.body;
  const key = await deriveKey(password, saltFor(note.lock, vault));
  return open(note.body, note.lock.iv, key);
}

/** True when this note predates the vault and still carries its own password. */
export const isLegacyLock = (note: Pick<Note, "lock">): boolean => note.lock?.v === 1;

export const isLocked = (note: Pick<Note, "lock">): boolean => note.lock != null;

// ---------------------------------------------------------
// What is unlocked right now
//
// Held in module-level memory rather than anywhere durable: a reload should
// ask again. Writing it to localStorage would hand the password to exactly the
// people the lock is for.
// ---------------------------------------------------------

let vaultPassword: string | null = null;
/** Only for notes still on their own password. The vault replaces this. */
const legacy = new Map<string, string>();
const listeners = new Set<() => void>();

function announce() { for (const fn of listeners) fn(); }

export function rememberVault(password: string) {
  vaultPassword = password;
  announce();
}

export function forgetVault() {
  vaultPassword = null;
  legacy.clear();
  announce();
}

export function vaultOpen(): boolean {
  return vaultPassword !== null;
}

export function currentVaultPassword(): string | null {
  return vaultPassword;
}

export function rememberLegacy(noteId: string, password: string) {
  legacy.set(noteId, password);
  announce();
}

/** The password that will open this note right now, or null if none is held. */
export function passwordFor(note: Pick<Note, "id" | "lock">): string | null {
  if (!note.lock) return null;
  if (note.lock.v === 2) return vaultPassword;
  return legacy.get(note.id) ?? null;
}

export function isOpen(note: Pick<Note, "id" | "lock">): boolean {
  return passwordFor(note) !== null;
}

/** Lets a component re-render when something is unlocked or locked again. */
export function subscribeToOpenNotes(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
