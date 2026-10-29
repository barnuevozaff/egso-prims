import { beforeEach, describe, expect, it } from "vitest";

import { requireFirebase } from "@/lib/firebase";
import { createPurchaseRequest, setPurchaseRequestStatus, type PRDraftInput } from "@/features/purchase-requests/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  createNotification,
} from "@/features/notifications/api";
import {
  addAuditComment,
  deleteAuditEntries,
  getAuditEntry,
  listAuditEntries,
  listRelatedEntries,
} from "@/features/audit/api";
import {
  getConfigBoolean,
  getConfigNumber,
  getSystemStatus,
  listConfiguration,
  setConfigValue,
  setConfigValues,
} from "@/features/config/api";
import { createInventoryItem } from "@/features/inventory/api";
import { createReservation, updateReservation, type ReservationDraftInput } from "@/features/reservations/api";

import { createTeam, resetEmulators, signInAs, signOutToPublic } from "./setup";

const pr: PRDraftInput = {
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-19",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
  attachments: [],
};

/** The Cloud Functions write notifications and audit entries a moment after the write. */
async function eventually<T>(probe: () => Promise<T | undefined | false>): Promise<T> {
  for (let i = 0; i < 80; i++) {
    const v = await probe();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for a Cloud Function to run.");
}

// Resetting the emulators deletes the previous test's records, and the
// trigger audits those deletions a moment later; each test looks only at
// entries written since it began.
let since = "";
const ownEntries = <T extends { timestamp: string }>(list: T[]) => list.filter((e) => e.timestamp >= since);

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
  since = new Date().toISOString();
});

describe("Notifications on Firestore", () => {
  it("staff see the notification a submission raised, and mark it read", async () => {
    await signOutToPublic();
    const filed = await createPurchaseRequest(pr);
    await signInAs("clerk@alaminos.gov.ph");
    const [n] = await eventually(async () => {
      const list = await listNotifications({ module: "Procurement" });
      return list.length ? list : undefined;
    });
    expect(n).toMatchObject({ title: "New Purchase Request Submitted", referenceId: filed.id, isRead: false });
    await markNotificationRead(n.id);
    expect(await listNotifications({ unreadOnly: true })).toHaveLength(0);
    await expect(createNotification({ title: "Forged", module: "Procurement" })).rejects.toThrow(/raised by the system/);
  });

  it("marks all read, and only within the module asked for", async () => {
    await signInAs("admin@alaminos.gov.ph");
    await createPurchaseRequest(pr);
    await createInventoryItem({
      name: "Bond paper",
      category: "Office Supplies",
      unit: "ream",
      unitPrice: 250,
      beginningBalance: 0,
      attachments: [],
    });
    await eventually(async () => (await listNotifications({ unreadOnly: true })).length >= 1 || undefined);
    await markAllNotificationsRead("Procurement");
    expect((await listNotifications({ module: "Procurement", unreadOnly: true })).length).toBe(0);
  });
});

