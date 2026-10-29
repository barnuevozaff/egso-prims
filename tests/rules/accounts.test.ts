import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createEnv } from "./setup";

/**
 * Who counts as staff (29 Oct 2026): an account created in the Firebase
 * console, signed in with its email and password, is an Administrator with
 * no claims; nothing else is staff. Synthetic records only.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "inventory_items/inv-1"), {
      id: "inv-1", item_code: "INV-2026-000001", name: "Correction Tape", unit: "pc", on_hand: 5, unit_price: 25,
    });
    await setDoc(doc(db, "purchase_requests/PR-2026-000001"), {
      id: "PR-2026-000001", pr_number: "PR-2026-000001", status: "Submitted",
    });
  });
});

const session = (uid: string, token: Record<string, unknown>) => env.authenticatedContext(uid, token).firestore();

describe("every console-created account is an Administrator", () => {
  it("reads and changes the register with no claim and no office address", async () => {
    const db = session("u-console", { email: "egsoalaminos@gmail.com", firebase: { sign_in_provider: "password" } });
    await assertSucceeds(getDocs(collection(db, "inventory_items")));
    await assertSucceeds(getDocs(collection(db, "system_configuration")));
    await assertSucceeds(updateDoc(doc(db, "inventory_items/inv-1"), { name: "Correction tape", updated_by_uid: "u-console" }));
  });

  it("an anonymous, custom-token or email-less session is not staff, whatever its claims", async () => {
    const sessions = {
      anonymous: { firebase: { sign_in_provider: "anonymous" }, role: "Administrator" },
      customToken: { firebase: { sign_in_provider: "custom" }, email: "x@gmail.com", role: "Administrator" },
      noEmail: { firebase: { sign_in_provider: "password" } },
    };
    for (const [name, token] of Object.entries(sessions)) {
      const db = session(`u-${name}`, token);
      await assertFails(getDocs(collection(db, "inventory_items")));
      await assertFails(getDoc(doc(db, "inventory_items/inv-1")));
      await assertFails(updateDoc(doc(db, "inventory_items/inv-1"), { name: "x", updated_by_uid: `u-${name}` }));
    }
  });

  it("signed out: tracking one document still works, the register stays closed", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "purchase_requests/PR-2026-000001")));
    await assertFails(getDocs(collection(db, "purchase_requests")));
    await assertFails(getDoc(doc(db, "inventory_items/inv-1")));
    await assertFails(getDocs(collection(db, "system_configuration")));
  });
});
