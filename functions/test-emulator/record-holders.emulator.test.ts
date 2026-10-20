import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, staffToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Final hardening (approved 2026-10-21): holders of official records are
 * archived, not deleted; unnumbered entries keep their correction history;
 * a trip stays in its control number's month. Synthetic data only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;
let run: string;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin, uid: adminUid } = await staffToken("admin@alaminos.gov.ph", "Administrator"));
  // Fresh ids per test, out of reach of the previous test's late cascades.
  run = Math.random().toString(36).slice(2, 8);
});

async function account(id: string, number: string) {
  await db.doc(`energy_accounts/${id}`).set({ id, account_number: number });
  await db.doc(`unique_keys/energy_accounts.account_number:${number}`).set({ collection: "energy_accounts", doc_id: id });
}

const bill = (accountId: string, month = 9) => ({
  type: "EC",
  record: { account_id: accountId, billing_month: month, billing_year: 2026, amount: 1000, kwh: 50, remarks: null },
});

describe("holders of official records are kept, not deleted", () => {
  it("deletes an empty account and releases its number", async () => {
    await account(`ea-${run}`, `E-${run}`);
    const res = await call("deleteRecordHolders", { collection: "energy_accounts", ids: [`ea-${run}`] }, admin);
    expect(res.result).toEqual({ deleted: [`ea-${run}`], kept: [] });
    expect((await db.doc(`unique_keys/energy_accounts.account_number:E-${run}`).get()).exists).toBe(false);
  });

  it("keeps an account with bills — voided ones too — and says why; deletes the empty ones beside it", async () => {
    const [full, empty] = [`ea-${run}-a`, `ea-${run}-b`];
    await account(full, `E-${run}-A`);
    await account(empty, `E-${run}-B`);
    const id = String((await call("createNumberedRecord", bill(full), admin)).result?.id);
    await call("voidUtilityRecord", { type: "EC", id, reason: "Wrong account" }, admin);
    const res = await call("deleteRecordHolders", { collection: "energy_accounts", ids: [full, empty] }, admin);
    expect(res.result?.deleted).toEqual([empty]);
    expect(res.result?.kept).toEqual([
      { id: full, name: `E-${run}-A`, reason: "This account holds official records, which are never deleted. Archive it instead." },
    ]);
    expect((await db.doc(`energy_accounts/${full}`).get()).exists).toBe(true);
    expect((await db.collection("energy_bills").where("account_id", "==", full).get()).size).toBe(1);
  });

  it("keeps a vehicle with any trip, purchase or reading, and a profile with a ticket", async () => {
    await db.doc(`fuel_vehicles/fv-${run}`).set({ id: `fv-${run}`, plate_number: `P-${run}` });
    await db.doc(`fuel_odometer_readings/fod-${run}`).set({ id: `fod-${run}`, vehicle_id: `fv-${run}`, previous_odometer: 1, current_odometer: 2 });
    const v = await call("deleteRecordHolders", { collection: "fuel_vehicles", ids: [`fv-${run}`] }, admin);
    expect(v.result?.kept[0].reason).toMatch(/Set it Inactive instead/);

    const t = await call("recordViolation", {
      violatorName: `Tester ${run}`,
      record: { violation_type: "Illegal parking", description: null, date_issued: "2026-10-15", amount: 500, remarks: null, apprehended_by: null, citation_no: null },
    }, admin);
    const profile = String((t.result?.violator as { id: string } | undefined)?.id);
    const p = await call("deleteRecordHolders", { collection: "violators", ids: [profile] }, admin);
    expect(p.result?.kept[0].reason).toMatch(/Archive it instead/);
    expect((await db.doc(`violators/${profile}`).get()).exists).toBe(true);
  });

  it("an account deleted while a bill is saved for it never leaves an orphaned bill", async () => {
    for (let i = 0; i < 4; i++) {
      const id = `ea-${run}-${i}`;
      await account(id, `E-${run}-${i}`);
      await Promise.all([
        call("createNumberedRecord", bill(id), admin),
        call("deleteRecordHolders", { collection: "energy_accounts", ids: [id] }, admin),
      ]);
      const exists = (await db.doc(`energy_accounts/${id}`).get()).exists;
      const bills = (await db.collection("energy_bills").where("account_id", "==", id).get()).size;
      // Either the account stayed (with its bill), or it went and no bill was saved.
      if (!exists) expect(bills).toBe(0);
      else expect(bills).toBeLessThanOrEqual(1);
    }
  });

  it("archives and restores an account, with who and when, for Administrators only", async () => {
    await account(`ea-${run}`, `E-${run}`);
    const a = await call("setRecordHolderArchived", { collection: "energy_accounts", id: `ea-${run}`, archived: true }, admin);
    expect(a.error).toBeUndefined();
    expect((await db.doc(`energy_accounts/ea-${run}`).get()).data()).toMatchObject({
      archived: true,
      archived_by: "admin@alaminos.gov.ph",
      archived_by_uid: adminUid,
    });
    await call("setRecordHolderArchived", { collection: "energy_accounts", id: `ea-${run}`, archived: false }, admin);
    expect((await db.doc(`energy_accounts/ea-${run}`).get()).data()).toMatchObject({ archived: false, restored_by: "admin@alaminos.gov.ph" });
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await call("setRecordHolderArchived", { collection: "energy_accounts", id: `ea-${run}`, archived: true }, dept)).error?.status).toBe(
      "PERMISSION_DENIED",
    );
    expect((await call("deleteRecordHolders", { collection: "energy_accounts", ids: [`ea-${run}`] }, dept)).error?.status).toBe(
      "PERMISSION_DENIED",
    );
    expect((await call("setRecordHolderArchived", { collection: "purchase_orders", id: "x", archived: true }, admin)).error?.status).toBe(
      "INVALID_ARGUMENT",
    );
  });
});

