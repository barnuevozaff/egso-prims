import {
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { requireFirebase, sessionPersistence } from "@/lib/firebase";
import { ROLES, type AuthUser, type Role } from "@/features/auth/types";

/**
 * Firebase Authentication for the auth provider, used when
 * VITE_DATA_BACKEND=firebase. Loaded on demand, so the Supabase build never
 * downloads it.
 *
 * Who someone is comes from the ID token's custom claims (`role`,
 * `approver`, `office`), which only the Admin SDK can set (setStaffRole). An
 * account without a valid role is not let in: firestore.rules would refuse
 * it everything anyway, and a screen full of permission errors explains
 * nothing.
 */

export class NoRoleError extends Error {
  constructor() {
    super("no role");
  }
}

async function toAuthUser(user: User): Promise<AuthUser> {
  const { claims } = await user.getIdTokenResult();
  const role = claims.role;
  if (typeof role !== "string" || !(ROLES as string[]).includes(role)) throw new NoRoleError();
  return {
    id: user.uid,
    email: user.email ?? "",
    name: user.displayName || user.email || "Staff",
    role: role as Role,
    office: typeof claims.office === "string" ? claims.office : "General Services Office",
    approver: claims.approver === true,
  };
}

/** Firebase's error codes, in the provider's vocabulary (see friendlyAuthError). */
export function firebaseAuthMessage(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? "");
  if (error instanceof NoRoleError) {
    return "This account has not been given access yet. Ask the General Services Office administrator.";
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
   * changes — sign-in, sign-out, a role change (setStaffRole revokes the old
   * session), or an expired session. Returns the unsubscribe.
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
