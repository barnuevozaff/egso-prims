import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Voiding a Purchase Request (21 Oct 2026): Administrators only, open
 * requests only, a reason required, and never while a purchase order or slip
 * raised from it is in force. Nothing is deleted. Synthetic data only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

async function pr(id: string, over: Record<string, unknown> = {}) {
  await db.doc(`purchase_requests/${id}`).set({
    id, pr_number: id, department_code: "GSO", requester: "Test Requester", purpose: "Office supplies (test)",
    funding_source: "General Fund", status: "Submitted", request_date: "2026-10-21",
    items: [{ id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
    approvals: [{ step: "Submitted", by: "Test Requester", at: "2026-10-21T00:00:00.000Z" }],
    history: [{ id: "h1", kind: "create", text: `${id} created`, at: "2026-10-21T00:00:00.000Z" }],
    created_at: "2026-10-21T00:00:00.000Z", updated_at: "2026-10-21T00:00:00.000Z",
    ...over,
  });
}

const voidIt = (id: string, token?: string, reason = "Duplicate of another request (test)") =>
  call("voidPurchaseRequest", { id, reason, by: "Test Admin", office: "General Services Office" }, token);

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin, uid: adminUid } = await accountToken("admin@alaminos.gov.ph"));
});

describe("voiding a Purchase Request", () => {
  it("closes it as Cancelled with the reason, who and when, and keeps everything else", async () => {
    await pr("PR-2026-000001", { status: "Approved", official_pr_number: "100-2026-000001" });
    const res = await voidIt("PR-2026-000001", admin);
    expect(res.error).toBeUndefined();
    const doc = (await db.doc("purchase_requests/PR-2026-000001").get()).data()!;
    expect(doc).toMatchObject({
      status: "Cancelled",
      pr_number: "PR-2026-000001",
      official_pr_number: "100-2026-000001",
      items: [{ description: "Bond paper, A4" }],
      updated_by_uid: adminUid,
    });
    expect(doc.approvals).toHaveLength(2);
    expect(doc.approvals[1]).toMatchObject({
      step: "Cancelled", by: "Test Admin", remarks: "Duplicate of another request (test)", byUid: adminUid,
    });
    expect(doc.approvals[1].at).toBeTruthy();
    expect(doc.history.map((h: { text: string }) => h.text)).toEqual([
      "PR-2026-000001 created",
      "Status → Cancelled: Duplicate of another request (test)",
    ]);
  });

  it("is refused signed out", async () => {
    await pr("PR-2026-000001");
    // Signed out it is refused; every account is an Administrator (29 Oct 2026).
    expect((await voidIt("PR-2026-000001")).error?.message).toMatch(/permission to void purchase requests/);
    expect((await db.doc("purchase_requests/PR-2026-000001").get()).get("status")).toBe("Submitted");
  });

  it("needs a reason, and leaves closed requests as they are", async () => {
    await pr("PR-2026-000001");
    expect((await voidIt("PR-2026-000001", admin, "   ")).error?.message).toMatch(/reason/i);
    for (const status of ["Completed", "Rejected", "Cancelled"]) {
      await pr("PR-2026-000002", { status });
      expect((await voidIt("PR-2026-000002", admin)).error?.message).toBe(`PR-2026-000002 is ${status} and cannot be voided.`);
    }
    expect((await voidIt("PR-2026-000404", admin)).error?.message).toMatch(/not found/);
  });

  it("refuses while a purchase order or slip raised from it is in force; a voided one does not block", async () => {
    await pr("PR-2026-000001", { status: "Approved" });
    await db.doc("purchase_orders/PO-2026-000001").set({ po_number: "PO-2026-000001", pr_number: "PR-2026-000001", status: "Approved" });
    await db.doc("ris_requests/RIS-2026-000001").set({ ris_number: "RIS-2026-000001", pr_number: "PR-2026-000001", status: "Pending Approval" });
    expect((await voidIt("PR-2026-000001", admin)).error?.message).toBe(
      "PR-2026-000001 cannot be voided while PO-2026-000001, RIS-2026-000001 are in force. Void them first.",
    );
    await db.doc("purchase_orders/PO-2026-000001").update({ status: "Cancelled" });
    await db.doc("ris_requests/RIS-2026-000001").update({ status: "Cancelled" });
    expect((await voidIt("PR-2026-000001", admin)).error).toBeUndefined();
    expect((await db.doc("purchase_requests/PR-2026-000001").get()).get("status")).toBe("Cancelled");
  });
});
