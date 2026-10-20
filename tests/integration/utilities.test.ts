import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveEnergyAccount,
  correctEnergySubmeterBill,
  createEnergyAccount,
  createEnergyBill,
  createEnergySubmeter,
  createEnergySubmeterBill,
  deleteEnergyAccounts,
  deleteEnergySubmeterBills,
  listEnergyAccounts,
  listEnergyBills,
  listEnergySubmeterBills,
  listEnergySubmeters,
  updateEnergyAccount,
  correctEnergyBill,
  updateEnergyBill,
  voidEnergyBill,
  voidEnergySubmeterBill,
} from "@/features/energy/api";
import {
  createFuelOdometerReading,
  createFuelTransaction,
  createFuelTrip,
  createFuelVehicle,
  correctFuelTrip,
  correctFuelTransaction,
  correctFuelOdometerReading,
  deleteFuelTrips,
  deleteFuelVehicles,
  getFuelVehicle,
  updateFuelOdometerReading,
  updateFuelVehicle,
  voidFuelOdometerReading,
  listFuelTransactions,
  listFuelTrips,
  updateFuelTrip,
  voidFuelTransaction,
  voidFuelTrip,
  type TripDraftInput,
} from "@/features/fuel/api";
import {
  createWaterAccount,
  createWaterBill,
  createWaterMeterReading,
  createWaterSubmeter,
  listWaterBills,
  archiveWaterAccount,
  correctWaterMeterReading,
  deleteWaterMeterReadings,
  listWaterMeterReadings,
  voidWaterMeterReading,
  updateWaterMeterReading,
} from "@/features/water/api";

import { createTeam, manilaYear, resetEmulators, signInAs } from "./setup";

/** Synthetic accounts and vehicles only; no real municipal records. */

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
  await signInAs("admin@alaminos.gov.ph");
});

const account = (n: string) => ({
  accountNumber: `TEST-${n}`,
  accountName: `Test account ${n}`,
  location: "Municipal Hall",
  meterNumber: `M-${n}`,
});

