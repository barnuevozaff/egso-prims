import * as React from "react";
import type { Session } from "@supabase/supabase-js";

import { toast } from "@/components";
import { dataBackend } from "@/lib/data-backend";
import { isSupabaseConfigured, REMEMBER_KEY, supabase } from "@/lib/supabase";
import type { AuthUser, Role } from "@/features/auth/types";

/**
 * Authentication provider. With VITE_DATA_BACKEND=firebase it uses Firebase
 * Authentication (features/auth/firebase-driver.ts, loaded on demand);
 * otherwise Supabase Auth (session restore, auto refresh, auth-state events).
 * When neither is configured, a development driver with the same interface
 * and the same session semantics takes over so the app remains fully
 * testable.
 */

const useFirebaseAuth = dataBackend === "firebase";
const loadFirebaseDriver = () => import("@/features/auth/firebase-driver");

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface SignInResult {
  error?: string;
  /**
   * The user that was signed in. Both branches below already build it; it is
   * returned so the caller can greet the person by name without waiting for
   * the context state it just set to propagate.
   */
  user?: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /**
   * True when a real authentication service is active — Supabase Auth with
   * its env configured, or Firebase Authentication — rather than the
   * development driver.
   */
  supabaseActive: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<SignInResult>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/* ---------------- error mapping ---------------- */

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) return "Incorrect email or password.";
  if (msg.includes("user not found") || msg.includes("no user"))
    return "No account exists for that email address.";
  if (msg.includes("email not confirmed"))
    return "This account's email has not been confirmed yet. Contact the system administrator.";
  if (msg.includes("too many requests") || msg.includes("rate limit"))
    return "Too many sign-in attempts. Please wait a moment and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Unable to reach the authentication service. Check your connection and try again.";
  return "Sign-in failed. Please try again, or contact the system administrator.";
}

/* ---------------- development driver ---------------- */

const DEV_SESSION_KEY = "gso-prims-dev-session";

const DEV_ACCOUNT = {
  email: "admin@alaminos.gov.ph",
  password: "GSOprims!2026",
  user: {
    id: "dev-admin",
    email: "admin@alaminos.gov.ph",
    name: "Administrator",
    role: "Administrator" as Role,
    office: "General Services Office",
  } satisfies AuthUser,
};