describe("unnumbered entries keep their correction history", () => {
  it("a water reading's correction recomputes consumption and keeps before and after", async () => {
    await db.doc(`water_meter_readings/wmr-${run}`).set({
      id: `wmr-${run}`, submeter_id: "ws-1", reading_date: "2026-10-01", previous_reading: 100, current_reading: 130,
      consumption: 30, amount: 600, remarks: null,
    });
    const changes = { reading_date: "2026-10-01", previous_reading: 100, current_reading: 125, amount: 500, remarks: null };
    const res = await call("correctUtilityRecord", { type: "WMR", id: `wmr-${run}`, changes, reason: "Meter re-read" }, admin);
    expect(res.error).toBeUndefined();
    const saved = (await db.doc(`water_meter_readings/wmr-${run}`).get()).data()!;
    expect(saved.consumption).toBe(25);
    expect(saved.revisions[0]).toMatchObject({
      reason: "Meter re-read",
      changes: { current_reading: { from: 130, to: 125 }, consumption: { from: 30, to: 25 }, amount: { from: 600, to: 500 } },
    });
    const back = await call("correctUtilityRecord", { type: "WMR", id: `wmr-${run}`, changes: { ...changes, current_reading: 90 }, reason: "x" }, admin);
    expect(back.error?.message).toBe("The current reading cannot be lower than the previous reading.");
  });

  it("odometer readings and submeter bills are corrected the same way", async () => {
    await db.doc(`fuel_odometer_readings/fod-${run}`).set({
      id: `fod-${run}`, vehicle_id: "fv-1", reading_date: "2026-10-01", previous_odometer: 1000, current_odometer: 1200,
      distance: 200, fuel_cost: 0, fuel_liters: 0, remarks: null,
    });
    await call(
      "correctUtilityRecord",
      { type: "ODO", id: `fod-${run}`, changes: { reading_date: "2026-10-01", previous_odometer: 1000, current_odometer: 1150, fuel_cost: 0, fuel_liters: 0, remarks: null }, reason: "Typo" },
      admin,
    );
    expect((await db.doc(`fuel_odometer_readings/fod-${run}`).get()).get("distance")).toBe(150);

    await db.doc(`energy_submeter_bills/esb-${run}`).set({ id: `esb-${run}`, submeter_id: "es-1", consumption: 120, amount: 1800, remarks: null });
    await call("correctUtilityRecord", { type: "ESB", id: `esb-${run}`, changes: { consumption: 120, amount: 1750, remarks: null }, reason: "Rate fixed" }, admin);
    expect((await db.doc(`energy_submeter_bills/esb-${run}`).get()).get("revisions")[0].changes).toEqual({ amount: { from: 1800, to: 1750 } });
  });
});

/* ---------------- approved 2026-10-21: archived or inactive holders take no new records ---------------- */

