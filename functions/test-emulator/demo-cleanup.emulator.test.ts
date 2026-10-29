import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Deleting synthetic purchase requests from the local demo (21 Oct 2026):
 * Administrators only, never a request a purchase order or slip was raised
 * from, and numbering untouched. Synthetic data only.
 */

let db: Firestore;
let admin: string;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

async function pr(id: string, status = "Submitted") {
  await db.doc(`purchase_requests/${id}`).set({
    id, pr_number: id, department_code: "GSO", requester: "Test Requester", purpose: "Office supplies (test)",
    status, request_date: "2026-10-21", items: [], approvals: [], history: [],
    created_at: "2026-10-21T00:00:00.000Z", updated_at: "2026-10-21T00:00:00.000Z",
  });
}

const exists = async (id: string) => (await db.doc(`purchase_requests/${id}`).get()).exists;

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin } = await accountToken("admin@alaminos.gov.ph"));
});

describe("deleting demo purchase requests", () => {
  it("deletes the chosen test records, in any status, and nothing else; numbering is untouched", async () => {
    await pr("PR-2026-000001");
    await pr("PR-2026-000002", "Cancelled");
    await pr("PR-2026-000003", "Approved");
    await db.doc("document_counters/PR-2026").set({ current_sequence: 3 });
    await db.doc("unique_keys/purchase_requests.pr_number:PR-2026-000001").set({ doc_id: "PR-2026-000001" });

    const res = await call("deleteDemoPurchaseRequests", { ids: ["PR-2026-000001", "PR-2026-000002"] }, admin);
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual({ deleted: ["PR-2026-000001", "PR-2026-000002"], refused: [] });
    expect(await exists("PR-2026-000001")).toBe(false);
    expect(await exists("PR-2026-000002")).toBe(false);
    expect(await exists("PR-2026-000003")).toBe(true);
    expect((await db.doc("document_counters/PR-2026").get()).get("current_sequence")).toBe(3);
    expect((await db.doc("unique_keys/purchase_requests.pr_number:PR-2026-000001").get()).exists).toBe(true);
  });

  it("keeps a request a purchase order or slip was raised from, whatever that document's status", async () => {
    await pr("PR-2026-000001", "Approved");
    await pr("PR-2026-000002", "Approved");
    await pr("PR-2026-000003");
    await db.doc("purchase_orders/PO-2026-000001").set({ po_number: "PO-2026-000001", pr_number: "PR-2026-000001", status: "Cancelled" });
    await db.doc("ris_requests/RIS-2026-000001").set({ ris_number: "RIS-2026-000001", pr_number: "PR-2026-000002", status: "Released" });

    const res = await call(
      "deleteDemoPurchaseRequests",
      { ids: ["PR-2026-000001", "PR-2026-000002", "PR-2026-000003", "PR-2026-000404"] },
      admin,
    );
    expect(res.result).toEqual({
      deleted: ["PR-2026-000003"],
      refused: [
        { id: "PR-2026-000001", reason: "PR-2026-000001 is kept: PO-2026-000001 was raised from it." },
        { id: "PR-2026-000002", reason: "PR-2026-000002 is kept: RIS-2026-000001 was raised from it." },
        { id: "PR-2026-000404", reason: "PR-2026-000404 no longer exists." },
      ],
    });
    expect(await exists("PR-2026-000001")).toBe(true);
    expect(await exists("PR-2026-000002")).toBe(true);
  });

  it("is refused signed out, and takes 1 to 100 requests", async () => {
    await pr("PR-2026-000001");
    // Signed out it is refused; every account is an Administrator (29 Oct 2026).
    const res = await call("deleteDemoPurchaseRequests", { ids: ["PR-2026-000001"] });
    expect(res.error?.message).toMatch(/permission to delete demo purchase requests/);
    expect(await exists("PR-2026-000001")).toBe(true);
    expect((await call("deleteDemoPurchaseRequests", { ids: [] }, admin)).error?.message).toMatch(/between 1 and 100/);
  });
});
