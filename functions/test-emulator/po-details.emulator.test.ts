import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Completing and correcting a Purchase Order (21 Oct 2026): blanks are filled
 * in freely; changing what is recorded is kept with its before and after
 * values, without a reason since 30 Oct 2026; the authorization is never
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
      { field: "Bond paper, A4 stock/property no.", from: "", to: "SP-1", kind: "completed" },
    ]);
  });

  it("changes recorded values and the items without a reason, lists each change, and keeps the authorization", async () => {
    await order({ supplier_name: "First Supplier" });
    // No reason asked for since 30 Oct 2026.
    const added = { id: "", description: "Ballpen, black", quantity: 2, unit: "box", unitCost: 120, stockNo: null };
    const ok = await save({ supplierName: "Second Supplier", items: [{ ...item, quantity: 12 }, added] });
    expect(ok.error).toBeUndefined();
    const po = await read();
    expect(po.supplier_name).toBe("Second Supplier");
    expect(po.items[0]).toMatchObject({ id: "i1", quantity: 12 });
    expect(po.items[1].id).toBeTruthy();
    // As authorized, unchanged.
    expect(po.authorized_items).toEqual([item]);
    expect(po.approvals).toEqual([{ step: "Created" }, { step: "Approved", byUid: "someone" }]);
    expect(po.history.at(-1)).toMatchObject({ kind: "correction", text: "Changed by Test Admin" });
    expect(po.history.at(-1).lines).toEqual([
      "Supplier: First Supplier → Second Supplier",
      "Bond paper, A4: quantity 10 → 12",
      "Added: Ballpen, black · 2 box at ₱120.00",
    ]);

    // Removing a line reads as that line removed, not as every later line changed.
    expect((await save({ supplierName: "Second Supplier", items: [po.items[1]] })).error).toBeUndefined();
    expect((await read()).history.at(-1).lines).toEqual(["Removed: Bond paper, A4 · 12 ream at ₱250.00"]);
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