describe("Energy on Firestore", () => {
  it("registers accounts once per number and lists them", async () => {
    await createEnergyAccount(account("001"));
    await expect(createEnergyAccount(account("001"))).rejects.toThrow("That account number is already registered.");
    await createEnergyAccount({ ...account("002"), location: "Public Market" });
    expect((await listEnergyAccounts({ location: "Public Market" })).map((a) => a.accountNumber)).toEqual(["TEST-002"]);
    expect((await listEnergyAccounts({ search: "test account 001" })).length).toBe(1);
  });

  it("numbers bills (EC) in the server, one per account and month", async () => {
    const acct = await createEnergyAccount(account("001"));
    const bill = await createEnergyBill({ accountId: acct.id, billingMonth: 9, billingYear: 2026, amount: 12500.5, kwh: 840 });
    expect(bill.docNumber).toBe(`EC-${manilaYear()}-000001`);
    await expect(
      createEnergyBill({ accountId: acct.id, billingMonth: 9, billingYear: 2026, amount: 1, kwh: 1 }),
    ).rejects.toThrow("A bill for that account and billing period already exists.");
    await createEnergyBill({ accountId: acct.id, billingMonth: 10, billingYear: 2026, amount: 9000, kwh: 600 });
    // Policy 2026-10-20: a finalized bill is corrected with a reason, keeping the previous values.
    await expect(updateEnergyBill(bill.id, { amount: 13000, kwh: 860 })).rejects.toThrow(/corrected with a reason/);
    const corrected = await correctEnergyBill(bill.id, { amount: 13000, kwh: 860, remarks: "Corrected" }, "Utility reissued the bill");
    expect(corrected).toMatchObject({ amount: 13000, docNumber: bill.docNumber });
    expect(corrected.revisions?.[0]).toMatchObject({
      reason: "Utility reissued the bill",
      by: "admin@alaminos.gov.ph",
      changes: { amount: { from: 12500.5, to: 13000 }, kwh: { from: 840, to: 860 } },
    });
    const bills = await listEnergyBills({ accountId: acct.id, fromYear: 2026, fromMonth: 10, toYear: 2026, toMonth: 12 });
    expect(bills.map((b) => b.billingMonth)).toEqual([10]);

    // A voided bill leaves active lists and totals but stays on file; its month is free again.
    await voidEnergyBill(bill.id, "Recorded against the wrong account");
    expect((await listEnergyBills({ accountId: acct.id })).map((b) => b.billingMonth)).toEqual([10]);
    const history = await listEnergyBills({ accountId: acct.id, includeVoided: true });
    expect(history.find((b) => b.id === bill.id)).toMatchObject({ voided: true, voidReason: "Recorded against the wrong account", amount: 13000 });
    await expect(createEnergyBill({ accountId: acct.id, billingMonth: 9, billingYear: 2026, amount: 1, kwh: 1 })).resolves.toBeTruthy();
  });

  it("keeps submeter numbers unique per account, and one submeter bill per month", async () => {
    const acct = await createEnergyAccount(account("001"));
    const sub = await createEnergySubmeter({
      accountId: acct.id, submeterName: "GSO wing", submeterNumber: "S-1", officeCode: "GSO", status: "Active",
    });
    await expect(
      createEnergySubmeter({ accountId: acct.id, submeterName: "Copy", submeterNumber: "S-1", officeCode: "GSO", status: "Active" }),
    ).rejects.toThrow("That submeter number already exists on this account.");
    await createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 9, billingYear: 2026, consumption: 120, amount: 1800 });
    await expect(
      createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 9, billingYear: 2026, consumption: 1, amount: 1 }),
    ).rejects.toThrow("A bill for that submeter and billing period already exists.");
    expect(await listEnergySubmeters({ accountId: acct.id })).toHaveLength(1);
  });

  it("an account that holds bills is kept and archived, never deleted; an empty one beside it is deleted", async () => {
    const acct = await createEnergyAccount(account("001"));
    const empty = await createEnergyAccount(account("002"));
    const bill = await createEnergyBill({ accountId: acct.id, billingMonth: 9, billingYear: 2026, amount: 1, kwh: 1 });
    const sub = await createEnergySubmeter({
      accountId: acct.id, submeterName: "Wing", submeterNumber: "S-1", officeCode: "GSO", status: "Active",
    });
    await createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 9, billingYear: 2026, consumption: 1, amount: 1 });
    // A voided bill is still an official record.
    await voidEnergyBill(bill.id, "Entered against the wrong account");

    await expect(deleteEnergyAccounts([acct.id, empty.id])).rejects.toThrow(
      "1 deleted. Kept 1 (TEST-001): This account holds official records, which are never deleted. Archive it instead.",
    );
    expect((await listEnergyAccounts()).map((a) => a.accountNumber)).toEqual(["TEST-001"]);
    expect(await listEnergyBills({ accountId: acct.id, includeVoided: true })).toHaveLength(1);
    expect(await listEnergySubmeterBills({ submeterId: sub.id })).toHaveLength(1);

    const archived = await archiveEnergyAccount(acct.id, true);
    expect(archived).toMatchObject({ archived: true, archivedBy: "admin@alaminos.gov.ph" });
    // Archived: no new bill or submeter bill until it is restored (2026-10-21).
    const closed = "This energy account is archived. An Administrator must restore it before new records can be added.";
    await expect(createEnergyBill({ accountId: acct.id, billingMonth: 10, billingYear: 2026, amount: 1, kwh: 1 })).rejects.toThrow(closed);
    await expect(
      createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 10, billingYear: 2026, consumption: 1, amount: 1 }),
    ).rejects.toThrow(closed);
    await expect(
      createEnergySubmeter({ accountId: acct.id, submeterName: "Annex", submeterNumber: "S-2", officeCode: "GSO", status: "Active" }),
    ).rejects.toThrow(/permission/);
    expect((await archiveEnergyAccount(acct.id, false)).archived).toBe(false);
    await expect(createEnergyBill({ accountId: acct.id, billingMonth: 10, billingYear: 2026, amount: 1, kwh: 1 })).resolves.toBeTruthy();
  });

  it("a submeter bill is corrected with a reason and keeps its previous values", async () => {
    const acct = await createEnergyAccount(account("003"));
    const sub = await createEnergySubmeter({
      accountId: acct.id, submeterName: "Wing", submeterNumber: "S-1", officeCode: "GSO", status: "Active",
    });
    const bill = await createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 9, billingYear: 2026, consumption: 120, amount: 1800 });
    const fixed = await correctEnergySubmeterBill(bill.id, { consumption: 120, amount: 1750 }, "Rate corrected");
    expect(fixed.amount).toBe(1750);
    expect(fixed.revisions?.[0]).toMatchObject({ reason: "Rate corrected", by: "admin@alaminos.gov.ph", changes: { amount: { from: 1800, to: 1750 } } });
    await expect(correctEnergySubmeterBill(bill.id, { consumption: 120, amount: 1 }, " ")).rejects.toThrow(/reason/i);

    // Voided, not deleted; its month is free for the replacement.
    await expect(deleteEnergySubmeterBills([bill.id])).rejects.toThrow(/voided with a reason, not deleted/);
    await voidEnergySubmeterBill(bill.id, "Recorded on the wrong submeter");
    expect(await listEnergySubmeterBills({ submeterId: sub.id })).toEqual([]);
    expect((await listEnergySubmeterBills({ submeterId: sub.id, includeVoided: true }))[0]).toMatchObject({
      voided: true, voidReason: "Recorded on the wrong submeter", voidedBy: "admin@alaminos.gov.ph", amount: 1750,
    });
    const again = await createEnergySubmeterBill({ submeterId: sub.id, billingMonth: 9, billingYear: 2026, consumption: 120, amount: 1700 });
    expect((await listEnergySubmeterBills({ submeterId: sub.id })).map((b) => b.id)).toEqual([again.id]);
  });

  it("is written by Administrators only", async () => {
    await signInAs("dept@alaminos.gov.ph");
    await expect(createEnergyAccount(account("009"))).rejects.toThrow("You don't have permission to perform this action.");
  });
});

