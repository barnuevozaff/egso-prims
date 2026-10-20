import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, staffToken, waitFor } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Notifications, audit attribution and reservation changes, end to end in
 * the emulators. Synthetic data only; demo project only.
 */

let db: Firestore;

const pr = {
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-19",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
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
  endTime: "10:00",
  equipment: [],
  attachments: [],
  ...over,
});

// Every test reuses the same document numbers, and clearing the emulator
// deletes the previous test's records, which the trigger then audits. So each
// query looks only at entries written since its own test started.
let since = "";

const notificationsFor = async (referenceId: string) =>
  (await db.collection("notifications").where("reference_id", "==", referenceId).get()).docs
    .map((d) => d.data())
    .filter((n) => String(n.created_at) >= since);

const createdEntryFor = async (documentNumber: unknown) =>
  (await db.collection("audit_logs").where("document_number", "==", documentNumber).get()).docs
    .map((d) => d.data())
    .find((e) => e.action === "Record Created" && String(e.timestamp) >= since);

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  since = new Date().toISOString();
});

describe("notifications", () => {
  it("a portal submission notifies the office, with notify_event's wording", async () => {
    const res = await call("createPurchaseRequest", { input: pr });
    const id = String(res.result?.id);
    const [n] = await waitFor(async () => {
      const list = await notificationsFor(id);
      return list.length ? list : undefined;
    });
    expect(n).toMatchObject({
      title: "New Purchase Request Submitted",
      description: `${id} — Bond paper (test data)`,
      module: "Procurement",
      reference_type: "purchase-request",
      is_read: false,
      created_by: "System",
    });
    expect(String(n.id)).toMatch(/^NTF-\d{4}-\d{6}$/);
    expect(typeof n.created_at).toBe("string");
  });

  it("an approval notifies too; an ordinary edit does not", async () => {
    const res = await call("createPurchaseRequest", { input: pr });
    const id = String(res.result?.id);
    await waitFor(async () => (await notificationsFor(id)).length === 1);
    await db.doc(`purchase_requests/${id}`).update({ purpose: "Edited", updated_at: "x" });
    await db.doc(`purchase_requests/${id}`).update({ status: "Approved" });
    const titles = await waitFor(async () => {
      const list = await notificationsFor(id);
      return list.length >= 2 ? list.map((x) => x.title) : undefined;
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await notificationsFor(id)).map((x) => x.title).sort()).toEqual(
      ["New Purchase Request Submitted", "Purchase Request Approved"].sort(),
    );
    expect(titles).toContain("Purchase Request Approved");
  });
});

describe("audit attribution", () => {
  it("a document a staff member files through a function is audited under their email", async () => {
    const { token } = await staffToken("clerk@alaminos.gov.ph", "Department User");
    const res = await call("createPurchaseRequest", { input: pr }, token);
    const entry = await waitFor(() => createdEntryFor(res.result?.pr_number));
    expect(entry).toMatchObject({ user_name: "clerk@alaminos.gov.ph", user_role: "Authenticated User" });
    expect(typeof entry.timestamp).toBe("string");
  });

  it("dates an entry at the write it records, not before it", async () => {
    const res = await call("createPurchaseRequest", { input: pr });
    const entry = await waitFor(() => createdEntryFor(res.result?.pr_number));
    // The request records when it was saved; its audit entry may not be older.
    expect(String(entry.timestamp) >= String(res.result?.created_at)).toBe(true);
    const [n] = await waitFor(async () => {
      const list = await notificationsFor(String(res.result?.id));
      return list.length ? list : undefined;
    });
    expect(String(n.created_at) >= String(res.result?.created_at)).toBe(true);
  });

  it("a portal submission is audited as the public portal", async () => {
    const res = await call("createPurchaseRequest", { input: pr });
    const entry = await waitFor(() => createdEntryFor(res.result?.pr_number));
    expect(entry).toMatchObject({ user_name: "Public Portal" });
  });
});

describe("updateReservation", () => {
  it("moves a booking to a free slot and records it under the staff member", async () => {
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const a = await call("createReservation", { input: fr() }, token);
    const moved = await call("updateReservation", { id: a.result?.id, input: fr({ startTime: "13:00", endTime: "15:00" }) }, token);
    expect(moved.result).toMatchObject({ start_time: "13:00", end_time: "15:00" });
    const entry = await waitFor(async () => {
      const snap = await db
        .collection("audit_logs")
        .where("document_number", "==", a.result?.res_number)
        .where("action", "==", "Record Updated")
        .get();
      return snap.docs.map((d) => d.data()).find((e) => String(e.timestamp) >= since);
    });
    expect(entry.user_name).toBe("dept@alaminos.gov.ph");
  });

  it("refuses to move a booking onto another, with the usual message", async () => {
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const a = await call("createReservation", { input: fr() }, token);
    const b = await call("createReservation", { input: fr({ startTime: "13:00", endTime: "15:00" }) }, token);
    const clash = await call("updateReservation", { id: b.result?.id, input: fr({ startTime: "09:00", endTime: "11:00" }) }, token);
    expect(clash.error?.status).toBe("FAILED_PRECONDITION");
    expect(clash.error?.message).toBe(`Schedule conflict with ${a.result?.res_number} — pick another slot.`);
  });

  it("lets only one of two simultaneous moves take the same free slot", async () => {
    const { token } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const a = await call("createReservation", { input: fr() }, token);
    const b = await call("createReservation", { input: fr({ startTime: "13:00", endTime: "15:00" }) }, token);
    const target = fr({ startTime: "16:00", endTime: "17:00" });
    const results = await Promise.all([
      call("updateReservation", { id: a.result?.id, input: target }, token),
      call("updateReservation", { id: b.result?.id, input: target }, token),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error?.status === "FAILED_PRECONDITION")).toHaveLength(1);
  });

  it("refuses Viewers, the public, and bookings already closed", async () => {
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    const { token: viewer } = await staffToken("viewer@alaminos.gov.ph", "Viewer");
    const a = await call("createReservation", { input: fr() }, dept);
    expect((await call("updateReservation", { id: a.result?.id, input: fr() }, viewer)).error?.status).toBe(
      "PERMISSION_DENIED",
    );
    expect((await call("updateReservation", { id: a.result?.id, input: fr() })).error?.status).toBe("PERMISSION_DENIED");
    await db.doc(`reservations/${a.result?.id}`).update({ status: "Completed" });
    const closed = await call("updateReservation", { id: a.result?.id, input: fr() }, dept);
    expect(closed.error?.status).toBe("FAILED_PRECONDITION");
  });
});
