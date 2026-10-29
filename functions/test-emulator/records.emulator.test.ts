import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * The numbered utility and violation records (EC, WC, FC, VT), fuel trips'
 * monthly control numbers, and voiding a released slip with its stock
 * returned — over HTTP, as the browser calls them. Synthetic data only; demo
 * project only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;
// Fresh parent ids per test: clearing the emulator deletes the last test's
// accounts, and the cascadeDeletes trigger that follows a moment later would
// otherwise remove records this test has just made under the same ids.
let EA: string;
let WA: string;
let FV: string;

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
  ({ token: admin, uid: adminUid } = await accountToken("admin@alaminos.gov.ph"));
  const run = Math.random().toString(36).slice(2, 8);
  [EA, WA, FV] = [`ea-${run}`, `wa-${run}`, `fv-${run}`];
  await db.doc(`energy_accounts/${EA}`).set({ id: EA, account_number: "ACC-TEST-1" });
  await db.doc(`water_accounts/${WA}`).set({ id: WA, account_number: "WAC-TEST-1" });
  await db.doc(`fuel_vehicles/${FV}`).set({ id: FV, plate_number: "TEST 001", km_per_liter: 10 });
});

const bill = (over: Record<string, unknown> = {}) => ({
  account_id: EA,
  billing_month: 9,
  billing_year: 2026,
  amount: 12500.5,
  kwh: 840,
  remarks: null,
  ...over,
});

describe("createNumberedRecord", () => {
  it("numbers and saves an energy bill in one step, signed by the caller", async () => {
    const res = await call("createNumberedRecord", { type: "EC", record: bill() }, admin);
    expect(res.error).toBeUndefined();
    const number = `EC-${year()}-000001`;
    expect(res.result).toMatchObject({ id: `eb-${EA}-2026-09`, doc_number: number, created_by_uid: adminUid });
    expect((await db.doc(`energy_bills/eb-${EA}-2026-09`).get()).get("doc_number")).toBe(number);
  });

  it("refuses a second bill for the same account and period, spending no number", async () => {
    await call("createNumberedRecord", { type: "EC", record: bill() }, admin);
    const again = await call("createNumberedRecord", { type: "EC", record: bill({ amount: 1 }) }, admin);
    expect(again.error?.status).toBe("ALREADY_EXISTS");
    expect(again.error?.message).toMatch(/already exists/);
    expect((await db.doc(`document_counters/EC-${year()}`).get()).get("current_sequence")).toBe(1);
  });

  it("gives simultaneous saves different, consecutive numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        call("createNumberedRecord", { type: "WC", record: { account_id: WA, billing_month: i + 1, billing_year: 2026, amount: 100, consumption: 10, remarks: null } }, admin),
      ),
    );
    expect(results.map((r) => r.error)).toEqual(Array(8).fill(undefined));
    const seq = results.map((r) => Number(String(r.result?.doc_number).split("-")[2])).sort((a, b) => a - b);
    expect(seq).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("computes the total of a fuel transaction rather than trusting the browser", async () => {
    const res = await call(
      "createNumberedRecord",
      { type: "FC", record: { vehicle_id: FV, txn_date: "2026-10-01", fuel_type: "Diesel", liters: 40, price_per_liter: 62.5, driver: null, odometer: null, remarks: null } },
      admin,
    );
    expect(res.result).toMatchObject({ total_amount: 2500, doc_number: `FC-${year()}-000001` });
    const forged = await call(
      "createNumberedRecord",
      { type: "FC", record: { vehicle_id: FV, txn_date: "2026-10-01", fuel_type: "Diesel", liters: 40, price_per_liter: 62.5, total_amount: 1 } },
      admin,
    );
    expect(forged.error?.message).toMatch(/Unexpected field: total_amount/);
  });

  it("refuses a record whose account or vehicle is gone", async () => {
    const res = await call("createNumberedRecord", { type: "EC", record: bill({ account_id: "ea-missing" }) }, admin);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");
    expect(res.error?.message).toMatch(/no longer exists/);
  });

  it("is refused signed out", async () => {
    expect((await call("createNumberedRecord", { type: "EC", record: bill() })).error?.status).toBe("PERMISSION_DENIED");
  });
});