const devDriver = {
  restore(): AuthUser | null {
    const raw =
      localStorage.getItem(DEV_SESSION_KEY) ?? sessionStorage.getItem(DEV_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
  async signIn(email: string, password: string, remember: boolean): Promise<AuthUser> {
    await new Promise((r) => setTimeout(r, 550));
    if (email.trim().toLowerCase() !== DEV_ACCOUNT.email) {
      throw new Error("user not found");
    }
    if (password !== DEV_ACCOUNT.password) {
      throw new Error("invalid login credentials");
    }
    const store = remember ? localStorage : sessionStorage;
    store.setItem(DEV_SESSION_KEY, JSON.stringify(DEV_ACCOUNT.user));
    return DEV_ACCOUNT.user;
  },
  signOut() {
    localStorage.removeItem(DEV_SESSION_KEY);
    sessionStorage.removeItem(DEV_SESSION_KEY);
  },
};

/** Demo credentials surfaced on the login page while no project is configured. */
export const DEV_CREDENTIALS = { email: DEV_ACCOUNT.email, password: DEV_ACCOUNT.password };

/* ---------------- supabase mapping ---------------- */

function userFromSession(session: Session): AuthUser {
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: (meta.full_name as string) ?? (meta.name as string) ?? "Administrator",
    role: ((meta.role as Role) ?? "Administrator") as Role,
    office: (meta.office as string) ?? "General Services Office",
  };
}

/* ---------------- provider ---------------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const manualSignOut = React.useRef(false);
  // While the form is signing in, it shows its own error; the session watcher
  // must not repeat it as a toast.
  const signingIn = React.useRef(false);

  // Session restore on boot.
  React.useEffect(() => {
    if (useFirebaseAuth) {
      let unsubscribe: (() => void) | undefined;
      let cancelled = false;
      let signedIn = false;
      loadFirebaseDriver()
        .then(({ firebaseDriver, firebaseAuthMessage }) => {
          if (cancelled) return;
          unsubscribe = firebaseDriver.watch((authUser, error) => {
            if (authUser) {
              signedIn = true;
              setUser(authUser);
              setStatus("authenticated");
              return;
            }
            const wasManual = manualSignOut.current;
            manualSignOut.current = false;
            setUser(null);
            setStatus("unauthenticated");
            if (error && !signingIn.current) toast.error(firebaseAuthMessage(error));
            else if (!error && signedIn && !wasManual) {
              toast.error("Your session has expired. Please sign in again.");
            }
            signedIn = false;
          });
        })
        .catch(() => {
          setStatus("unauthenticated");
          toast.error("Could not start sign-in. Check your connection and reload the page.");
        });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    }
    if (supabase) {
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (data.session) {
            setUser(userFromSession(data.session));
            setStatus("authenticated");
          } else {
            setStatus("unauthenticated");
          }
        })
        .catch(() => {
          /*
           * The restore can fail outright rather than come back empty: a
           * Supabase project that has been idle for a week is paused and its
           * hostname stops resolving. Without this the status never left
           * "loading", and the application hung on "Restoring session…" for
           * ever with nothing written and nothing in the console — the one
           * failure that looks identical to a slow connection.
           *
           * Treating it as no session puts the person on the sign-in screen,
           * where the toast explains why signing in will not work yet.
           */
          setStatus("unauthenticated");
          toast.error(
            "Could not reach the server to restore your session. Check your connection and try again.",
          );
        });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          setUser(userFromSession(session));
          setStatus("authenticated");
        } else if (event === "SIGNED_OUT") {
          const wasManual = manualSignOut.current;
          manualSignOut.current = false;
          setUser(null);
          setStatus("unauthenticated");
          if (!wasManual) {
            toast.error("Your session has expired. Please sign in again.");
          }
        }
      });
      return () => sub.subscription.unsubscribe();
    }
    // Development driver restore (small delay mimics the async boot).
    const t = setTimeout(() => {
      const restored = devDriver.restore();
      setUser(restored);
      setStatus(restored ? "authenticated" : "unauthenticated");
    }, 250);
    return () => clearTimeout(t);
  }, []);

  const signIn = React.useCallback(
    async (email: string, password: string, remember: boolean): Promise<SignInResult> => {
      if (useFirebaseAuth) {
        const { firebaseDriver, firebaseAuthMessage } = await loadFirebaseDriver();
        signingIn.current = true;
        try {
          const signedIn = await firebaseDriver.signIn(email, password, remember);
          setUser(signedIn);
          setStatus("authenticated");
          return { user: signedIn };
        } catch (e) {
          return { error: firebaseAuthMessage(e) };
        } finally {
          signingIn.current = false;
        }
      }
      try {
        if (supabase) {
          localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) return { error: friendlyAuthError(error.message) };
          if (data.session) {
            const signedIn = userFromSession(data.session);
            setUser(signedIn);
            setStatus("authenticated");
            return { user: signedIn };
          }
          return {};
        }
        const devUser = await devDriver.signIn(email, password, remember);
        setUser(devUser);
        setStatus("authenticated");
        return { user: devUser };
      } catch (e) {
        return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
      }
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    manualSignOut.current = true;
    if (useFirebaseAuth) {
      await (await loadFirebaseDriver()).firebaseDriver.signOut();
    } else if (supabase) {
      await supabase.auth.signOut();
    } else {
      devDriver.signOut();
    }
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const requestPasswordReset = React.useCallback(async (email: string): Promise<SignInResult> => {
    if (useFirebaseAuth) {
      const { firebaseDriver, firebaseAuthMessage } = await loadFirebaseDriver();
      try {
        await firebaseDriver.requestPasswordReset(email);
        return {};
      } catch (e) {
        return { error: firebaseAuthMessage(e) };
      }
    }
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      return error ? { error: friendlyAuthError(error.message) } : {};
    }
    await new Promise((r) => setTimeout(r, 450));
    return {};
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      supabaseActive: useFirebaseAuth || isSupabaseConfigured,
      signIn,
      signOut,
      requestPasswordReset,
    }),
    [user, status, signIn, signOut, requestPasswordReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
