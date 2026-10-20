import { describe, expect, it } from "vitest";

import { buildNotification } from "../src/notifications.js";

describe("buildNotification (notify_event, migration 012)", () => {
  it("announces a new purchase request with its number and purpose", () => {
    expect(buildNotification("purchase_requests", undefined, { pr_number: "PR-2026-000001", purpose: "Bond paper" })).toEqual({
      module: "Procurement",
      reference_type: "purchase-request",
      title: "New Purchase Request Submitted",
      description: "PR-2026-000001 — Bond paper",
    });
  });

  it("announces approval and rejection, but not other changes", () => {
    const pr = { pr_number: "PR-2026-000001", status: "Submitted" };
    expect(buildNotification("purchase_requests", pr, { ...pr, status: "Approved" })?.title).toBe("Purchase Request Approved");
    expect(buildNotification("purchase_requests", pr, { ...pr, status: "Rejected" })?.description).toBe(
      "PR-2026-000001 was rejected.",
    );
    expect(buildNotification("purchase_requests", pr, { ...pr, purpose: "Edited" })).toBeNull();
    expect(buildNotification("purchase_requests", pr, { ...pr, status: "Cancelled" })).toBeNull();
  });

  it("announces a released RIS and a new or approved purchase order", () => {
    expect(
      buildNotification("ris_requests", { ris_number: "RIS-1", status: "Approved" }, { ris_number: "RIS-1", status: "Released" })?.title,
    ).toBe("RIS Released");
    expect(buildNotification("purchase_orders", undefined, { po_number: "PO-1", pr_number: "PR-1" })?.description).toBe(
      "PO-1 created from PR-1",
    );
  });

  it("raises a low-stock alert only when stock crosses the reorder level", () => {
    const item = { name: "Bond paper", unit: "ream", reorder_level: 10 };
    expect(buildNotification("inventory_items", { ...item, on_hand: 12 }, { ...item, on_hand: 9 })?.description).toBe(
      "Bond paper fell to 9 ream (reorder at 10).",
    );
    // Already below: no repeat alert.
    expect(buildNotification("inventory_items", { ...item, on_hand: 9 }, { ...item, on_hand: 5 })).toBeNull();
  });

  it("announces reservations on the Facilities feed", () => {
    expect(buildNotification("reservations", undefined, { res_number: "FR-1", purpose: "Assembly" })).toMatchObject({
      module: "Facilities",
      title: "Facility Reservation Submitted",
      description: "FR-1 — Assembly",
    });
  });

  it("stays silent for collections notify_event did not cover", () => {
    expect(buildNotification("suppliers", undefined, { name: "X" })).toBeNull();
    expect(buildNotification("notifications", undefined, { title: "X" })).toBeNull();
    expect(buildNotification("audit_logs", undefined, { action: "X" })).toBeNull();
  });
});
