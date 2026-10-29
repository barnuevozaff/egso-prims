import {
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { requireFirebase, sessionPersistence } from "@/lib/firebase";
import type { AuthUser } from "@/features/auth/types";

/**
 * Firebase Authentication for the auth provider, used when
 * VITE_DATA_BACKEND=firebase. Loaded on demand, so the Supabase build never
 * downloads it.
 *
 * Every account in Firebase Authentication is an Administrator (29 Oct
 * 2026): accounts are created only in the Firebase console, with sign-up
 * disabled, so signing in with one is the authorisation
 * (functions/src/accounts.ts). Only an email-and-password sign-in counts, as
 * in firestore.rules; anything else is not let in, since the rules would
 * refuse it everything and a screen full of permission errors explains
 * nothing.
 */

export class NoRoleError extends Error {
  constructor() {
    super("no role");
  }
}

async function toAuthUser(user: User): Promise<AuthUser> {
  const { signInProvider } = await user.getIdTokenResult();
  if (signInProvider !== "password" || !user.email) throw new NoRoleError();
  return {
    id: user.uid,
    email: user.email,
    name: user.displayName || user.email,
    role: "Administrator",
    office: "General Services Office",
    approver: false,
  };
}

/** Firebase's error codes, in the provider's vocabulary (see friendlyAuthError). */
export function firebaseAuthMessage(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? "");
  if (error instanceof NoRoleError) {
    return "This account cannot sign in here. Ask the General Services Office administrator.";
  }
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      // One message for all of these, so the form does not reveal which
      // addresses have accounts.
      return "Incorrect email or password.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact the system administrator.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Unable to reach the authentication service. Check your connection and try again.";
    default:
      return "Sign-in failed. Please try again, or contact the system administrator.";
  }
}

export const firebaseDriver = {
  /**
   * Calls back with the signed-in user (or null) now and whenever it
   * changes — sign-in, sign-out, or a session that ended (an account
   * disabled or deleted in the console cannot renew it). Returns the
   * unsubscribe.
   */
  watch(onUser: (user: AuthUser | null, error?: unknown) => void): () => void {
    const { auth } = requireFirebase();
    return onIdTokenChanged(auth, (u) => {
      if (!u) return onUser(null);
      toAuthUser(u).then(
        (authUser) => onUser(authUser),
        (e) => {
          void firebaseSignOut(auth);
          onUser(null, e);
        },
      );
    });
  },

  async signIn(email: string, password: string, remember: boolean): Promise<AuthUser> {
    const { auth } = requireFirebase();
    await setPersistence(auth, sessionPersistence(remember));
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
    try {
      return await toAuthUser(user);
    } catch (e) {
      await firebaseSignOut(auth);
      throw e;
    }
  },

  async signOut(): Promise<void> {
    await firebaseSignOut(requireFirebase().auth);
  },

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(requireFirebase().auth, email.trim(), {
        url: `${window.location.origin}/login`,
      });
    } catch (e) {
      // Same answer whether or not the address has an account.
      if ((e as { code?: string }).code === "auth/user-not-found") return;
      throw e;
    }
  },
};
