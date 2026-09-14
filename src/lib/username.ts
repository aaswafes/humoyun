// =========================================================
// Usernames.
//
// Supabase Auth only knows how to identify a person by email or phone, but
// this app now asks for a username and a password and nothing else. An
// account must not depend on a confirmation email arriving — on the free tier
// that mail is throttled to a couple an hour and only to addresses the project
// already knows, which is exactly why a new person could sign up and then
// never get in.
//
// So a username is stored as an address inside a domain that exists only for
// this purpose. Nothing is ever sent to it; it is an identifier, not an inbox.
// Accounts made before this change still have real addresses, which is why
// `credentialToEmail` passes anything containing "@" straight through and
// `accountLabel` hides the synthetic half from every screen that shows it.
// =========================================================

export const USERNAME_DOMAIN = "users.qalamchi.app";

const SUFFIX = `@${USERNAME_DOMAIN}`;

// Starts and ends on a letter or a digit so a name cannot be typed as ".bob"
// or "bob." and then be impossible to say out loud.
const SHAPE = /^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/;

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

/** Null when the name is usable, otherwise the sentence to put under the field. */
export function usernameError(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < 3) return "Usernames are at least 3 characters.";
  if (name.length > 24) return "Usernames are at most 24 characters.";
  if (name.includes("@")) return "A username has no @ in it — just the name.";
  if (!SHAPE.test(name)) return "Letters, numbers, dots, dashes and underscores only.";
  return null;
}

export function emailForUsername(raw: string) {
  return `${normalizeUsername(raw)}${SUFFIX}`;
}

/** What the sign-in field holds — a username, or an email from an older account. */
export function credentialToEmail(raw: string) {
  const value = raw.trim();
  return value.includes("@") ? value.toLowerCase() : emailForUsername(value);
}

/** True when this account signs in with a username rather than an address. */
export function isUsernameAccount(email: string | null | undefined) {
  return !!email && email.endsWith(SUFFIX);
}

/** What to show a signed-in account. A synthetic address is never shown as one. */
export function accountLabel(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.endsWith(SUFFIX) ? email.slice(0, -SUFFIX.length) : email;
}
