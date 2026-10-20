import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { beforeEach, describe, expect, it } from "vitest";

import { requireFirebase } from "@/lib/firebase";
import { firebaseAuthMessage, firebaseDriver } from "@/features/auth/firebase-driver";
import type { AuthUser } from "@/features/auth/types";

import { createStaff, createTeam, PROJECT_ID, resetEmulators } from "./setup";

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
  it("reads the role and approver flag from the server-set claims", async () => {
    const { user } = await watchedSignIn("approver@alaminos.gov.ph");
    expect(user).toMatchObject({
      email: "approver@alaminos.gov.ph",
      role: "Department User",
      approver: true,
      office: "General Services Office",
    });
    const admin = await watchedSignIn("admin@alaminos.gov.ph");
    expect(admin.user).toMatchObject({ role: "Administrator", approver: false });
  });

  it("does not let in an account that has no role, and signs it out", async () => {
    await createStaff("newhire@alaminos.gov.ph", "");
    const { user, error } = await watchedSignIn("newhire@alaminos.gov.ph");
    expect(user).toBeNull();
    expect(firebaseAuthMessage(error)).toMatch(/not been given access yet/);
    await new Promise((r) => setTimeout(r, 200));
    expect(requireFirebase().auth.currentUser).toBeNull();
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
    await firebaseDriver.requestPasswordReset("dept@alaminos.gov.ph");
    // An unknown address gets the same quiet answer.
    await expect(firebaseDriver.requestPasswordReset("nobody@alaminos.gov.ph")).resolves.toBeUndefined();
    const codes = (await (
      await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`)
    ).json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] };
    const reset = codes.oobCodes.find((c) => c.email === "dept@alaminos.gov.ph" && c.requestType === "PASSWORD_RESET");
    expect(reset?.oobLink).toContain(encodeURIComponent("http://localhost:5174/login"));
  });
});
