import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Completing and correcting a Purchase Order (21 Oct 2026): blanks are filled
 * in freely; changing what is recorded on an approved order needs a reason and
 * is kept with its before and after values; the authorization is never
 * touched. Synthetic data only.
 */

let db: Firestore;
let admin: string;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

const item = { id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 250, stockNo: null };

async function order(over: Record<string, unknown> = {}) {
  await db.doc("purchase_orders/PO-2026-000001").set({
    id: "PO-2026-000001", po_number: "PO-2026-000001", pr_number: "PR-2026-000001", status: "Approved",
    authorization: "pr-approval", supplier_name: "", supplier_address: null, payment_term: null,
    items: [item], authorized_items: [item],
    approvals: [{ step: "Created" }, { step: "Approved", byUid: "someone" }], history: [],
    ...over,
  });
}

const save = (details: Record<string, unknown>, reason?: string, token = admin) =>
  call("updatePurchaseOrderDetails", { id: "PO-2026-000001", details, reason, by: "Test Admin" }, token);
const read = async () => (await db.doc("purchase_orders/PO-2026-000001").get()).data()!;
const lines = (over: Record<string, unknown> = {}) => [{ ...item, ...over }];

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin } = await accountToken("admin@alaminos.gov.ph"));
});

describe("completing and correcting a purchase order", () => {
  it("fills in blanks without a reason, and records them as completed", async () => {
    await order();
    const res = await save({ supplierName: "Test Supplies Co.", paymentTerm: "Cash", items: lines({ stockNo: "SP-1" }) });
    expect(res.error).toBeUndefined();
    const po = await read();
    expect(po).toMatchObject({ supplier_name: "Test Supplies Co.", payment_term: "Cash", status: "Approved" });
    expect(po.items[0]).toMatchObject({ id: "i1", stockNo: "SP-1" });
    expect(po.history.at(-1)).toMatchObject({ kind: "update", by: "Test Admin" });
    expect(po.history.at(-1).changes).toEqual([
      { field: "Supplier", from: "", to: "Test Supplies Co.", kind: "completed" },
      { field: "Payment term", from: "", to: "Cash", kind: "completed" },
      { field: "Item 1 stock/property no.", from: "", to: "SP-1", kind: "completed" },
    ]);
  });

  it("needs a reason to change a recorded value or the items, and keeps the authorization", async () => {
    await order({ supplier_name: "First Supplier" });
    const refused = await save({ supplierName: "Second Supplier", items: lines() });
    expect(refused.error?.message).toMatch(/Give the reason for correcting PO-2026-000001 \(Supplier\)/);
    // Every field is sent each time: one left out would be read as cleared.
    expect((await save({ supplierName: "First Supplier", items: lines({ quantity: 12 }) })).error?.message).toMatch(/\(Item 1\)/);

    const ok = await save({ supplierName: "Second Supplier", items: lines({ quantity: 12 }) }, "Supplier withdrew; quantity per canvass");
    expect(ok.error).toBeUndefined();
    const po = await read();
    expect(po.supplier_name).toBe("Second Supplier");
    expect(po.items[0].quantity).toBe(12);
    // As authorized, unchanged.
    expect(po.authorized_items).toEqual([item]);
    expect(po.approvals).toEqual([{ step: "Created" }, { step: "Approved", byUid: "someone" }]);
    expect(po.history.at(-1)).toMatchObject({ kind: "correction", reason: "Supplier withdrew; quantity per canvass" });
    expect(po.history.at(-1).changes).toEqual([
      { field: "Supplier", from: "First Supplier", to: "Second Supplier", kind: "corrected" },
      { field: "Item 1", from: "10 ream Bond paper, A4 at 250", to: "12 ream Bond paper, A4 at 250", kind: "corrected" },
    ]);
  });

  it("keeps the items' essentials: every line needs a description, quantity, unit and cost", async () => {
    await order();
    expect((await save({ items: lines({ quantity: 0 }) }, "Reason given")).error?.message).toMatch(/more than 0/);
    expect((await save({ items: [] }, "Reason given")).error?.message).toMatch(/at least 1/);
  });

  it("is refused signed out, and not for a voided, issued or completed order", async () => {
    await order();
    // Signed out it is refused; every account is an Administrator (29 Oct 2026).
    const signedOut = await call("updatePurchaseOrderDetails", { id: "PO-2026-000001", details: { supplierName: "X" }, by: "x" });
    expect(signedOut.error?.message).toMatch(/permission to change purchase orders/);
    for (const over of [{ status: "Cancelled" }, { status: "Completed" }, { issued_at: "2026-10-01" }]) {
      await order(over);
      expect((await save({ supplierName: "X" })).error?.status).toBe("FAILED_PRECONDITION");
    }
  });
});