describe("Audit trail on Firestore", () => {
  it("records who changed an official's printed name, and from what to what (21 Oct 2026)", async () => {
    await signInAs("admin@alaminos.gov.ph");
    await setConfigValues([{ category: "Signatories", key: "pr_cash_availability_name", value: "NEW TREASURER (test data)" }]);
    const [entry] = await eventually(async () => {
      // The test setup's own seeding of the name is audited too ("Record Created", System).
      const list = (await listAuditEntries({ module: "Settings" })).filter(
        (e) => e.documentNumber === "Signatories · pr_cash_availability_name" && e.action === "Record Updated",
      );
      return list.length ? list : undefined;
    });
    expect(entry).toMatchObject({
      user: "admin@alaminos.gov.ph",
      action: "Record Updated",
      previousValue: "Value: TEST TREASURER",
      updatedValue: "Value: NEW TREASURER (test data)",
    });
  });

  it("shows who did what, newest first, with the document's whole trail", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const filed = await createPurchaseRequest(pr);
    await signInAs("admin@alaminos.gov.ph");
    await setPurchaseRequestStatus(filed.id, "Approved", { by: "Admin" });
    const entries = await eventually(async () => {
      const list = ownEntries(await listAuditEntries({ module: "Purchase Requests" }));
      return list.length >= 2 ? list : undefined;
    });
    expect(entries.map((e) => [e.action, e.user])).toEqual([
      ["Record Updated", "admin@alaminos.gov.ph"],
      ["Record Created", "clerk@alaminos.gov.ph"],
    ]);
    expect(ownEntries(await listRelatedEntries(entries[0])).map((e) => e.action)).toEqual([
      "Record Created",
      "Record Updated",
    ]);
    expect(await listAuditEntries({ limit: 1 })).toHaveLength(1);
  });

  it("an Administrator's comment carries their identity, and entries cannot be deleted", async () => {
    await signInAs("admin@alaminos.gov.ph");
    await createPurchaseRequest(pr);
    const [entry] = await eventually(async () => {
      const list = await listAuditEntries();
      return list.length ? list : undefined;
    });
    const commented = await addAuditComment(entry.id, { author: "GSO Admin", office: "GSO", text: "Checked." });
    const comment = commented.comments.at(-1) as unknown as Record<string, unknown>;
    expect(comment).toMatchObject({ author: "GSO Admin", text: "Checked." });
    expect(comment.author_uid).toBe(requireFirebase().auth.currentUser?.uid);
    expect((await getAuditEntry(entry.id))?.comments).toHaveLength(1);
    await expect(deleteAuditEntries([entry.id])).rejects.toThrow(/cannot be deleted/);
  });

  it("is closed to signed-out visitors", async () => {
    await signOutToPublic();
    await expect(listAuditEntries()).rejects.toThrow(/permission/i);
  });
});

describe("Settings on Firestore", () => {
  it("Administrators change settings; numbering and inventory read the same values", async () => {
    await signInAs("admin@alaminos.gov.ph");
    expect(await getConfigNumber("Document Numbering", "padding_length")).toBe(6);
    await setConfigValue("Document Numbering", "padding_length", 4);
    await setConfigValues([{ category: "Inventory", key: "reorder_percent", value: 50 }]);
    expect(await getConfigNumber("Document Numbering", "padding_length")).toBe(4);
    // The createPurchaseRequest function reads the same setting.
    expect((await createPurchaseRequest(pr)).prNumber).toMatch(/^PR-\d{4}-0001$/);
    const item = await createInventoryItem({
      name: "Folder",
      category: "Office Supplies",
      unit: "pc",
      unitPrice: 10,
      beginningBalance: 40,
      attachments: [],
    });
    expect(item.reorderLevel).toBe(20);
    expect((await listConfiguration({ category: "Inventory" })).map((c) => c.key)).toEqual(["reorder_percent"]);
    expect((await getSystemStatus()).connected).toBe(true);
  });

  it("every account reads and changes settings; signed out, nobody changes them", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    expect(await getConfigBoolean("Document Numbering", "year_reset")).toBe(true);
    await setConfigValue("Document Numbering", "padding_length", 5);
    expect(await getConfigNumber("Document Numbering", "padding_length")).toBe(5);
    await signOutToPublic();
    await expect(setConfigValue("Document Numbering", "padding_length", 2)).rejects.toThrow();
  });
});

describe("Reservation changes through the server", () => {
  const fr = (over: Partial<ReservationDraftInput> = {}): ReservationDraftInput => ({
    facilityId: "Session Hall",
    departmentCode: "MO",
    borrower: "Office of the Mayor",
    contactNumber: "0917 000 0000",
    purpose: "Assembly (test data)",
    date: "2026-11-05",
    startTime: "08:00",
    endTime: "10:00",
    equipment: [],
    attachments: [],
    ...over,
  });

  it("moves a booking when the slot is free, and refuses a clash", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const a = await createReservation(fr());
    const b = await createReservation(fr({ startTime: "13:00", endTime: "15:00" }));
    const moved = await updateReservation(b.id, fr({ startTime: "15:00", endTime: "16:00", purpose: "Moved" }));
    expect(moved).toMatchObject({ startTime: "15:00", purpose: "Moved" });
    await expect(updateReservation(b.id, fr({ startTime: "09:00", endTime: "11:00" }))).rejects.toThrow(
      `Schedule conflict with ${a.resNumber} — pick another slot.`,
    );
  });
});
