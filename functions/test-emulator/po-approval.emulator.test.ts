import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Approving a Purchase Order (21 Oct 2026): Administrators only, from Pending
 * Approval only, against a still-approved request, with the approving
 * signatory set in Settings; the signatories and the PO date are copied on
 * once. Synthetic data only.
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

const setting = (key: string, value: string) =>
  db.doc(`system_configuration/cfg-po-signatories-${key.replace(/_/g, "-")}`).set({ category: "PO Signatories", key, value });

async function pr(status = "Approved") {
  await db.doc("purchase_requests/PR-2026-000001").set({
    id: "PR-2026-000001", pr_number: "PR-2026-000001", department_code: "GSO", requester: "Test Requester",
    purpose: "Office supplies (test)", status, items: [],
  });
}

async function order(id: string, over: Record<string, unknown> = {}) {
  await db.doc(`purchase_orders/${id}`).set({
    id, po_number: id, pr_number: "PR-2026-000001", department_code: "GSO", requester: "Test Requester",
    purpose: "Office supplies (test)", supplier_name: "Test Supplies Co.", delivery_address: "Municipality of Alaminos, Laguna",
    status: "Pending Approval", issued_date: "2026-10-21",
    items: [{ id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 240 }],
    approvals: [{ step: "Created", by: "Administrator" }], history: [],
    created_at: "2026-10-21T00:00:00.000Z", updated_at: "2026-10-21T00:00:00.000Z",
    ...over,
  });
}

const approve = (id: string, token?: string) => call("approvePurchaseOrder", { id, by: "Test Admin" }, token);

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin, uid: adminUid } = await accountToken("admin@alaminos.gov.ph"));
  await pr();
});

describe("approving a Purchase Order", () => {
  it("copies the signatories, dates the order, and signs the step", async () => {
    await setting("po_approving_name", "TEST MAYOR");
    await order("PO-2026-000001");
    const res = await approve("PO-2026-000001", admin);
    expect(res.error).toBeUndefined();
    const doc = (await db.doc("purchase_orders/PO-2026-000001").get()).data()!;
    expect(doc).toMatchObject({
      status: "Approved",
      approved_by: "Test Admin",
      approved_by_uid: adminUid,
      signatories: { approved_by: { name: "TEST MAYOR", designation: "Municipal Mayor" }, bac_secretary: null },
    });
    expect(doc.po_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.approvals.at(-1)).toMatchObject({ step: "Approved", by: "Test Admin", byUid: adminUid });
  });

  it("is refused signed out", async () => {
    await setting("po_approving_name", "TEST MAYOR");
    await order("PO-2026-000001");
    // Signed out it is refused; every account is an Administrator (29 Oct 2026).
    expect((await approve("PO-2026-000001")).error?.message).toMatch(/permission to approve purchase orders/);
    expect((await db.doc("purchase_orders/PO-2026-000001").get()).get("status")).toBe("Pending Approval");
  });

  it("refuses without the signatory, from a Draft, or against a voided request — and names why", async () => {
    await order("PO-2026-000001");
    expect((await approve("PO-2026-000001", admin)).error?.message).toBe(
      "Set the approving signatory in Settings → Purchase Order signatories before approving PO-2026-000001.",
    );
    await setting("po_approving_name", "TEST MAYOR");
    await order("PO-2026-000002", { status: "Draft" });
    expect((await approve("PO-2026-000002", admin)).error?.message).toBe(
      "Only an order pending approval can be approved; PO-2026-000002 is Draft.",
    );
    await order("PO-2026-000003", { supplier_name: "" });
    expect((await approve("PO-2026-000003", admin)).error?.message).toBe("Add the supplier to PO-2026-000003 before approving it.");
    await pr("Cancelled");
    expect((await approve("PO-2026-000001", admin)).error?.message).toMatch(/PR-2026-000001 is Cancelled/);
  });

  it("keeps the first signatory copy and date when an order is approved again", async () => {
    await setting("po_approving_name", "TEST MAYOR");
    await order("PO-2026-000001", {
      signatories: { approved_by: { name: "EARLIER MAYOR", designation: "Municipal Mayor" }, bac_secretary: null },
      po_date: "2026-10-01",
    });
    await approve("PO-2026-000001", admin);
    const doc = (await db.doc("purchase_orders/PO-2026-000001").get()).data()!;
    expect(doc.signatories.approved_by.name).toBe("EARLIER MAYOR");
    expect(doc.po_date).toBe("2026-10-01");
  });
});
