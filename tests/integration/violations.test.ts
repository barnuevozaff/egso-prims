import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveViolator,
  cancelViolation,
  createViolator,
  deleteViolations,
  deleteViolators,
  findViolatorByName,
  listViolations,
  listViolators,
  recordPayment,
  recordViolation,
  updateViolation,
  updateViolator,
  type ViolationInput,
} from "@/features/violations/api";

import { createTeam, manilaYear, resetEmulators, signInAs } from "./setup";

/** Synthetic names only; no real violators. */

const ticket = (over: Partial<ViolationInput> = {}): ViolationInput => ({
  violationType: "Illegal parking",
  dateIssued: "2026-10-15",
  amount: 500,
  apprehendedBy: "Test Officer",
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
  await signInAs("admin@alaminos.gov.ph");
});

describe("Violations on Firestore", () => {
  it("records a ticket against a name, opening the profile once", async () => {
    const first = await recordViolation({ violatorName: "Tester, Juan", ...ticket() });
    expect(first.createdProfile).toBe(true);
    expect(first.violation).toMatchObject({
      violationNo: `VT-${manilaYear()}-000001`,
      paymentStatus: "Pending",
      amountPaid: 0,
      outstandingBalance: 500,
    });
    const second = await recordViolation({ violatorName: "TESTER JUAN", ...ticket({ amount: 1000 }) });
    expect(second.createdProfile).toBe(false);
    expect(second.violator.id).toBe(first.violator.id);
    expect(await listViolations(first.violator.id)).toHaveLength(2);
    expect((await findViolatorByName("tester, juan"))?.id).toBe(first.violator.id);
  });

  it("keeps one profile per name when profiles are added or renamed by hand", async () => {
    const a = await createViolator({ fullName: "Sample, Ana" });
    await expect(createViolator({ fullName: "SAMPLE ANA" })).rejects.toThrow(
      "A violator profile with that name already exists.",
    );
    const b = await createViolator({ fullName: "Sample, Ben" });
    await expect(updateViolator(b.id, { fullName: "Sample Ana" })).rejects.toThrow(
      "A violator profile with that name already exists.",
    );
    // Renaming frees the old name for someone else.
    await updateViolator(a.id, { fullName: "Sample, Anabel", contactNumber: "0917 000 0000" });
    await expect(createViolator({ fullName: "Sample, Ana" })).resolves.toMatchObject({ fullName: "Sample, Ana" });
    expect((await listViolators("sample")).map((v) => v.fullName)).toEqual(["Sample, Ana", "Sample, Anabel", "Sample, Ben"]);
  });

  it("a deleted profile frees its name", async () => {
    const a = await createViolator({ fullName: "Sample, Carlo" });
    await deleteViolators([a.id]);
    await expect(createViolator({ fullName: "Sample, Carlo" })).resolves.toBeTruthy();
  });

  it("takes full payment only, then keeps the amount; a cancelled ticket takes no payment", async () => {
    const { violation } = await recordViolation({ violatorName: "Tester, Pedro", ...ticket() });
    const pay = { paymentDate: "2026-10-16", orNumber: "OR-TEST-1", amountPaid: 500 };
    await expect(recordPayment(violation.id, { ...pay, amountPaid: 600 })).rejects.toThrow(
      "The payment cannot be more than the assessed amount.",
    );
    await expect(recordPayment(violation.id, { ...pay, amountPaid: 200 })).rejects.toThrow(/partial payments/);
    const paid = await recordPayment(violation.id, pay);
    expect(paid).toMatchObject({ paymentStatus: "Paid", amountPaid: 500, outstandingBalance: 0 });
    await expect(updateViolation(violation.id, ticket({ amount: 900 }))).rejects.toThrow(/can no longer be changed/);
    await expect(cancelViolation(violation.id, "Too late")).rejects.toThrow(/can no longer be cancelled/);

    const other = await recordViolation({ violatorName: "Tester, Pedro", ...ticket() });
    const cancelled = await cancelViolation(other.violation.id, "Issued in error");
    expect(cancelled).toMatchObject({
      paymentStatus: "Cancelled",
      cancelReason: "Issued in error",
      cancelledBy: "admin@alaminos.gov.ph",
      outstandingBalance: 500,
    });
    expect(cancelled.cancelledAt).toBeTruthy();
    await expect(cancelViolation(other.violation.id, "Again")).rejects.toThrow();
    await expect(recordPayment(other.violation.id, pay)).rejects.toThrow("A cancelled violation cannot take a payment.");
  });

  it("a ticket is cancelled with a reason, never deleted; a profile with tickets is archived", async () => {
    const { violator, violation } = await recordViolation({ violatorName: "Tester, Rosa", ...ticket() });
    await expect(cancelViolation(violation.id, " ")).rejects.toThrow(/reason/i);
    await expect(deleteViolations([violation.id])).rejects.toThrow("Tickets are cancelled with a reason, not deleted.");
    await expect(deleteViolators([violator.id])).rejects.toThrow(/holds official records.*Archive it instead/);
    expect((await listViolations(violator.id)).map((v) => v.violationNo)).toEqual([violation.violationNo]);
    expect(await archiveViolator(violator.id, true)).toMatchObject({ archived: true, archivedBy: "admin@alaminos.gov.ph" });

    // Archived: no new ticket, and trying never restores it (2026-10-21).
    await expect(recordViolation({ violatorName: "Tester, Rosa", ...ticket() })).rejects.toThrow(
      "This violator profile is archived. An Administrator must restore it before new records can be added.",
    );
    // A ticket issued before the archive can still be paid (approved 2026-10-21).
    await expect(
      recordPayment(violation.id, { paymentDate: "2026-10-16", orNumber: "OR-TEST-9", amountPaid: 500 }),
    ).resolves.toMatchObject({ paymentStatus: "Paid", outstandingBalance: 0 });
    expect((await listViolators("rosa"))[0]).toMatchObject({ archived: true });
    expect(await listViolations(violator.id)).toHaveLength(1);
    await archiveViolator(violator.id, false);
    await expect(recordViolation({ violatorName: "Tester, Rosa", ...ticket() })).resolves.toBeTruthy();
  });

  it("is recorded by Administrators only", async () => {
    await signInAs("dept@alaminos.gov.ph");
    await expect(recordViolation({ violatorName: "Tester, Jose", ...ticket() })).rejects.toThrow(/permission/);
    await signInAs("viewer@alaminos.gov.ph");
    expect(await listViolators()).toEqual([]);
  });
});
