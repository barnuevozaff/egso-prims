/**
 * Staff accounts (29 Oct 2026).
 *
 * Every account in Firebase Authentication is an Administrator. Accounts are
 * created only in the Firebase console (Authentication → Users → Add user):
 * the project has sign-up disabled (Authentication → Settings → User actions,
 * "Enable create (sign-up)" off), so no browser, SDK or API call can make
 * one, and holding an account is the authorisation. There are no other
 * roles, no custom claims to set and no list of addresses to keep up;
 * disabling or deleting the account in the console takes the access away
 * (callerOf checks it on every call).
 *
 * Only an email-and-password sign-in counts. firestore.rules, storage.rules
 * and the app (src/features/auth/firebase-driver.ts) apply the same test.
 */

/** The roles the permission table knows. Every account holds the first. */
export const ROLES = ["Administrator", "Department User", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

/** A signed-in email-and-password session, judged from its ID token. */
export function isAccountToken(
  token: { email?: unknown; firebase?: { sign_in_provider?: unknown } } | undefined,
): boolean {
  return (
    token?.firebase?.sign_in_provider === "password" && typeof token.email === "string" && token.email.trim() !== ""
  );
}
