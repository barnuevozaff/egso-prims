import { getAuth } from "firebase-admin/auth";

import { PROJECT_ID } from "./setup.js";

/** Shared by the emulator tests: calling functions over HTTP, and test accounts. */

const REGION = "asia-southeast1";
export const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;
export const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;

export async function waitFor<T>(probe: () => Promise<T | undefined | false>, ms = 20000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await probe();
    if (v) return v;
    if (Date.now() > until) throw new Error("Timed out waiting for a Cloud Function to run.");
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function call(name: string, data: unknown, idToken?: string) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return (await res.json()) as { result?: Record<string, unknown>; error?: { status: string; message: string } };
}

/** Signs up through the Auth emulator the way the browser SDK does. */
export async function signUp(email: string, password = "test-password-1") {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return (await res.json()) as { localId?: string; idToken?: string; error?: { message: string } };
}

export async function signIn(email: string, password = "test-password-1") {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

/**
 * An account as Firebase console → Authentication → Add user leaves it: an
 * email and a password, no claims. Every account is an Administrator
 * (29 Oct 2026).
 */
export async function accountToken(email: string) {
  const user = await getAuth().createUser({ email, password: "test-password-1" });
  return { uid: user.uid, token: await signIn(email) };
}