const ticket = { violation_type: "Illegal parking", description: null, date_issued: "2026-10-15", amount: 500, remarks: null, apprehended_by: null, citation_no: null };
const subBill = (submeterId: string, month = 9) => ({
  submeter_id: submeterId, billing_month: month, billing_year: 2026, consumption: 10, amount: 150, remarks: null,
});
const reading = (submeterId: string) => ({
  submeter_id: submeterId, reading_date: "2026-10-01", previous_reading: 100, current_reading: 130, amount: 600, remarks: null,
});
const odometer = (vehicleId: string) => ({
  vehicle_id: vehicleId, reading_date: "2026-10-01", previous_odometer: 1000, current_odometer: 1200, fuel_cost: 0, fuel_liters: 0, remarks: null,
});
const tripOf = (vehicleId: string) => ({
  vehicle_id: vehicleId, trip_date: "2026-10-05", purpose: null, origin: null, destination: null, driver: null, passengers: null,
  no_of_trips: 1, source: "Manual", beginning_odometer: 1000, ending_odometer: 1080, km_per_liter: 10, beginning_fuel: 20,
  fuel_added: 5, status: "Completed", remarks: null,
});
const purchaseOf = (vehicleId: string) => ({
  type: "FC",
  record: { vehicle_id: vehicleId, txn_date: "2026-10-03", fuel_type: "Diesel", liters: 10, price_per_liter: 60, driver: null, odometer: null, remarks: null },
});

