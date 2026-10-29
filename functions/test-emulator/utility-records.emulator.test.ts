import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Corrections and voids of finalized utility records (policy 2026-10-20):
 * previous values kept, financial history preserved, voided records out of
 * active use, one active bill per account and month. Synthetic data only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;
let EA: string;
let FV: string;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin, uid: adminUid } = await accountToken("admin@alaminos.gov.ph"));
  // Fresh parent ids per test (late cascade deletes cannot reach this test's records).
  const run = Math.random().toString(36).slice(2, 8);
  [EA, FV] = [`ea-${run}`, `fv-${run}`];
  await db.doc(`energy_accounts/${EA}`).set({ id: EA, account_number: "ACC-TEST" });
  await db.doc(`fuel_vehicles/${FV}`).set({ id: FV, plate_number: "TST 001", km_per_liter: 10 });
});

const bill = (month = 9, amount = 12000) => ({
  type: "EC",
  record: { account_id: EA, billing_month: month, billing_year: 2026, amount, kwh: 800, remarks: null },
});
const newBill = async (month = 9) => String((await call("createNumberedRecord", bill(month), admin)).result?.id);

describe("correcting a finalized record", () => {
  it("changes only the values, keeps the number, and records before, after, reason, who and when", async () => {
    const id = await newBill();
    const number = (await db.doc(`energy_bills/${id}`).get()).get("doc_number");
    const res = await call(
      "correctUtilityRecord",
      { type: "EC", id, changes: { amount: 12500.5, kwh: 800, remarks: "Per corrected statement" }, reason: "Meter re-read by the utility" },
      admin,
    );
    expect(res.error).toBeUndefined();
    const saved = (await db.doc(`energy_bills/${id}`).get()).data()!;
    expect(saved).toMatchObject({ amount: 12500.5, doc_number: number, updated_by_uid: adminUid });
    expect(saved.revisions).toHaveLength(1);
    expect(saved.revisions[0]).toMatchObject({
      by: "admin@alaminos.gov.ph",
      by_uid: adminUid,
      reason: "Meter re-read by the utility",
      changes: { amount: { from: 12000, to: 12500.5 }, remarks: { from: null, to: "Per corrected statement" } },
    });
    expect(saved.revisions[0].changes.kwh).toBeUndefined();
  });

  it("records a purchase's recomputed total among the changes", async () => {
    const txn = await call(
      "createNumberedRecord",
      { type: "FC", record: { vehicle_id: FV, txn_date: "2026-10-01", fuel_type: "Diesel", liters: 40, price_per_liter: 62.5, driver: null, odometer: null, remarks: null } },
      admin,
    );
    const id = String(txn.result?.id);
    await call(
      "correctUtilityRecord",
      { type: "FC", id, changes: { txn_date: "2026-10-01", fuel_type: "Diesel", liters: 30, price_per_liter: 62.5, driver: null, odometer: null, remarks: null }, reason: "Receipt shows 30 L" },
      admin,
    );
    const saved = (await db.doc(`fuel_transactions/${id}`).get()).data()!;
    expect(saved.total_amount).toBe(1875);
    expect(saved.revisions[0].changes).toMatchObject({ liters: { from: 40, to: 30 }, total_amount: { from: 2500, to: 1875 } });
  });

  it("recomputes a trip's fuel and refuses an odometer that goes backwards", async () => {
    const trip = {
      trip_date: "2026-10-05", purpose: null, origin: null, destination: null, driver: null, passengers: null,
      no_of_trips: 1, source: "Manual", beginning_odometer: 1000, ending_odometer: 1080, km_per_liter: 10,
      beginning_fuel: 20, fuel_added: 5, status: "Completed", remarks: null,
    };
    const id = String((await call("createFuelTrip", { record: { vehicle_id: FV, ...trip } }, admin)).result?.id);
    const bad = await call("correctUtilityRecord", { type: "TRIP", id, changes: { ...trip, ending_odometer: 900 }, reason: "x" }, admin);
    expect(bad.error?.message).toBe("Odometer IN cannot be lower than Odometer OUT.");
    await call("correctUtilityRecord", { type: "TRIP", id, changes: { ...trip, ending_odometer: 1100 }, reason: "Odometer misread" }, admin);
    expect((await db.doc(`fuel_trips/${id}`).get()).data()).toMatchObject({ distance_travelled: 100, fuel_used: 10, ending_fuel: 15 });
  });

  it("needs a reason, a real change and an account; a voided record is not corrected", async () => {
    const id = await newBill();
    const same = { amount: 12000, kwh: 800, remarks: null };
    expect((await call("correctUtilityRecord", { type: "EC", id, changes: same, reason: "" }, admin)).error?.status).toBe("INVALID_ARGUMENT");
    expect((await call("correctUtilityRecord", { type: "EC", id, changes: same, reason: "Check" }, admin)).error?.message).toMatch(
      /Nothing was changed/,
    );
    expect((await call("correctUtilityRecord", { type: "EC", id, changes: { ...same, amount: 1 }, reason: "x" })).error?.status).toBe(
      "PERMISSION_DENIED",
    );
    await call("voidUtilityRecord", { type: "EC", id, reason: "Duplicate" }, admin);
    expect((await call("correctUtilityRecord", { type: "EC", id, changes: { ...same, amount: 1 }, reason: "x" }, admin)).error?.message).toMatch(
      /voided/,
    );
  });

  it("cannot touch the account, the period or the number", async () => {
    const id = await newBill();
    const res = await call(
      "correctUtilityRecord",
      { type: "EC", id, changes: { amount: 1, kwh: 1, remarks: null, billing_month: 1, doc_number: "EC-2026-999999" }, reason: "x" },
      admin,
    );
    expect(res.error?.message).toMatch(/Unexpected field/);
  });
});

