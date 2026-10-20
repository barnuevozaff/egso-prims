import { beforeEach, describe, expect, it } from "vitest";

import { countRecords } from "@/features/shared/record-counts";
import {
  acknowledgePurchaseOrder,
  addPurchaseOrderComment,
  createPurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrder,
  listPurchaseOrders,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  type PODraftInput,
} from "@/features/purchase-orders/api";

import { createTeam, manilaYear, resetEmulators, signInAs, signOutToPublic } from "./setup";

const input = (over: Partial<PODraftInput> = {}): PODraftInput => ({
  prNumber: "PR-2026-000001",
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper (test data)",
  supplierName: "Test Supplies Co.",
  deliveryAddress: "GSO, Municipal Hall",
  expectedDelivery: "Within 15 days",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 240 }],
  attachments: [],
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("Purchase Orders on Firestore", () => {
  it("only Administrators raise orders", async () => {
    await signInAs("dept@alaminos.gov.ph");
    await expect(createPurchaseOrder(input())).rejects.toThrow(/permission to raise purchase orders/);
    await signOutToPublic();
    await expect(createPurchaseOrder(input())).rejects.toThrow(/permission/);

    await signInAs("admin@alaminos.gov.ph");
    const po = await createPurchaseOrder(input());
    expect(po).toMatchObject({ poNumber: `PO-${manilaYear()}-000001`, status: "Pending Approval" });
    const draft = await createPurchaseOrder(input(), { asDraft: true });
    expect(draft.status).toBe("Draft");
    expect(await countRecords("purchase_orders", ["Pending Approval"])).toBe(1);
  });

  it("lists and filters by supplier and search", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const a = await createPurchaseOrder(input({ supplierName: "Alpha Trading" }));
    await createPurchaseOrder(input({ supplierName: "Beta Supply", purpose: "Printer toner" }));
    expect((await listPurchaseOrders({ supplierName: "Alpha Trading" })).map((p) => p.id)).toEqual([a.id]);
    expect((await listPurchaseOrders({ search: "toner" }))[0].supplierName).toBe("Beta Supply");
    expect(await listPurchaseOrders()).toHaveLength(2);
  });

  it("issues once, then records the supplier's acknowledgement once", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const po = await createPurchaseOrder(input());
    await expect(acknowledgePurchaseOrder(po.id)).rejects.toThrow(/must be issued first/);
    const issued = await issuePurchaseOrder(po.id, { by: "GSO Head" });
    expect(issued.issuedBy).toBe("GSO Head");
    await expect(issuePurchaseOrder(po.id)).rejects.toThrow(/already been issued/);
    const acknowledged = await acknowledgePurchaseOrder(po.id);
    expect(acknowledged.acknowledgedBy).toBe("Test Supplies Co.");
    await expect(acknowledgePurchaseOrder(po.id)).rejects.toThrow(/already been acknowledged/);
  });

  it("updates, comments and changes status", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const po = await createPurchaseOrder(input());
    await updatePurchaseOrder(po.id, input({ supplierTin: " 123-456-789 " }));
    await addPurchaseOrderComment(po.id, { author: "Admin", office: "GSO", text: "Checked" });
    const approved = await setPurchaseOrderStatus(po.id, "Approved", { by: "Administrator" });
    expect(approved).toMatchObject({ status: "Approved", supplierTin: "123-456-789" });
    expect((await getPurchaseOrder(po.id))?.comments).toHaveLength(1);
  });

  it("the public can open an order by number (Track page)", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const po = await createPurchaseOrder(input());
    await signOutToPublic();
    expect((await getPurchaseOrder(po.id))?.poNumber).toBe(po.poNumber);
  });
});
