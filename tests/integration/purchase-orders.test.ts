import { beforeEach, describe, expect, it } from "vitest";

import {
  acknowledgePurchaseOrder,
  addPurchaseOrderComment,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrder,
  listPurchaseOrders,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  updatePurchaseOrderDetails,
  type PODraftInput,
} from "@/features/purchase-orders/api";
import {
  createPurchaseRequest,
  ensurePurchaseOrderForPR,
  getPurchaseRequest,
  setPurchaseRequestStatus,
  type PRDraftInput,
} from "@/features/purchase-requests/api";

import {
  createTeam,
  manilaYear,
  resetEmulators,
  seedApprovedPR,
  seedDocument,
  seedPOSignatories,
  signInAs,
  signOutToPublic,
} from "./setup";

/**
 * Purchase orders since 21 Oct 2026: approving a request creates its order,
 * already authorized; the order's details are completed later, and changes to
 * what is recorded are corrections with a reason. Synthetic data only.
 */

const request = (over: Partial<PRDraftInput> = {}): PRDraftInput => ({
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper for Q4 reports (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-21",
  items: [
    { description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 },
    { description: "Ballpen, black", quantity: 3, unit: "box", estimatedCost: 120 },
  ],
  attachments: [],
  ...over,
});

/** A request filed on the portal and approved by the Administrator; returns it with its order. */
async function approved(over: Partial<PRDraftInput> = {}) {
  await signOutToPublic();
  const pr = await createPurchaseRequest(request(over));
  await signInAs("admin@alaminos.gov.ph");
  const done = await setPurchaseRequestStatus(pr.id, "Approved", { by: "Ana Reyes" });
  return { pr: done, po: (await getPurchaseOrder(done.poNumber!))! };
}

const details = (over: Record<string, unknown> = {}) => ({
  supplierName: "",
  supplierAddress: "",
  supplierTin: "",
  supplierContact: "",
  modeOfProcurement: "",
  deliveryAddress: "",
  expectedDelivery: "",
  deliveryTerm: "",
  paymentTerm: "",
  bacResolutionNo: "",
  bacResolutionSeries: "",
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("Purchase Orders on Firestore", () => {
  it("approving a request creates its order once, already authorized, from its items", async () => {
    await seedPOSignatories();
    const { pr, po } = await approved();
    expect(pr.poNumber).toBe(`PO-${manilaYear()}-000001`);
    expect(po).toMatchObject({
      poNumber: pr.poNumber,
      prNumber: pr.prNumber,
      prOfficialNumber: pr.officialPrNumber,
      status: "Approved",
      authorization: "pr-approval",
      supplierName: "",
      departmentCode: "GSO",
      purpose: "Bond paper for Q4 reports (test data)",
      signatories: { approvedBy: { name: "TEST MAYOR", designation: "Municipal Mayor" } },
      items: [
        expect.objectContaining({ description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 250 }),
        expect.objectContaining({ description: "Ballpen, black", quantity: 3, unit: "box", unitCost: 120 }),
      ],
    });
    // A second approval, or a refresh, finds the same order.
    expect((await setPurchaseRequestStatus(pr.id, "Approved", { by: "Ana Reyes" })).poNumber).toBe(pr.poNumber);
    expect(await listPurchaseOrders()).toHaveLength(1);
    // The request's link to its order is the server's.
    expect((await getPurchaseRequest(pr.id))?.poNumber).toBe(pr.poNumber);
  });

  it("an approved request with its order is not returned to draft, and no second order is raised by hand", async () => {
    const { pr } = await approved();
    await expect(setPurchaseRequestStatus(pr.id, "Draft", { by: "Admin", remarks: "Revise" })).rejects.toThrow(/permission/i);
    const manual: PODraftInput = {
      prNumber: pr.prNumber,
      departmentCode: "GSO",
      requester: "x",
      purpose: "x",
      supplierName: "Someone",
      deliveryAddress: "x",
      items: [{ description: "Bond paper, A4", quantity: 1, unit: "ream", unitCost: 1 }],
      attachments: [],
    };
    await expect(createPurchaseOrder(manual)).rejects.toThrow(`${pr.prNumber} already has purchase order ${pr.poNumber}`);
  });

  it("blank details are completed later without a reason; a correction needs one and is kept", async () => {
    const { po } = await approved();
    const completed = await updatePurchaseOrderDetails(
      po.id,
      details({ supplierName: "Test Supplies Co.", paymentTerm: "Cash", items: po.items.map((it) => ({ ...it, stockNo: "SP-1" })) }),
      { by: "Ana Reyes" },
    );
    expect(completed).toMatchObject({ supplierName: "Test Supplies Co.", paymentTerm: "Cash", status: "Approved" });
    expect(completed.history.at(-1)?.kind).toBe("update");

    await expect(
      updatePurchaseOrderDetails(po.id, details({ supplierName: "Other Supplier", paymentTerm: "Cash", items: completed.items }), { by: "Ana Reyes" }),
    ).rejects.toThrow(/Give the reason/);
    const corrected = await updatePurchaseOrderDetails(
      po.id,
      details({ supplierName: "Other Supplier", paymentTerm: "Cash", items: completed.items.map((it, i) => (i === 0 ? { ...it, quantity: 12 } : it)) }),
      { reason: "Award changed after canvass (test data)", by: "Ana Reyes" },
    );
    expect(corrected.supplierName).toBe("Other Supplier");
    expect(corrected.items[0].quantity).toBe(12);
    expect(corrected.authorizedItems?.[0].quantity).toBe(10);
    expect(corrected.history.at(-1)?.kind).toBe("correction");
  });

  it("the browser cannot edit, release or return an order authorized with its request", async () => {
    const { po } = await approved();
    const input: PODraftInput = {
      prNumber: po.prNumber,
      departmentCode: "GSO",
      requester: po.requester,
      purpose: po.purpose,
      supplierName: "Changed",
      deliveryAddress: "x",
      items: [{ description: "x", quantity: 1, unit: "pc", unitCost: 1 }],
      attachments: [],
    };
    await expect(updatePurchaseOrder(po.id, input)).rejects.toThrow(/permission/i);
    await expect(setPurchaseOrderStatus(po.id, "Released", { by: "Admin" })).rejects.toThrow(/permission/i);
    await expect(setPurchaseOrderStatus(po.id, "Draft", { by: "Admin" })).rejects.toThrow(/permission/i);
    await expect(issuePurchaseOrder(po.id)).rejects.toThrow(/permission/i);
    // Comments still grow.
    expect((await addPurchaseOrderComment(po.id, { author: "Admin", office: "GSO", text: "Printed" })).comments).toHaveLength(1);
  });

  it("an older approved request gets its order once (Create linked PO)", async () => {
    await seedApprovedPR("PR-2026-000050");
    await signInAs("admin@alaminos.gov.ph");
    const first = await ensurePurchaseOrderForPR("PR-2026-000050");
    expect(first.created).toBe(true);
    expect(await ensurePurchaseOrderForPR("PR-2026-000050")).toEqual({ poNumber: first.poNumber, created: false });
    expect((await getPurchaseOrder(first.poNumber))?.prOfficialNumber).toBe("100-2026-000001");
  });

  it("lists and searches orders", async () => {
    await approved({ purpose: "Toner cartridges (test data)" });
    await approved({ purpose: "Cleaning supplies (test data)" });
    expect(await listPurchaseOrders()).toHaveLength(2);
    expect((await listPurchaseOrders({ search: "toner" })).map((p) => p.purpose)).toEqual(["Toner cartridges (test data)"]);
  });

  it("an order released under the earlier workflow can still be issued, acknowledged and completed", async () => {
    await seedDocument("purchase_orders/PO-2026-000099", {
      id: "PO-2026-000099",
      po_number: "PO-2026-000099",
      pr_number: "PR-2026-000001",
      department_code: "GSO",
      requester: "Juan Dela Cruz",
      purpose: "Older order (test data)",
      supplier_name: "Test Supplies Co.",
      delivery_address: "GSO, Municipal Hall",
      municipal_mayor: "Hon. TEST MAYOR",
      status: "Released",
      issued_date: "2026-09-01",
      items: [{ id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 240 }],
      approvals: [{ step: "Released", by: "Admin", at: "2026-09-01T00:00:00.000Z" }],
      history: [],
      comments: [],
      attachments: [],
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    });
    await signInAs("admin@alaminos.gov.ph");
    const legacy = await getPurchaseOrder("PO-2026-000099");
    expect(legacy).toMatchObject({ status: "Released", municipalMayor: "Hon. TEST MAYOR" });
    await expect(acknowledgePurchaseOrder(legacy!.id)).rejects.toThrow(/must be issued first/);
    expect((await issuePurchaseOrder(legacy!.id, { by: "GSO Head" })).issuedBy).toBe("GSO Head");
    expect((await acknowledgePurchaseOrder(legacy!.id)).acknowledgedBy).toBe("Test Supplies Co.");
    expect((await setPurchaseOrderStatus(legacy!.id, "Completed", { by: "Admin" })).status).toBe("Completed");
  });

  it("an order not issued may be voided with a reason; its number and record stay", async () => {
    const { po } = await approved();
    const voided = await cancelPurchaseOrder(po.id, { reason: "Supplier withdrew (test data)", by: "Admin" });
    expect(voided).toMatchObject({ status: "Cancelled", poNumber: po.poNumber });
  });

  it("the public can open an order by number (Track page)", async () => {
    const { po } = await approved();
    await signOutToPublic();
    expect((await getPurchaseOrder(po.id))?.poNumber).toBe(po.poNumber);
  });
});
