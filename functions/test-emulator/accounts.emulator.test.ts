import { getAuth } from "firebase-admin/auth";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, signIn } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Accounts (29 Oct 2026): an account added in the Firebase console, with no
 * claims at all, is an Administrator; disabling, deleting or revoking it
 * takes that away at once, even from a session that is still open.
 * Synthetic accounts; demo project only.
 */

const register = (requestId: string) => ({
  requestId,
  source: "manual",
  rows: [{ name: "Correction Tape", category: "Office Supplies", unit: "pc", quantity: 5, unitPrice: 25 }],
});

/** As Authentication → Users → Add user leaves it: email and password, nothing else. */
async function consoleAccount(email = "clerk@gmail.com") {
  const { uid } = await getAuth().createUser({ email, password: "test-password-1" });
  return { uid, token: await signIn(email) };
}

beforeAll(() => {
  connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
});

describe("console-created accounts", () => {
  it("is an Administrator with no claims and no office address", async () => {
    const { token } = await consoleAccount();
    const res = await call("createInventoryItems", register("acct-test-0001"), token);
    expect(res.error).toBeUndefined();
    expect((res.result as { results: { ok: boolean }[] }).results[0].ok).toBe(true);
  });

  it("loses access at once when disabled, even with a session still open", async () => {
    const { uid, token } = await consoleAccount();
    await getAuth().updateUser(uid, { disabled: true });
    const res = await call("createInventoryItems", register("acct-test-0002"), token);
    expect(res.error?.status).toBe("PERMISSION_DENIED");
    expect(res.error?.message).toMatch(/disabled or removed/);
  });

  it("loses access at once when deleted", async () => {
    const { uid, token } = await consoleAccount();
    await getAuth().deleteUser(uid);
    const res = await call("createInventoryItems", register("acct-test-0003"), token);
    expect(res.error?.status).toBe("PERMISSION_DENIED");
  });

  it("an open session ends when its sessions are revoked", async () => {
    const { uid, token } = await consoleAccount();
    // Revocation is recorded to the second; the session must predate it.
    await new Promise((r) => setTimeout(r, 1100));
    await getAuth().revokeRefreshTokens(uid);
    const res = await call("createInventoryItems", register("acct-test-0004"), token);
    expect(res.error?.status).toBe("UNAUTHENTICATED");
  });

  it("an anonymous session is never staff", async () => {
    const anon = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    const { idToken } = (await anon.json()) as { idToken: string };
    const res = await call("createInventoryItems", register("acct-test-0005"), idToken);
    expect(res.error?.status).toBe("PERMISSION_DENIED");
  });

  it("the public portal still works signed out", async () => {
    const res = await call("portalStockSuggestions", { query: "" });
    expect(res.error).toBeUndefined();
    expect(Array.isArray(res.result)).toBe(true);
  });
});
