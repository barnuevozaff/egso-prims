import { beforeEach, describe, expect, it } from "vitest";

import { countRecords } from "@/features/shared/record-counts";
import {
  addReservationComment,
  cancelReservation,
  createReservation,
  findConflicts,
  getReservation,
  listBookingsBetween,
  listReservations,
  setReservationStatus,
  updateReservation,
  type ReservationDraftInput,
} from "@/features/reservations/api";

import { createTeam, manilaYear, resetEmulators, signInAs, signOutToPublic } from "./setup";

const input = (over: Partial<ReservationDraftInput> = {}): ReservationDraftInput => ({
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

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("Reservations on Firestore", () => {
  it("the public portal books a slot and sees it taken in the calendar, without who booked it", async () => {
    await signOutToPublic();
    const r = await createReservation(input());
    expect(r).toMatchObject({ resNumber: `FR-${manilaYear()}-000001`, status: "Pending" });
    const month = await listBookingsBetween("2026-11-01", "2026-11-30");
    expect(month).toHaveLength(1);
    expect(month[0]).toMatchObject({ resNumber: r.resNumber, facilityId: "Session Hall", startTime: "08:00" });
    expect(month[0].borrower).toBeUndefined();
    expect(month[0].purpose).toBeUndefined();
    expect((await getReservation(r.id))?.borrower).toBe("Office of the Mayor");
  });

  it("refuses a double booking with the same message as before", async () => {
    await signOutToPublic();
    const first = await createReservation(input());
    await expect(createReservation(input({ facilityId: "session  hall", startTime: "10:00", endTime: "11:00" }))).rejects.toThrow(
      `Schedule conflict with ${first.resNumber} — pick another slot.`,
    );
    expect(await findConflicts("Session Hall", "2026-11-05", "11:30", "13:00")).toHaveLength(1);
    expect(await findConflicts("Covered Court", "2026-11-05", "11:30", "13:00")).toHaveLength(0);
  });

  it("staff list, filter, edit, comment and approve; edits are checked for clashes too", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const a = await createReservation(input());
    const b = await createReservation(input({ facilityId: "Covered Court", departmentCode: "MHO" }));
    expect((await listReservations()).map((r) => r.id)).toEqual([b.id, a.id]);
    expect((await listReservations({ departmentCode: "MHO" })).map((r) => r.id)).toEqual([b.id]);
    await expect(updateReservation(b.id, input())).rejects.toThrow(/Schedule conflict/);
    await updateReservation(b.id, input({ facilityId: "Covered Court", purpose: "Sports fest" }));
    await addReservationComment(b.id, { author: "Dept", office: "MHO", text: "Need chairs" });
    const approved = await setReservationStatus(b.id, "Approved", { by: "Administrator" });
    expect(approved).toMatchObject({ status: "Approved", purpose: "Sports fest" });
    expect(await countRecords("reservations", ["Pending"])).toBe(1);
  });

  it("a cancelled booking no longer blocks the slot", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const a = await createReservation(input());
    // A void must give its reason (firestore.rules), so a bare status change is refused.
    await expect(setReservationStatus(a.id, "Cancelled", { by: "Administrator" })).rejects.toThrow(/permission/);
    await cancelReservation(a.id, { reason: "Event moved online", by: "Administrator" });
    await expect(createReservation(input())).resolves.toBeTruthy();
  });

});