describe("recordViolation", () => {
  const violatorId = (res: { result?: Record<string, unknown> }) =>
    String((res.result?.violator as { id?: string } | undefined)?.id);
  const ticket = {
    violation_type: "Illegal parking",
    description: null,
    date_issued: "2026-10-15",
    amount: 500,
    remarks: null,
    apprehended_by: "Test Officer",
    citation_no: null,
  };

  it("opens a profile for a new name and numbers the ticket, unsettled", async () => {
    const res = await call("recordViolation", { violatorName: "Nasol, Richard", record: ticket }, admin);
    expect(res.error).toBeUndefined();
    expect(res.result?.createdProfile).toBe(true);
    expect(res.result?.violation).toMatchObject({
      violation_no: `VT-${year()}-000001`,
      payment_status: "Pending",
      amount_paid: 0,
      outstanding_balance: 500,
    });
    const claim = await db.doc("unique_keys/violators.name_key:nasol richard").get();
    expect(claim.get("doc_id")).toBe(violatorId(res));
  });

  it("attaches another spelling of the same name to the existing profile", async () => {
    const first = await call("recordViolation", { violatorName: "Nasol, Richard", record: ticket }, admin);
    const second = await call("recordViolation", { violatorName: "NASOL RICHARD", record: ticket }, admin);
    expect(second.result?.createdProfile).toBe(false);
    expect(violatorId(second)).toBe(violatorId(first));
    expect((await db.collection("violators").get()).size).toBe(1);
  });

  it("opens one profile when the same new person is recorded at the same moment", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call("recordViolation", { violatorName: "Cruz, Ana", record: ticket }, admin)),
    );
    expect(results.map((r) => r.error)).toEqual(Array(6).fill(undefined));
    expect((await db.collection("violators").get()).size).toBe(1);
    expect((await db.collection("violations").get()).size).toBe(6);
    expect(results.filter((r) => r.result?.createdProfile)).toHaveLength(1);
  });

  it("leaves no empty profile behind when the ticket is refused", async () => {
    const res = await call("recordViolation", { violatorName: "Reyes, Jose", record: { ...ticket, amount: 0 } }, admin);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
    expect((await db.collection("violators").get()).size).toBe(0);
    expect((await db.collection("unique_keys").get()).size).toBe(0);
  });

  it("takes over a claim whose profile was deleted", async () => {
    await db.doc("unique_keys/violators.name_key:santos maria").set({ collection: "violators", doc_id: "vlt-gone" });
    const res = await call("recordViolation", { violatorName: "Santos, Maria", record: ticket }, admin);
    expect(res.error).toBeUndefined();
    expect(res.result?.createdProfile).toBe(true);
    const id = violatorId(res);
    expect((await db.doc("unique_keys/violators.name_key:santos maria").get()).get("doc_id")).toBe(id);
  });
});

describe("createFuelTrip", () => {
  const trip = (over: Record<string, unknown> = {}) => ({
    vehicle_id: FV,
    trip_date: "2026-10-05",
    purpose: "Delivery of supplies (test data)",
    origin: "Municipal Hall",
    destination: "Barangay San Agustin",
    driver: "Test Driver",
    passengers: null,
    no_of_trips: 1,
    source: "Manual",
    beginning_odometer: 1000,
    ending_odometer: 1080,
    km_per_liter: 10,
    beginning_fuel: 20,
    fuel_added: 5,
    status: "Completed",
    remarks: null,
    ...over,
  });

  it("numbers trips per month and computes distance and fuel", async () => {
    const res = await call("createFuelTrip", { record: trip() }, admin);
    expect(res.result).toMatchObject({
      control_no: "2026-10-0001",
      distance_travelled: 80,
      fuel_total: 25,
      fuel_used: 8,
      ending_fuel: 17,
    });
    const next = await call("createFuelTrip", { record: trip({ trip_date: "2026-10-06" }) }, admin);
    expect(next.result?.control_no).toBe("2026-10-0002");
    const november = await call("createFuelTrip", { record: trip({ trip_date: "2026-11-01" }) }, admin);
    expect(november.result?.control_no).toBe("2026-11-0001");
  });

  it("continues after control numbers already used that month (migrated trips)", async () => {
    await db.doc("fuel_trips/trp-old").set({ id: "trp-old", control_no: "2026-10-0041" });
    const res = await call("createFuelTrip", { record: trip() }, admin);
    expect(res.result?.control_no).toBe("2026-10-0042");
  });

  it("gives simultaneous trips different control numbers", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => call("createFuelTrip", { record: trip() }, admin)));
    expect(results.map((r) => r.error)).toEqual(Array(6).fill(undefined));
    expect(new Set(results.map((r) => r.result?.control_no)).size).toBe(6);
    expect((await db.collection("fuel_trips").get()).size).toBe(6);
  });

  it("refuses an odometer that goes backwards", async () => {
    const res = await call("createFuelTrip", { record: trip({ ending_odometer: 900 }) }, admin);
    expect(res.error?.message).toBe("Odometer IN cannot be lower than Odometer OUT.");
  });
});