describe("voiding a finalized record", () => {
  it("keeps the record and its values, marks it with the reason, who and when", async () => {
    const id = await newBill();
    const res = await call("voidUtilityRecord", { type: "EC", id, reason: "Billed to the wrong account" }, admin);
    expect(res.error).toBeUndefined();
    expect((await db.doc(`energy_bills/${id}`).get()).data()).toMatchObject({
      amount: 12000,
      voided: true,
      void_reason: "Billed to the wrong account",
      voided_by: "admin@alaminos.gov.ph",
      voided_by_uid: adminUid,
    });
    expect((await call("voidUtilityRecord", { type: "EC", id, reason: "Again" }, admin)).error?.message).toMatch(/already voided/);
  });

  it("frees the month, so the corrected bill is recorded under a new number; the voided one stays", async () => {
    const id = await newBill();
    expect((await call("createNumberedRecord", bill(9, 13000), admin)).error?.status).toBe("ALREADY_EXISTS");
    await call("voidUtilityRecord", { type: "EC", id, reason: "Wrong amount; re-recording" }, admin);
    const again = await call("createNumberedRecord", bill(9, 13000), admin);
    expect(again.error).toBeUndefined();
    expect(again.result?.id).not.toBe(id);
    const bills = (await db.collection("energy_bills").get()).docs.map((d) => d.data());
    expect(bills).toHaveLength(2);
    expect(bills.filter((b) => b.voided !== true).map((b) => b.amount)).toEqual([13000]);
    // And the month is held again.
    expect((await call("createNumberedRecord", bill(9, 1), admin)).error?.status).toBe("ALREADY_EXISTS");
  });

  it("of simultaneous bills for one month, exactly one is saved", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => call("createNumberedRecord", bill(10), admin)));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect((await db.collection("energy_bills").where("billing_month", "==", 10).get()).size).toBe(1);
  });

  it("needs a reason and an account", async () => {
    const id = await newBill();
    expect((await call("voidUtilityRecord", { type: "EC", id, reason: "  " }, admin)).error?.status).toBe("INVALID_ARGUMENT");
    expect((await call("voidUtilityRecord", { type: "EC", id, reason: "x" })).error?.status).toBe("PERMISSION_DENIED");
    expect((await db.doc(`energy_bills/${id}`).get()).get("voided")).toBeUndefined();
  });
});
