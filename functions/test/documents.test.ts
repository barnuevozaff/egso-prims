import { describe, expect, it } from "vitest";

import {
  buildPurchaseOrder,
  buildPurchaseRequest,
  buildReservation,
  buildRisRequest,
} from "../src/documents/builders.js";
import { sameFacility, timesOverlap } from "../src/documents/facilities.js";
import { suggest } from "../src/documents/stock-suggestions.js";

const AT = "2026-10-19T02:00:00.000Z";

const pr = {
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper for Q4 reports (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-19",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
  attachments: [],
};

describe("buildPurchaseRequest — the row the Supabase version inserted", () => {
  it("has the same fields, status, history and approvals", () => {
    const row = buildPurchaseRequest(pr, "PR-2026-000001", AT);
    expect(row).toMatchObject({
      id: "PR-2026-000001",
      pr_number: "PR-2026-000001",
      department_code: "GSO",
      requester: "Juan Dela Cruz",
      funding_source: "General Fund",
      request_date: "2026-10-19",
      status: "Submitted",
      comments: [],
      attachments: [],
      created_at: AT,
      updated_at: AT,
      approvals: [
        { step: "Created", by: "Juan Dela Cruz", at: AT },
        { step: "Submitted", by: "Juan Dela Cruz", at: AT },
      ],
    });
    expect(row.history).toMatchObject([
      { kind: "create", text: "PR-2026-000001 created by Juan Dela Cruz", at: AT },
      { kind: "status", text: "Submitted for review", at: AT },
    ]);
    expect((row.items as { id: string }[])[0]).toMatchObject({ description: "Bond paper, A4", quantity: 10 });
    expect((row.items as { id: string }[])[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses missing, wrong-typed and oversized fields", () => {
    expect(() => buildPurchaseRequest({ ...pr, purpose: "" }, "PR-1", AT)).toThrow(/Purpose is required/);
    expect(() => buildPurchaseRequest({ ...pr, purpose: "x".repeat(2001) }, "PR-1", AT)).toThrow(/too long/);
    expect(() => buildPurchaseRequest({ ...pr, requestDate: "19/10/2026" }, "PR-1", AT)).toThrow(/YYYY-MM-DD/);
    expect(() => buildPurchaseRequest({ ...pr, items: [] }, "PR-1", AT)).toThrow(/at least 1/);
    expect(() =>
      buildPurchaseRequest({ ...pr, items: [{ ...pr.items[0], quantity: 0 }] }, "PR-1", AT),
    ).toThrow(/more than 0/);
    expect(() =>
      buildPurchaseRequest({ ...pr, items: [{ ...pr.items[0], estimatedCost: "250" }] }, "PR-1", AT),
    ).toThrow(/must be a number/);
    expect(() => buildPurchaseRequest("not an object", "PR-1", AT)).toThrow(/not valid/);
  });

  it("only accepts attachments stored under attachments/", () => {
    const file = { name: "q.pdf", kind: "pdf", size: 10, uploadedBy: "a", url: "https://x", path: "elsewhere/q.pdf" };
    expect(() => buildPurchaseRequest({ ...pr, attachments: [file] }, "PR-1", AT)).toThrow(/attachments folder/);
    expect(() =>
      buildPurchaseRequest({ ...pr, attachments: [{ ...file, path: "attachments/../x" }] }, "PR-1", AT),
    ).toThrow(/attachments folder/);
    const ok = buildPurchaseRequest({ ...pr, attachments: [{ ...file, path: "attachments/u/q.pdf" }] }, "PR-1", AT);
    expect((ok.attachments as unknown[]).length).toBe(1);
  });
});

describe("buildPurchaseOrder", () => {
  const po = {
    prNumber: "PR-2026-000001",
    departmentCode: "GSO",
    requester: "Juan Dela Cruz",
    purpose: "Bond paper",
    supplierName: "Test Supplies Co.",
    supplierTin: "  ",
    deliveryAddress: "GSO, Municipal Hall",
    expectedDelivery: "Within 15 days",
    items: [{ description: "Bond paper", quantity: 10, unit: "ream", unitCost: 240 }],
    attachments: [],
  };

  it("submits for approval, or saves a draft, as the Supabase version did", () => {
    const submitted = buildPurchaseOrder(po, "PO-2026-000001", AT, false);
    expect(submitted).toMatchObject({ status: "Pending Approval", issued_date: "2026-10-19", supplier_tin: null });
    expect(submitted.approvals).toHaveLength(2);
    const draft = buildPurchaseOrder(po, "PO-2026-000002", AT, true);
    expect(draft).toMatchObject({ status: "Draft" });
    expect(draft.approvals).toHaveLength(1);
    expect(draft.history).toHaveLength(1);
  });
});

describe("buildRisRequest", () => {
  const ris = {
    departmentCode: "MHO",
    requester: "Maria Santos",
    purpose: "Clinic supplies",
    receivedBy: "Maria Santos",
    items: [{ name: "Alcohol, 500 ml", unit: "bottle", requestedQty: 5, issuedQty: 0 }],
    attachments: [],
  };

  it("does not write 'created from undefined' for a slip without a purchase request", () => {
    const row = buildRisRequest(ris, "RIS-2026-000001", AT, false);
    expect((row.history as { text: string }[])[0].text).toBe("RIS-2026-000001 created");
    expect(row).toMatchObject({ pr_number: null, status: "Pending Approval", issued_by: "Administrator" });
  });

  it("names the purchase request when there is one", () => {
    const row = buildRisRequest({ ...ris, prNumber: "PR-2026-000004" }, "RIS-2026-000002", AT, false);
    expect((row.history as { text: string }[])[0].text).toBe("RIS-2026-000002 created from PR-2026-000004");
  });
});

describe("buildReservation", () => {
  const fr = {
    facilityId: "Session Hall",
    departmentCode: "MO",
    borrower: "Office of the Mayor",
    contactNumber: "0917 000 0000",
    purpose: "Barangay assembly",
    date: "2026-11-05",
    startTime: "08:00",
    endTime: "12:00",
    equipment: [],
    attachments: [],
  };

  it("is Pending with the same approval trail", () => {
    const row = buildReservation(fr, "FR-2026-000001", AT);
    expect(row).toMatchObject({ status: "Pending", facility_id: "Session Hall", start_time: "08:00" });
    expect(row.approvals).toMatchObject([
      { step: "Created", by: "Office of the Mayor" },
      { step: "Reviewed", by: "Marites Villanueva", office: "General Services Office" },
    ]);
  });

  it("refuses an end time that is not after the start", () => {
    expect(() => buildReservation({ ...fr, endTime: "08:00" }, "FR-1", AT)).toThrow(/after the start/);
    expect(() => buildReservation({ ...fr, startTime: "13:00", endTime: "9:00" }, "FR-1", AT)).toThrow(
      /after the start/,
    );
    expect(() => buildReservation({ ...fr, startTime: "25:00" }, "FR-1", AT)).toThrow(/HH:MM/);
  });
});

describe("double-booking checks (copied from the reservation form)", () => {
  it("match facilities ignoring case and spacing, and old register ids", () => {
    expect(sameFacility("Session  Hall", "session hall")).toBe(true);
    expect(sameFacility("fac-1", "Session Hall, 2F")).toBe(true);
    expect(sameFacility("Covered Court", "Session Hall")).toBe(false);
    expect(sameFacility("", "Session Hall")).toBe(false);
  });

  it("treat touching slots as free and overlapping ones as taken", () => {
    expect(timesOverlap("08:00", "10:00", "10:00", "12:00")).toBe(false);
    expect(timesOverlap("08:00", "10:30", "10:00", "12:00")).toBe(true);
    expect(timesOverlap("8:00", "9:30", "09:00", "10:00")).toBe(true);
  });
});

describe("stock suggestions", () => {
  const items = [
    { name: "Bond paper, A4", unit: "ream", onHand: 10 },
    { name: "Paper clips", unit: "box", onHand: 0 },
    { name: "Folder, long", unit: "pc", onHand: 3 },
  ];

  it("returns only name, unit and whether any is on hand, names starting with the query first", () => {
    expect(suggest(items, "pa")).toEqual([
      { name: "Paper clips", unit: "box", in_stock: false },
      { name: "Bond paper, A4", unit: "ream", in_stock: true },
    ]);
  });

  it("needs at least two letters", () => {
    expect(suggest(items, "p")).toEqual([]);
  });
});