describe("unique numbers hold under simultaneous saves", () => {
  it("of several simultaneous saves of one account number, exactly one succeeds", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => createEnergyAccount(account("777"))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) {
      expect(String(r.reason?.message)).toMatch(/already (registered|exists)/);
    }
    expect((await listEnergyAccounts({ search: "TEST-777" })).length).toBe(1);
  });

  it("of simultaneous vehicles with one plate, or submeters with one number, exactly one is saved", async () => {
    const plate = {
      vehicleName: "Race test", plateNumber: "RACE 001", vehicleType: "Pickup", officeCode: "GSO",
      fuelType: "Diesel", tankCapacity: 70, kmPerLiter: 10, currentFuelBalance: 0, status: "Active" as const,
    };
    const vehicles = await Promise.allSettled(Array.from({ length: 5 }, () => createFuelVehicle(plate)));
    expect(vehicles.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const acct = await createWaterAccount(account("888"));
    const subs = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createWaterSubmeter({ accountId: acct.id, submeterName: "Race", submeterNumber: "R-1", assignedOffice: "GSO", status: "Active" }),
      ),
    );
    expect(subs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("a deleted account frees its number; a renamed one frees its old number", async () => {
    const a = await createEnergyAccount(account("901"));
    await deleteEnergyAccounts([a.id]);
    const b = await createEnergyAccount(account("901"));
    await updateEnergyAccount(b.id, account("902"));
    await expect(createEnergyAccount(account("901"))).resolves.toBeTruthy();
    await expect(createEnergyAccount(account("902"))).rejects.toThrow("That account number is already registered.");
  });
});

describe("Water on Firestore", () => {
  it("numbers bills (WC) and computes a reading's consumption", async () => {
    const acct = await createWaterAccount(account("101"));
    const bill = await createWaterBill({ accountId: acct.id, billingMonth: 9, billingYear: 2026, amount: 2400, consumption: 60 });
    expect(bill.docNumber).toBe(`WC-${manilaYear()}-000001`);
    expect(await listWaterBills({ accountId: acct.id })).toHaveLength(1);

    const sub = await createWaterSubmeter({
      accountId: acct.id, submeterName: "Comfort room", submeterNumber: "W-1", assignedOffice: "GSO", status: "Active",
    });
    const reading = await createWaterMeterReading({
      submeterId: sub.id, readingDate: "2026-10-01", previousReading: 100, currentReading: 135.5, amount: 700,
    });
    expect(reading.consumption).toBe(35.5);
    await expect(
      createWaterMeterReading({ submeterId: sub.id, readingDate: "2026-10-02", previousReading: 135.5, currentReading: 120, amount: 0 }),
    ).rejects.toThrow("The current reading cannot be lower than the previous reading.");
    const corrected = { readingDate: "2026-10-01", previousReading: 100, currentReading: 140, amount: 800 };
    await expect(updateWaterMeterReading(reading.id, corrected)).rejects.toThrow(/corrected with a reason/);
    const fixed = await correctWaterMeterReading(reading.id, corrected, "Meter re-read on site");
    expect(fixed.consumption).toBe(40);
    expect(fixed.revisions?.[0]).toMatchObject({
      reason: "Meter re-read on site",
      changes: { current_reading: { from: 135.5, to: 140 }, consumption: { from: 35.5, to: 40 } },
    });
    expect((await listWaterMeterReadings({ submeterId: sub.id }))[0].consumption).toBe(40);
    await expect(correctWaterMeterReading(reading.id, { ...corrected, currentReading: 90 }, "x")).rejects.toThrow(
      "The current reading cannot be lower than the previous reading.",
    );

    // Voided, not deleted: it leaves the list (and so the totals) but stays on file.
    await expect(deleteWaterMeterReadings([reading.id])).rejects.toThrow(/voided with a reason, not deleted/);
    await voidWaterMeterReading(reading.id, "Read from the wrong meter");
    expect(await listWaterMeterReadings({ submeterId: sub.id })).toEqual([]);
    expect((await listWaterMeterReadings({ submeterId: sub.id, includeVoided: true }))[0]).toMatchObject({
      voided: true, consumption: 40, voidedBy: "admin@alaminos.gov.ph",
    });

    // An archived account's submeters take no new readings.
    await archiveWaterAccount(acct.id, true);
    await expect(
      createWaterMeterReading({ submeterId: sub.id, readingDate: "2026-10-03", previousReading: 140, currentReading: 150, amount: 0 }),
    ).rejects.toThrow("This water account is archived. An Administrator must restore it before new records can be added.");
  });
});