describe("voidReleasedRis", () => {
  async function seed(status = "Released") {
    await db.doc("inventory_items/item-1").set({ id: "item-1", name: "Bond paper", unit: "ream", on_hand: 70, history: [] });
    await db.doc("inventory_items/item-2").set({ id: "item-2", name: "Toner", unit: "cartridge", on_hand: 3, history: [] });
    await db.doc("ris_requests/RIS-2026-000007").set({
      id: "RIS-2026-000007",
      ris_number: "RIS-2026-000007",
      status,
      approvals: [{ step: "Released", by: "Clerk" }],
      history: [],
      // Edited after release: what is returned is what the release took.
      items: [{ inventoryItemId: "item-1", issuedQty: 999 }],
    });
    const line = (id: string, item: string, name: string, out: number, balance: number) =>
      db.doc(`stock_card/${id}`).set({
        id, document_number: "RIS-2026-000007", type: "RIS Release", item_id: item, item_name: name,
        quantity_in: 0, quantity_out: out, balance,
      });
    await line("stk-1", "item-1", "Bond paper", 30, 70);
    await line("stk-2", "item-2", "Toner", 2, 3);
    // Another slip's line is not this slip's to return.
    await db.doc("stock_card/stk-3").set({
      id: "stk-3", document_number: "RIS-2026-000008", type: "RIS Release", item_id: "item-1", quantity_out: 5,
    });
  }

  const voidIt = (token?: string, reason = "Issued to the wrong office") =>
    call("voidReleasedRis", { id: "RIS-2026-000007", reason, by: "Test Admin", office: "GSO" }, token);

  it("returns exactly what the release took and closes the slip, signed, with the reason", async () => {
    await seed();
    const res = await voidIt(admin);
    expect(res.error).toBeUndefined();
    expect((await db.doc("inventory_items/item-1").get()).get("on_hand")).toBe(100);
    expect((await db.doc("inventory_items/item-2").get()).get("on_hand")).toBe(5);
    const returns = (await db.collection("stock_card").where("type", "==", "Return").get()).docs.map((d) => d.data());
    expect(returns).toHaveLength(2);
    expect(returns.find((r) => r.item_id === "item-1")).toMatchObject({
      document_number: "RIS-2026-000007", quantity_in: 30, quantity_out: 0, balance: 100, created_by_uid: adminUid,
    });
    const ris = (await db.doc("ris_requests/RIS-2026-000007").get()).data()!;
    expect(ris.status).toBe("Cancelled");
    expect(ris.ris_number).toBe("RIS-2026-000007");
    expect(ris.stock_reversed_by_uid).toBe(adminUid);
    expect(ris.approvals.at(-1)).toMatchObject({ step: "Cancelled", remarks: "Issued to the wrong office", byUid: adminUid });
  });

  it("never returns the stock twice", async () => {
    await seed();
    await voidIt(admin);
    await db.doc("ris_requests/RIS-2026-000007").update({ status: "Released" });
    const again = await voidIt(admin);
    expect(again.error?.status).toBe("FAILED_PRECONDITION");
    expect((await db.doc("inventory_items/item-1").get()).get("on_hand")).toBe(100);
  });

  it("changes nothing when an item has left the register", async () => {
    await seed();
    await db.doc("inventory_items/item-2").delete();
    const res = await voidIt(admin);
    expect(res.error?.message).toMatch(/Toner is no longer in the inventory/);
    expect((await db.doc("inventory_items/item-1").get()).get("on_hand")).toBe(70);
    expect((await db.doc("ris_requests/RIS-2026-000007").get()).get("status")).toBe("Released");
    expect((await db.collection("stock_card").where("type", "==", "Return").get()).size).toBe(0);
  });

  it("refuses a slip that is not Released, and a Completed one", async () => {
    for (const status of ["Approved", "Completed"]) {
      await seed(status);
      const res = await voidIt(admin);
      expect(res.error?.status).toBe("FAILED_PRECONDITION");
    }
  });

  it("needs a reason, and an account", async () => {
    await seed();
    expect((await voidIt(admin, "  ")).error?.status).toBe("INVALID_ARGUMENT");
    expect((await voidIt()).error?.status).toBe("PERMISSION_DENIED");
    expect((await db.doc("inventory_items/item-1").get()).get("on_hand")).toBe(70);
  });
});