describe("archived or inactive holders take no new records", () => {
  it("an archived account refuses new bills and submeter bills, keeps its old ones correctable, and takes them again once restored", async () => {
    await account(`ea-${run}`, `E-${run}`);
    await db.doc(`energy_submeters/es-${run}`).set({ id: `es-${run}`, account_id: `ea-${run}`, submeter_number: "S-1", status: "Active" });
    const first = String((await call("createNumberedRecord", bill(`ea-${run}`, 8), admin)).result?.id);
    await call("setRecordHolderArchived", { collection: "energy_accounts", id: `ea-${run}`, archived: true }, admin);

    const closed = "This energy account is archived. An Administrator must restore it before new records can be added.";
    expect((await call("createNumberedRecord", bill(`ea-${run}`), admin)).error?.message).toBe(closed);
    expect((await call("createUtilityEntry", { type: "ESB", record: subBill(`es-${run}`) }, admin)).error?.message).toBe(closed);
    expect((await db.collection("energy_bills").where("account_id", "==", `ea-${run}`).get()).size).toBe(1);
    // Existing records stay correctable: a correction is not a new transaction.
    const fixed = await call(
      "correctUtilityRecord",
      { type: "EC", id: first, changes: { amount: 900, kwh: 50, remarks: null }, reason: "Statement reissued" },
      admin,
    );
    expect(fixed.error).toBeUndefined();
    const voided = await call("voidUtilityRecord", { type: "EC", id: first, reason: "Duplicate statement" }, admin);
    expect(voided.result).toMatchObject({ voided: true, voided_by_uid: adminUid });
    expect((await db.doc(`energy_bills/${first}`).get()).get("revisions")).toHaveLength(1);

    await call("setRecordHolderArchived", { collection: "energy_accounts", id: `ea-${run}`, archived: false }, admin);
    expect((await call("createNumberedRecord", bill(`ea-${run}`), admin)).error).toBeUndefined();
    expect((await call("createUtilityEntry", { type: "ESB", record: subBill(`es-${run}`) }, admin)).error).toBeUndefined();
  });

  it("an inactive or archived submeter refuses new bills and readings", async () => {
    await account(`ea-${run}`, `E-${run}`);
    await db.doc(`energy_submeters/es-${run}`).set({ id: `es-${run}`, account_id: `ea-${run}`, submeter_number: "S-1", status: "Inactive" });
    await db.doc(`water_submeters/ws-${run}`).set({ id: `ws-${run}`, account_id: "wa-none", submeter_number: "W-1", status: "Archived" });
    expect((await call("createUtilityEntry", { type: "ESB", record: subBill(`es-${run}`) }, admin)).error?.message).toBe(
      "This submeter is inactive. Set it Active again before new records can be added.",
    );
    for (const [type, record] of [["WSB", subBill(`ws-${run}`)], ["WMR", reading(`ws-${run}`)]] as const) {
      expect((await call("createUtilityEntry", { type, record }, admin)).error?.message).toBe(
        "This submeter is archived. Set it Active again before new records can be added.",
      );
    }
    await db.doc(`water_submeters/ws-${run}`).update({ status: "Active" });
    expect((await call("createUtilityEntry", { type: "WMR", record: reading(`ws-${run}`) }, admin)).result).toMatchObject({ consumption: 30 });
  });

  it("an inactive vehicle refuses new trips, purchases and odometer readings", async () => {
    await db.doc(`fuel_vehicles/fv-${run}`).set({ id: `fv-${run}`, plate_number: `P-${run}`, status: "Inactive" });
    const closed = "This vehicle is inactive. Set it Active again before new records can be added.";
    expect((await call("createFuelTrip", { record: tripOf(`fv-${run}`) }, admin)).error?.message).toBe(closed);
    expect((await call("createNumberedRecord", purchaseOf(`fv-${run}`), admin)).error?.message).toBe(closed);
    expect((await call("createUtilityEntry", { type: "ODO", record: odometer(`fv-${run}`) }, admin)).error?.message).toBe(closed);
    for (const c of ["fuel_trips", "fuel_transactions", "fuel_odometer_readings"]) {
      expect((await db.collection(c).where("vehicle_id", "==", `fv-${run}`).get()).size).toBe(0);
    }
    // Nothing was numbered for the refused records.
    expect((await db.doc("document_counters/TRIP-2026-10").get()).exists).toBe(false);
  });

  it("an archived profile refuses new tickets by name or by profile, and is never restored by trying", async () => {
    const first = await call("recordViolation", { violatorName: `Tester ${run}`, record: ticket }, admin);
    const profile = String((first.result?.violator as { id: string } | undefined)?.id);
    await call("setRecordHolderArchived", { collection: "violators", id: profile, archived: true }, admin);
    const closed = "This violator profile is archived. An Administrator must restore it before new records can be added.";
    expect((await call("recordViolation", { violatorName: `Tester ${run}`, record: ticket }, admin)).error?.message).toBe(closed);
    expect((await call("createNumberedRecord", { type: "VT", record: { ...ticket, violator_id: profile } }, admin)).error?.message).toBe(closed);
    expect((await db.doc(`violators/${profile}`).get()).get("archived")).toBe(true);
    expect((await db.collection("violations").where("violator_id", "==", profile).get()).size).toBe(1);
    expect((await db.collection("violators").where("name_key", "==", `tester ${run}`).get()).size).toBe(1);
  });

  it("a profile archived while a ticket is being recorded never gains a ticket after its archive", async () => {
    const first = await call("recordViolation", { violatorName: `Racer ${run}`, record: ticket }, admin);
    const profile = String((first.result?.violator as { id: string } | undefined)?.id);
    await Promise.all([
      call("setRecordHolderArchived", { collection: "violators", id: profile, archived: true }, admin),
      call("recordViolation", { violatorName: `Racer ${run}`, record: ticket }, admin),
    ]);
    const archivedAt = String((await db.doc(`violators/${profile}`).get()).get("archived_at"));
    const tickets = await db.collection("violations").where("violator_id", "==", profile).get();
    for (const t of tickets.docs) expect(String(t.get("created_at")) <= archivedAt).toBe(true);
  });
});