describe("Fuel on Firestore", () => {
  async function vehicle() {
    return createFuelVehicle({
      vehicleName: "Service pickup (test)",
      plateNumber: `TST ${Math.floor(Math.random() * 9000) + 1000}`,
      vehicleType: "Pickup",
      officeCode: "GSO",
      fuelType: "Diesel",
      tankCapacity: 70,
      kmPerLiter: 10,
      currentFuelBalance: 20,
      status: "Active",
    });
  }

  const trip = (vehicleId: string, over: Partial<TripDraftInput> = {}): TripDraftInput => ({
    vehicleId,
    tripDate: "2026-10-05",
    purpose: "Delivery of supplies (test data)",
    origin: "Municipal Hall",
    destination: "Barangay San Agustin",
    driver: "Test Driver",
    noOfTrips: 1,
    beginningOdometer: 1000,
    endingOdometer: 1080,
    kmPerLiter: 10,
    beginningFuel: 20,
    fuelAdded: 5,
    ...over,
  });

  it("registers each plate number once", async () => {
    const v = await vehicle();
    await expect(
      createFuelVehicle({
        vehicleName: "Copy", plateNumber: v.plateNumber, vehicleType: "Pickup", officeCode: "GSO",
        fuelType: "Diesel", tankCapacity: 70, kmPerLiter: 10, currentFuelBalance: 0, status: "Active",
      }),
    ).rejects.toThrow("A vehicle with that plate number is already registered.");
  });

  it("numbers trips by month, computes the fuel, and carries the balance to the vehicle", async () => {
    const v = await vehicle();
    const first = await createFuelTrip(trip(v.id));
    expect(first).toMatchObject({ controlNo: "2026-10-0001", distanceTravelled: 80, fuelUsed: 8, endingFuel: 17 });
    expect((await getFuelVehicle(v.id))?.currentFuelBalance).toBe(17);
    const second = await createFuelTrip(trip(v.id, { tripDate: "2026-10-06", beginningOdometer: 1080, endingOdometer: 1130, beginningFuel: 17, fuelAdded: 0 }));
    expect(second.controlNo).toBe("2026-10-0002");
    expect((await getFuelVehicle(v.id))?.currentFuelBalance).toBe(12);

    const correctedTrip = trip(v.id, { tripDate: "2026-10-06", beginningOdometer: 1080, endingOdometer: 1100, beginningFuel: 17, fuelAdded: 0 });
    await expect(updateFuelTrip(second.id, correctedTrip)).rejects.toThrow(/corrected with a reason/);
    const edited = await correctFuelTrip(second.id, correctedTrip, "Odometer misread at the gate");
    expect(edited).toMatchObject({ controlNo: "2026-10-0002", distanceTravelled: 20, endingFuel: 15 });
    expect(edited.revisions?.[0].changes).toMatchObject({ ending_odometer: { from: 1130, to: 1100 }, ending_fuel: { from: 12, to: 15 } });
    expect((await getFuelVehicle(v.id))?.currentFuelBalance).toBe(15);
    await expect(correctFuelTrip(second.id, trip(v.id, { endingOdometer: 900 }), "x")).rejects.toThrow(
      "Odometer IN cannot be lower than Odometer OUT.",
    );
    // The control number is the month's: the trip cannot move to another month.
    await expect(correctFuelTrip(second.id, { ...correctedTrip, tripDate: "2026-11-02" }, "Wrong month")).rejects.toThrow(
      /Trip 2026-10-0002 belongs to 2026-10/,
    );

    // Voided, not deleted: the trip stays on file and the balance comes from the remaining trips.
    await expect(deleteFuelTrips([second.id])).rejects.toThrow(/corrected with a reason, or voided/);
    await voidFuelTrip(second.id, "Trip cancelled; vehicle did not leave");
    expect((await getFuelVehicle(v.id))?.currentFuelBalance).toBe(17);
    expect((await listFuelTrips({ vehicleId: v.id, month: 10, year: 2026 })).map((t) => t.controlNo)).toEqual(["2026-10-0001"]);
    expect((await listFuelTrips({ vehicleId: v.id, includeVoided: true })).map((t) => t.controlNo).sort()).toEqual([
      "2026-10-0001",
      "2026-10-0002",
    ]);
  });

  it("numbers fuel purchases (FC) and recomputes the total on edit", async () => {
    const v = await vehicle();
    const txn = await createFuelTransaction({ vehicleId: v.id, txnDate: "2026-10-03", fuelType: "Diesel", liters: 40, pricePerLiter: 62.5 });
    expect(txn).toMatchObject({ docNumber: `FC-${manilaYear()}-000001`, totalAmount: 2500 });
    const edited = await correctFuelTransaction(txn.id, { txnDate: "2026-10-03", fuelType: "Diesel", liters: 30, pricePerLiter: 60 }, "Receipt reprinted");
    expect(edited.totalAmount).toBe(1800);
    expect(edited.revisions?.[0].changes.total_amount).toEqual({ from: 2500, to: 1800 });
    expect((await listFuelTransactions({ vehicleId: v.id })).map((t) => t.docNumber)).toEqual([txn.docNumber]);
    await voidFuelTransaction(txn.id, "Purchase charged to another office");
    expect(await listFuelTransactions({ vehicleId: v.id })).toEqual([]);
    expect((await listFuelTransactions({ vehicleId: v.id, includeVoided: true }))[0]).toMatchObject({ voided: true, totalAmount: 1800 });
  });

  it("refuses an odometer reading that goes backwards", async () => {
    const v = await vehicle();
    const ok = await createFuelOdometerReading({
      vehicleId: v.id, readingDate: "2026-10-01", previousOdometer: 1000, currentOdometer: 1250, fuelCost: 0, fuelLiters: 0,
    });
    expect(ok.distance).toBe(250);
    await expect(
      createFuelOdometerReading({
        vehicleId: v.id, readingDate: "2026-10-02", previousOdometer: 1250, currentOdometer: 1200, fuelCost: 0, fuelLiters: 0,
      }),
    ).rejects.toThrow("The current odometer cannot be lower than the previous reading.");

    const corrected = { readingDate: "2026-10-01", previousOdometer: 1000, currentOdometer: 1230, fuelCost: 0, fuelLiters: 0 };
    await expect(updateFuelOdometerReading(ok.id, corrected)).rejects.toThrow(/corrected with a reason/);
    const fixed = await correctFuelOdometerReading(ok.id, corrected, "Typo in the logbook");
    expect(fixed.distance).toBe(230);
    expect(fixed.revisions?.[0].changes.distance).toEqual({ from: 250, to: 230 });
    expect(await voidFuelOdometerReading(ok.id, "Entered twice")).toMatchObject({ voided: true, voidReason: "Entered twice" });
  });

  it("an inactive vehicle takes no new trip, purchase or reading until it is set Active again", async () => {
    const v = await vehicle();
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = v;
    await updateFuelVehicle(v.id, { ...fields, status: "Inactive" });
    const closed = "This vehicle is inactive. Set it Active again before new records can be added.";
    await expect(createFuelTrip(trip(v.id))).rejects.toThrow(closed);
    await expect(
      createFuelTransaction({ vehicleId: v.id, txnDate: "2026-10-03", fuelType: "Diesel", liters: 10, pricePerLiter: 60 }),
    ).rejects.toThrow(closed);
    await expect(
      createFuelOdometerReading({ vehicleId: v.id, readingDate: "2026-10-01", previousOdometer: 1, currentOdometer: 2, fuelCost: 0, fuelLiters: 0 }),
    ).rejects.toThrow(closed);
    await updateFuelVehicle(v.id, { ...fields, status: "Active" });
    await expect(createFuelTrip(trip(v.id))).resolves.toMatchObject({ controlNo: "2026-10-0001" });
  });

  it("a vehicle with trips is kept — set Inactive instead — while an empty one is deleted", async () => {
    const used = await vehicle();
    const empty = await vehicle();
    await createFuelTrip(trip(used.id));
    await expect(deleteFuelVehicles([used.id, empty.id])).rejects.toThrow(/Kept 1 .*Set it Inactive instead/);
    expect(await getFuelVehicle(used.id)).toBeTruthy();
    expect(await getFuelVehicle(empty.id)).toBeNull();
  });
});
