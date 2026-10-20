import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, staffToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * The create functions over HTTP, as the browser and the public portal call
 * them. Synthetic data only; demo project only.
 */

let db: Firestore;

const pr = {
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper for Q4 reports (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-19",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
  attachments: [],
};

const ris = {
  departmentCode: "MHO",
  requester: "Maria Santos",
  purpose: "Clinic supplies (test data)",
  receivedBy: "Maria Santos",
  items: [{ name: "Alcohol, 500 ml", unit: "bottle", requestedQty: 5, issuedQty: 0 }],
  attachments: [],
};

const fr = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const po = {
  prNumber: "PR-2026-000001",
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper",
  supplierName: "Test Supplies Co.",
  deliveryAddress: "GSO, Municipal Hall",
  expectedDelivery: "Within 15 days",
  items: [{ description: "Bond paper", quantity: 10, unit: "ream", unitCost: 240 }],
  attachments: [],
};

const attachment = {
  name: "quotation.pdf",
  kind: "pdf",
  size: 1000,
  uploadedBy: "Administrator",
  url: "http://127.0.0.1:9199/x",
  path: "attachments/upload-1/quotation.pdf",
};

const year = () => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date());

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
});

describe("createPurchaseRequest", () => {
  it("numbers and saves a portal submission in one step", async () => {
    const res = await call("createPurchaseRequest", { input: pr });
    expect(res.error).toBeUndefined();
    const number = `PR-${year()}-000001`;
    expect(res.result).toMatchObject({ id: number, pr_number: number, status: "Submitted" });
    const saved = await db.doc(`purchase_requests/${number}`).get();
    expect(saved.get("purpose")).toBe(pr.purpose);
    expect((await db.doc(`document_counters/PR-${year()}`).get()).get("current_sequence")).toBe(1);
  });

  it("spends no number when the input is rejected", async () => {
    const res = await call("createPurchaseRequest", { input: { ...pr, items: [] } });
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
    expect((await db.doc(`document_counters/PR-${year()}`).get()).exists).toBe(false);
  });

  it("refuses attachments from the public", async () => {
    const res = await call("createPurchaseRequest", { input: { ...pr, attachments: [attachment] } });
    expect(res.error?.status).toBe("PERMISSION_DENIED");
  });

  it("accepts attachments from staff", async () => {
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const res = await call("createPurchaseRequest", { input: { ...pr, attachments: [attachment] } }, token);
    expect(res.result?.attachments).toHaveLength(1);
  });

  it("refuses a Viewer", async () => {
    const { token } = await staffToken("viewer@alaminos.gov.ph", "Viewer");
    expect((await call("createPurchaseRequest", { input: pr }, token)).error?.status).toBe("PERMISSION_DENIED");
  });

  it("gives simultaneous submissions different, consecutive numbers", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => call("createPurchaseRequest", { input: pr })));
    expect(results.every((r) => !r.error)).toBe(true);
    const numbers = results.map((r) => String(r.result?.pr_number));
    expect(new Set(numbers).size).toBe(12);
    const seq = numbers.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
    expect(seq).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect((await db.collection("purchase_requests").get()).size).toBe(12);
  });

  it("limits how often one network may submit", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await call("createPurchaseRequest", { input: pr })).error).toBeUndefined();
    }
    const blocked = await call("createPurchaseRequest", { input: pr });
    expect(blocked.error?.status).toBe("RESOURCE_EXHAUSTED");
    // Staff are not counted against the public limit.
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await call("createPurchaseRequest", { input: pr }, token)).error).toBeUndefined();
  }, 120_000);
});

describe("createPurchaseOrder", () => {
  it("is for Administrators only", async () => {
    expect((await call("createPurchaseOrder", { input: po })).error?.status).toBe("PERMISSION_DENIED");
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await call("createPurchaseOrder", { input: po }, dept)).error?.status).toBe("PERMISSION_DENIED");
    const { token: admin } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    const res = await call("createPurchaseOrder", { input: po, asDraft: true }, admin);
    expect(res.result).toMatchObject({ po_number: `PO-${year()}-000001`, status: "Draft" });
  });
});

describe("createRisRequest", () => {
  it("files a public slip as submitted, never as a draft", async () => {
    const res = await call("createRisRequest", { input: ris, asDraft: true });
    expect(res.result).toMatchObject({ ris_number: `RIS-${year()}-000001`, status: "Pending Approval" });
  });

  it("lets staff save a draft", async () => {
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const res = await call("createRisRequest", { input: ris, asDraft: true }, token);
    expect(res.result).toMatchObject({ status: "Draft" });
  });
});

describe("createReservation", () => {
  it("books a free slot", async () => {
    const res = await call("createReservation", { input: fr() });
    expect(res.result).toMatchObject({ res_number: `FR-${year()}-000001`, status: "Pending" });
  });

  it("refuses an overlapping booking of the same facility, with the same message as before", async () => {
    await call("createReservation", { input: fr() });
    const clash = await call("createReservation", { input: fr({ facilityId: "session hall", startTime: "11:00", endTime: "13:00" }) });
    expect(clash.error?.status).toBe("FAILED_PRECONDITION");
    expect(clash.error?.message).toMatch(/^Schedule conflict with FR-\d{4}-000001 — pick another slot\.$/);
    // Another facility, or a slot that only touches, is free.
    expect((await call("createReservation", { input: fr({ facilityId: "Covered Court" }) })).error).toBeUndefined();
    expect((await call("createReservation", { input: fr({ startTime: "12:00", endTime: "14:00" }) })).error).toBeUndefined();
  });

  it("lets only one of several simultaneous requests take a slot", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => call("createReservation", { input: fr() })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error?.status === "FAILED_PRECONDITION")).toHaveLength(5);
    expect((await db.collection("reservations").get()).size).toBe(1);
    // The refused requests spent no numbers.
    expect((await db.doc(`document_counters/FR-${year()}`).get()).get("current_sequence")).toBe(1);
  });

  it("a cancelled booking frees its slot", async () => {
    const first = await call("createReservation", { input: fr() });
    await db.doc(`reservations/${first.result?.id}`).update({ status: "Cancelled" });
    expect((await call("createReservation", { input: fr() })).error).toBeUndefined();
  });
});

describe("reservationAvailability", () => {
  it("shows the public which slots are taken, and nothing about who booked them", async () => {
    await call("createReservation", { input: fr() });
    const res = await call("reservationAvailability", { from: "2026-11-01", to: "2026-11-30" });
    const slots = res.result as unknown as Record<string, unknown>[];
    expect(slots).toHaveLength(1);
    expect(Object.keys(slots[0]).sort()).toEqual(
      ["date", "end_time", "facility_id", "id", "res_number", "start_time", "status"].sort(),
    );
  });

  it("refuses ranges longer than two months", async () => {
    const res = await call("reservationAvailability", { from: "2026-01-01", to: "2026-06-30" });
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
  });
});

describe("portalStockSuggestions", () => {
  it("suggests items by name with only name, unit and stock", async () => {
    await db.doc("inventory_items/inv-1").set({ name: "Bond paper, A4", unit: "ream", on_hand: 4, unit_price: 250 });
    const res = await call("portalStockSuggestions", { query: "bond" });
    expect(res.result).toEqual([{ name: "Bond paper, A4", unit: "ream", in_stock: true }]);
  });
});