describe("submeter bills and readings are voided, never deleted", () => {
  it("a voided submeter bill stays on file and gives its month up to the replacement", async () => {
    await db.doc(`energy_submeters/es-${run}`).set({ id: `es-${run}`, account_id: "ea-none", submeter_number: "S-1", status: "Active" });
    const first = await call("createUtilityEntry", { type: "ESB", record: subBill(`es-${run}`) }, admin);
    const firstId = String(first.result?.id);
    expect(firstId).toBe(`esb-es-${run}-2026-09`);
    expect((await call("createUtilityEntry", { type: "ESB", record: subBill(`es-${run}`) }, admin)).error?.message).toBe(
      "A bill for that submeter and billing period already exists.",
    );
    const voided = await call("voidUtilityRecord", { type: "ESB", id: firstId, reason: "Wrong submeter" }, admin);
    expect(voided.result).toMatchObject({ voided: true, void_reason: "Wrong submeter", voided_by: "admin@alaminos.gov.ph" });
    const second = await call("createUtilityEntry", { type: "ESB", record: { ...subBill(`es-${run}`), amount: 175 } }, admin);
    expect(String(second.result?.id)).toMatch(new RegExp(`^esb-es-${run}-2026-09-`));
    const all = await db.collection("energy_submeter_bills").where("submeter_id", "==", `es-${run}`).get();
    expect(all.docs.map((d) => [d.get("amount"), d.get("voided") === true]).sort()).toEqual([[150, true], [175, false]]);
    expect((await call("correctUtilityRecord", { type: "ESB", id: firstId, changes: { consumption: 1, amount: 1, remarks: null }, reason: "x" }, admin)).error?.message).toBe(
      "A voided submeter bill cannot be corrected.",
    );
  });

  it("of simultaneous submeter bills for one month, exactly one is saved", async () => {
    await db.doc(`water_submeters/ws-${run}`).set({ id: `ws-${run}`, account_id: "wa-none", submeter_number: "W-1", status: "Active" });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => call("createUtilityEntry", { type: "WSB", record: subBill(`ws-${run}`) }, admin)),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect((await db.collection("water_submeter_bills").where("submeter_id", "==", `ws-${run}`).get()).size).toBe(1);
  });

  it("readings are voided with the reason, who and when; only an Administrator records or voids them", async () => {
    await db.doc(`fuel_vehicles/fv-${run}`).set({ id: `fv-${run}`, plate_number: `P-${run}`, status: "Active" });
    const created = await call("createUtilityEntry", { type: "ODO", record: odometer(`fv-${run}`) }, admin);
    expect(created.result).toMatchObject({ distance: 200, created_by_uid: adminUid });
    const id = String(created.result?.id);
    expect((await call("createUtilityEntry", { type: "ODO", record: { ...odometer(`fv-${run}`), current_odometer: 900 } }, admin)).error?.message).toBe(
      "The current odometer cannot be lower than the previous reading.",
    );
    expect((await call("voidUtilityRecord", { type: "ODO", id, reason: " " }, admin)).error?.status).toBe("INVALID_ARGUMENT");
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await call("createUtilityEntry", { type: "ODO", record: odometer(`fv-${run}`) }, dept)).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("voidUtilityRecord", { type: "ODO", id, reason: "x" }, dept)).error?.status).toBe("PERMISSION_DENIED");
    await call("voidUtilityRecord", { type: "ODO", id, reason: "Duplicate entry" }, admin);
    expect((await db.doc(`fuel_odometer_readings/${id}`).get()).data()).toMatchObject({
      voided: true, void_reason: "Duplicate entry", voided_by_uid: adminUid, distance: 200,
    });
    expect((await call("createUtilityEntry", { type: "XYZ", record: {} }, admin)).error?.status).toBe("INVALID_ARGUMENT");
  });
});

describe("a trip stays in its control number's month", () => {
  it("refuses moving a trip to another month, and allows another day of the same month", async () => {
    await db.doc(`fuel_vehicles/fv-${run}`).set({ id: `fv-${run}`, plate_number: `P-${run}` });
    const trip = {
      trip_date: "2026-10-05", purpose: null, origin: null, destination: null, driver: null, passengers: null, no_of_trips: 1,
      source: "Manual", beginning_odometer: 1000, ending_odometer: 1080, km_per_liter: 10, beginning_fuel: 20, fuel_added: 5,
      status: "Completed", remarks: null,
    };
    const created = await call("createFuelTrip", { record: { vehicle_id: `fv-${run}`, ...trip } }, admin);
    const id = String(created.result?.id);
    expect(created.result?.control_no).toBe("2026-10-0001");
    const moved = await call("correctUtilityRecord", { type: "TRIP", id, changes: { ...trip, trip_date: "2026-11-02" }, reason: "Wrong month" }, admin);
    expect(moved.error?.message).toMatch(/Trip 2026-10-0001 belongs to 2026-10; its date must stay in that month/);
    const sameMonth = await call("correctUtilityRecord", { type: "TRIP", id, changes: { ...trip, trip_date: "2026-10-28" }, reason: "Wrong day" }, admin);
    expect(sameMonth.error).toBeUndefined();
    expect((await db.doc(`fuel_trips/${id}`).get()).data()).toMatchObject({ control_no: "2026-10-0001", trip_date: "2026-10-28" });
  });
});
