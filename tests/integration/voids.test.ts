import { beforeEach, describe, expect, it } from "vitest";

import { createInventoryItem, getInventoryItem, listStockCard } from "@/features/inventory/api";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrders,
  getPurchaseOrder,
  issuePurchaseOrder,
  type PODraftInput,
} from "@/features/purchase-orders/api";
import {
  cancelReservation,
  createReservation,
  deleteReservations,
  getReservation,
  type ReservationDraftInput,
} from "@/features/reservations/api";
import {
  cancelRequest,
  createRequest,
  deleteRequests,
  getRequest,
  setRequestStatus,
  type RISDraftInput,
} from "@/features/ris/api";

import { createTeam, resetEmulators, signInAs } from "./setup";

/**
 * Voiding numbered purchase orders, slips and bookings: the number, record
 * and history stay; the reason and who voided it are recorded; nothing is
 * deleted; a released slip's stock comes back. Synthetic data only.
 */

const po: PODraftInput = {
  prNumber: "PR-2026-000001",
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper (test data)",
  supplierName: "Test Supplies Co.",
  deliveryAddress: "GSO, Municipal Hall",
  expectedDelivery: "Within 15 days",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 240 }],
  attachments: [],
};

const fr: ReservationDraftInput = {
  facilityId: "Session Hall",
  departmentCode: "MO",
  borrower: "Office of the Mayor",
  contactNumber: "0917 000 0000",
  purpose: "Barangay assembly (test data)",
  date: "2026-11-05",
  startTime: "08:00",
  endTime: "12:00",
  equipment: [],
  attachments: [],
};

const slip = (items: RISDraftInput["items"]): RISDraftInput => ({
  departmentCode: "MHO",
  requester: "Maria Santos",
  purpose: "Clinic supplies (test data)",
  receivedBy: "Maria Santos",
  items,
  attachments: [],
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("voiding purchase orders", () => {
  it("keeps the number and records the reason, who and when", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const order = await createPurchaseOrder(po);
    await expect(cancelPurchaseOrder(order.id, { reason: "  ", by: "Admin" })).rejects.toThrow(/reason/);
    const voided = await cancelPurchaseOrder(order.id, { reason: "Supplier withdrew", by: "Test Admin", office: "GSO" });
    expect(voided).toMatchObject({ status: "Cancelled", poNumber: order.poNumber });
    expect(voided.approvals.at(-1)).toMatchObject({ step: "Cancelled", by: "Test Admin", remarks: "Supplier withdrew" });
    expect(voided.approvals.at(-1)?.at).toBeTruthy();
    expect(voided.history.at(-1)?.text).toBe("Status → Cancelled: Supplier withdrew");
    await expect(cancelPurchaseOrder(order.id, { reason: "Again", by: "Admin" })).rejects.toThrow(/cannot be voided/);
  });

  it("refuses an order already issued to the supplier", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const order = await createPurchaseOrder(po);
    await issuePurchaseOrder(order.id, { by: "Admin" });
    await expect(cancelPurchaseOrder(order.id, { reason: "Late", by: "Admin" })).rejects.toThrow(/issued to the supplier/);
    expect((await getPurchaseOrder(order.id))?.status).not.toBe("Cancelled");
  });

  it("is never deleted, and only an Administrator voids one", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const order = await createPurchaseOrder(po);
    await expect(deletePurchaseOrders([order.id])).rejects.toThrow(/permission/);
    await signInAs("dept@alaminos.gov.ph");
    await expect(cancelPurchaseOrder(order.id, { reason: "Not mine", by: "Dept" })).rejects.toThrow(/permission/);
    expect(await getPurchaseOrder(order.id)).toBeTruthy();
  });
});

describe("voiding reservations", () => {
  it("frees the slot, keeps the record, and is never deleted", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const booking = await createReservation(fr);
    await expect(deleteReservations([booking.id])).rejects.toThrow(/permission/);
    const voided = await cancelReservation(booking.id, { reason: "Assembly postponed", by: "Dept User" });
    expect(voided.approvals.at(-1)).toMatchObject({ step: "Cancelled", remarks: "Assembly postponed" });
    expect((await getReservation(booking.id))?.resNumber).toBe(booking.resNumber);
    await expect(createReservation(fr)).resolves.toBeTruthy();
    await signInAs("viewer@alaminos.gov.ph");
    await expect(cancelReservation(booking.id, { reason: "x", by: "Viewer" })).rejects.toThrow();
  });
});

describe("voiding slips", () => {
  async function stocked() {
    await signInAs("admin@alaminos.gov.ph");
    const paper = await createInventoryItem({
      name: "Bond paper, A4",
      category: "Office Supplies",
      unit: "ream",
      unitPrice: 240,
      beginningBalance: 50,
      attachments: [],
    });
    return paper;
  }

  it("a slip not yet released is voided with no stock movement", async () => {
    const paper = await stocked();
    await signInAs("dept@alaminos.gov.ph");
    const s = await createRequest(slip([{ inventoryItemId: paper.id, name: paper.name, unit: "ream", requestedQty: 5, issuedQty: 5 }]));
    await expect(deleteRequests([s.id])).rejects.toThrow(/permission/);
    const voided = await cancelRequest(s.id, { reason: "Duplicate request", by: "Dept User" });
    expect(voided).toMatchObject({ status: "Cancelled", risNumber: s.risNumber });
    expect((await getInventoryItem(paper.id))?.onHand).toBe(50);
  });

  it("a released slip is voided by an Administrator, and its stock comes back on the stock card", async () => {
    const paper = await stocked();
    const s = await createRequest(slip([{ inventoryItemId: paper.id, name: paper.name, unit: "ream", requestedQty: 8, issuedQty: 8 }]));
    await setRequestStatus(s.id, "Released", { by: "GSO Head" });
    expect((await getInventoryItem(paper.id))?.onHand).toBe(42);

    await signInAs("dept@alaminos.gov.ph");
    await expect(cancelRequest(s.id, { reason: "Wrong office", by: "Dept" })).rejects.toThrow(/permission/);

    await signInAs("admin@alaminos.gov.ph");
    const voided = await cancelRequest(s.id, { reason: "Issued to the wrong office", by: "Test Admin" });
    expect(voided.status).toBe("Cancelled");
    expect(voided.approvals.at(-1)).toMatchObject({ step: "Cancelled", remarks: "Issued to the wrong office" });
    expect((await getInventoryItem(paper.id))?.onHand).toBe(50);
    const card = await listStockCard(paper.id);
    expect(card.find((e) => e.type === "Return")).toMatchObject({ documentNumber: s.risNumber, quantityIn: 8, balance: 50 });
    await expect(cancelRequest(s.id, { reason: "Again", by: "Admin" })).rejects.toThrow(/cannot be voided/);
  });

  it("a Completed slip is final", async () => {
    const paper = await stocked();
    const s = await createRequest(slip([{ inventoryItemId: paper.id, name: paper.name, unit: "ream", requestedQty: 1, issuedQty: 1 }]));
    await setRequestStatus(s.id, "Released", { by: "GSO Head" });
    await setRequestStatus(s.id, "Completed", { by: "GSO Head" });
    await expect(cancelRequest(s.id, { reason: "Too late", by: "Admin" })).rejects.toThrow(/cannot be voided/);
    expect((await getRequest(s.id))?.status).toBe("Completed");
  });
});
