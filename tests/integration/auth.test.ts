import { signInAnonymously, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { beforeEach, describe, expect, it } from "vitest";

import { requireFirebase } from "@/lib/firebase";
import { firebaseAuthMessage, firebaseDriver } from "@/features/auth/firebase-driver";
import type { AuthUser } from "@/features/auth/types";

import { createAccount, createTeam, PROJECT_ID, resetEmulators } from "./setup";

/**
 * The Firebase sign-in driver behind the login page, against the Auth
 * emulator. "Remember me" (browser persistence) needs a real browser and is
 * covered by the browser tests.
 */

/** Signs in with the SDK and reports what the driver's session watcher sees. */
async function watchedSignIn(email: string): Promise<{ user: AuthUser | null; error?: unknown }> {
  const { auth } = requireFirebase();
  await signOut(auth);
  return new Promise((resolve, reject) => {
    // The watcher first reports whatever state it finds, at a time of its
    // choosing; the answer to this sign-in is the report for this account,
    // or an error.
    const stop = firebaseDriver.watch((user, error) => {
      if (!error && user?.email !== email) return;
      stop();
      resolve({ user, error });
    });
    signInWithEmailAndPassword(auth, email, "test-password-1").catch(reject);
  });
}

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("Firebase sign-in", () => {
  it("lets in any account added in the console as an Administrator, with no claims (29 Oct 2026)", async () => {
    await createAccount("newhire@gmail.com");
    const { user } = await watchedSignIn("newhire@gmail.com");
    expect(user).toMatchObject({
      email: "newhire@gmail.com",
      role: "Administrator",
      approver: false,
      office: "General Services Office",
    });
  });

  it("does not let in an anonymous session, and signs it out", async () => {
    const { auth } = requireFirebase();
    await signOut(auth);
    const error = await new Promise<unknown>((resolve, reject) => {
      const stop = firebaseDriver.watch((_user, e) => {
        if (!e) return;
        stop();
        resolve(e);
      });
      signInAnonymously(auth).catch(reject);
    });
    expect(firebaseAuthMessage(error)).toMatch(/cannot sign in here/);
    await new Promise((r) => setTimeout(r, 200));
    expect(auth.currentUser).toBeNull();
  });

  it("gives one answer for a wrong password and an unknown address", async () => {
    const { auth } = requireFirebase();
    const wrongPassword = await signInWithEmailAndPassword(auth, "admin@alaminos.gov.ph", "nope").catch((e) => e);
    const noAccount = await signInWithEmailAndPassword(auth, "nobody@alaminos.gov.ph", "nope").catch((e) => e);
    expect(firebaseAuthMessage(wrongPassword)).toBe("Incorrect email or password.");
    expect(firebaseAuthMessage(noAccount)).toBe("Incorrect email or password.");
  });

  it("sends a password reset link back to the login page", async () => {
    (globalThis as { window?: unknown }).window = { location: { origin: "http://localhost:5174" } };
    await firebaseDriver.requestPasswordReset("clerk@alaminos.gov.ph");
    // An unknown address gets the same quiet answer.
    await expect(firebaseDriver.requestPasswordReset("nobody@alaminos.gov.ph")).resolves.toBeUndefined();
    const codes = (await (
      await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`)
    ).json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] };
    const reset = codes.oobCodes.find((c) => c.email === "clerk@alaminos.gov.ph" && c.requestType === "PASSWORD_RESET");
    expect(reset?.oobLink).toContain(encodeURIComponent("http://localhost:5174/login"));
  });
});
