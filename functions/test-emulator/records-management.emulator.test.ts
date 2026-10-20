import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, staffToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Records Management on the emulators: the three forms saved with their
 * lines, numbers and Records Room filing (migrations 040–048), shelves and
 * boxes — over HTTP, as the browser calls them. Synthetic data only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;

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
  ({ token: admin, uid: adminUid } = await staffToken("admin@alaminos.gov.ph", "Administrator"));
});

const series = (title: string, id?: string) => ({
  ...(id ? { id } : {}),
  title_and_description: title,
  retention_active: 2,
  retention_storage: 3,
  remarks: null,
});

const rds = (status = "Draft", date = "2026-10-15", lines = [series("Purchase requests"), series("Vouchers")]) => ({
  type: "RDS",
  header: { agency_name: "Municipality of Alaminos — GSO", agency_address: "Poblacion, Alaminos, Laguna", date_prepared: date, status },
  lines,
});

const ria = (status = "Approved") => ({
  type: "RIA",
  header: {
    office_name: "General Services Office", department_division: null, section_unit: null, telephone_no: null,
    email_address: null, office_address: "Poblacion, Alaminos, Laguna", person_in_charge: null, date_prepared: "2026-10-15",
    prepared_by: null, prepared_by_position: null, assisted_by: null, approved_by: null, status,
  },
  lines: [{
    title_and_description: "Supply ledgers (test data)", period_covered: "2020–2025", volume: "2 boxes", records_medium: "Paper",
    restrictions: null, location_of_records: "Records Room", frequency_of_use: null, duplication: null, time_value: "T",
    utility_value: "Adm", retention_active: 5, retention_storage: 5, disposition_provision: null,
  }],
});

const save = (data: unknown, token = admin) => call("saveRecordsDocument", data, token);
const docs = async (c: string) => (await db.collection(c).get()).docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown>);

describe("saveRecordsDocument", () => {
  it("numbers a schedule and saves its lines, numbered 1, 2 … with retention totals", async () => {
    const res = await save(rds());
    expect(res.error).toBeUndefined();
    const id = String(res.result?.id);
    expect(res.result).toMatchObject({ schedule_no: `RDS-${year()}-000001`, status: "Draft", created_by_uid: adminUid });
    const lines = (await docs("record_series")).sort((a, b) => Number(a.item_number) - Number(b.item_number));
    expect(lines.map((l) => [l.item_number, l.title_and_description, l.retention_total, l.schedule_id])).toEqual([
      [1, "Purchase requests", 5, id],
      [2, "Vouchers", 5, id],
    ]);
    // A Draft is still with the person preparing it, not in the room.
    expect(await docs("record_box_contents")).toEqual([]);
    expect((await db.doc(`unique_keys/disposition_schedules.schedule_no:RDS-${year()}-000001`).get()).get("doc_id")).toBe(id);
  });

  it("files an approved form in its kind and year's box, starting the room if it is empty", async () => {
    const res = await save(rds("Approved"));
    const id = String(res.result?.id);
    const [box] = await docs("record_boxes");
    expect(box).toMatchObject({ id: "RDS-2026-01", document_type: "RDS", year: 2026, sequence: 1, slot: 1 });
    const [shelf] = await docs("record_shelves");
    expect(shelf.name).toBe("Shelf 1");
    expect((await docs("record_shelf_levels")).map((l) => l.label).sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(box.shelf_level_id).toBe(`${shelf.id}-A`);
    expect((await db.doc(`record_box_contents/RDS-${id}`).get()).data()).toMatchObject({
      box_id: "RDS-2026-01",
      document_no: `RDS-${year()}-000001`,
      agency: "Municipality of Alaminos — GSO",
      date: "2026-10-15",
    });
  });

  it("puts a second schedule of the year in the same box, and another kind in the next position", async () => {
    await save(rds("Approved"));
    await save(rds("Approved"));
    await save(ria("Approved"));
    const boxes = (await docs("record_boxes")).sort((a, b) => Number(a.slot) - Number(b.slot));
    expect(boxes.map((b) => [b.id, b.slot])).toEqual([["RDS-2026-01", 1], ["RIA-2026-01", 2]]);
    expect((await docs("record_box_contents")).filter((c) => c.box_id === "RDS-2026-01")).toHaveLength(2);
  });

  it("takes a form out of its box when it leaves Approved; the box stays", async () => {
    const res = await save(rds("Approved"));
    const id = String(res.result?.id);
    await save({ ...rds("Returned"), id });
    expect(await docs("record_box_contents")).toEqual([]);
    expect(await docs("record_boxes")).toHaveLength(1);
    await save({ ...rds("Approved"), id });
    expect((await docs("record_box_contents")).map((c) => c.box_id)).toEqual(["RDS-2026-01"]);
  });

  it("keeps a schedule's series IDs across saves, renumbering and dropping removed lines", async () => {
    const res = await save(rds());
    const id = String(res.result?.id);
    const before = (await docs("record_series")).sort((a, b) => Number(a.item_number) - Number(b.item_number));
    const kept = String(before[1].id);
    await save({ ...rds("Draft", "2026-10-15", [series("Vouchers (renamed)", kept), series("Payrolls")]), id });
    const after = (await docs("record_series")).sort((a, b) => Number(a.item_number) - Number(b.item_number));
    expect(after.map((l) => [l.item_number, l.title_and_description])).toEqual([[1, "Vouchers (renamed)"], [2, "Payrolls"]]);
    expect(after[0].id).toBe(kept);
    expect(after.some((l) => l.id === before[0].id)).toBe(false);
    expect((await db.doc(`disposition_schedules/${id}`).get()).get("schedule_no")).toBe(`RDS-${year()}-000001`);
  });

  it("refuses what the printed form could not hold, spending no number", async () => {
    expect((await save({ ...rds(), lines: [] })).error?.message).toMatch(/at least one record series/);
    expect((await save({ ...rds(), lines: [{ ...series("x"), retention_active: -1 }] })).error?.status).toBe("INVALID_ARGUMENT");
    expect((await save({ ...rds("Archived") })).error?.message).toMatch(/Status must be/);
    expect((await save({ ...rds(), header: { ...rds().header, agency_name: "" } })).error?.status).toBe("INVALID_ARGUMENT");
    expect((await save({ ...rds(), lines: [{ ...series("x"), shelf_level_id: "lvl" }] })).error?.message).toMatch(/Unexpected field/);
    expect(await docs("disposition_schedules")).toEqual([]);
    expect((await db.doc(`document_counters/RDS-${year()}`).get()).exists).toBe(false);
  });

  it("is for Administrators only", async () => {
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await save(rds(), dept)).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("saveRecordsDocument", rds())).error?.status).toBe("PERMISSION_DENIED");
  });

  it("gives simultaneous approvals distinct numbers, one box and distinct positions", async () => {
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => save(rds("Approved"))),
      ...Array.from({ length: 3 }, () => save(ria("Approved"))),
    ]);
    expect(results.map((r) => r.error)).toEqual(Array(8).fill(undefined));
    const numbers = results.slice(0, 5).map((r) => String(r.result?.schedule_no));
    expect(new Set(numbers).size).toBe(5);
    const boxes = await docs("record_boxes");
    expect(boxes.map((b) => b.id).sort()).toEqual(["RDS-2026-01", "RIA-2026-01"]);
    expect(new Set(boxes.map((b) => `${b.shelf_level_id}~${b.slot}`)).size).toBe(2);
    expect(await docs("record_shelves")).toHaveLength(1);
    expect(await docs("record_box_contents")).toHaveLength(8);
  });

  it("adds a shelf when every position of every shelf is taken", async () => {
    // Shelf 1 full: fifteen boxes (A–E × 3), as earlier filings would leave
    // it. Seeded directly — filing fifteen forms through the function would
    // test nothing more and leave a long tail of audit work for the next test.
    const at = new Date().toISOString();
    const batch = db.batch();
    batch.set(db.doc("record_shelves/shelf-full"), { id: "shelf-full", name: "Shelf 1", position: 0, created_at: at });
    let year = 2001;
    for (const label of ["A", "B", "C", "D", "E"]) {
      const level = `shelf-full-${label}`;
      batch.set(db.doc(`record_shelf_levels/${level}`), { id: level, shelf_id: "shelf-full", label });
      for (const slot of [1, 2, 3]) {
        const id = `RDS-${year++}-01`;
        batch.set(db.doc(`record_boxes/${id}`), { id, document_type: "RDS", shelf_level_id: level, slot });
        batch.set(db.doc(`record_box_positions/${level}~${slot}`), { box_id: id, shelf_id: "shelf-full", level_id: level, slot });
      }
    }
    await batch.commit();

    const res = await save(rds("Approved", "2026-06-01"));
    expect(res.error).toBeUndefined();
    const shelves = (await docs("record_shelves")).sort((a, b) => Number(a.position) - Number(b.position));
    expect(shelves.map((s) => s.name)).toEqual(["Shelf 1", "Shelf 2"]);
    expect((await db.doc("record_boxes/RDS-2026-01").get()).data()).toMatchObject({
      shelf_level_id: `${shelves[1].id}-A`,
      slot: 1,
    });
    expect((await docs("record_shelf_levels")).filter((l) => l.shelf_id === shelves[1].id)).toHaveLength(5);
  });
});

describe("voidRecordsDocument", () => {
  it("voids a form: number, lines and filing history kept, signed with the reason", async () => {
    const res = await save(rds("Approved"));
    const id = String(res.result?.id);
    const voided = await call("voidRecordsDocument", { type: "RDS", id, reason: "Superseded by a corrected schedule" }, admin);
    expect(voided.error).toBeUndefined();
    expect((await db.doc(`disposition_schedules/${id}`).get()).data()).toMatchObject({
      schedule_no: `RDS-${year()}-000001`,
      status: "Cancelled",
      status_before_void: "Approved",
      void_reason: "Superseded by a corrected schedule",
      voided_by: "admin@alaminos.gov.ph",
      voided_by_uid: adminUid,
    });
    expect(await docs("record_series")).toHaveLength(2);
    // It stays in its box, marked voided, for the record.
    expect((await db.doc(`record_box_contents/RDS-${id}`).get()).data()).toMatchObject({ box_id: "RDS-2026-01", voided: true });
    expect(await docs("record_boxes")).toHaveLength(1);
    // The next schedule does not reuse the number.
    expect((await save(rds())).result?.schedule_no).toBe(`RDS-${year()}-000002`);
  });

  it("needs a reason and an Administrator, voids once, and a voided form cannot be changed", async () => {
    const id = String((await save(rds())).result?.id);
    expect((await call("voidRecordsDocument", { type: "RDS", id, reason: " " }, admin)).error?.status).toBe("INVALID_ARGUMENT");
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    expect((await call("voidRecordsDocument", { type: "RDS", id, reason: "x" }, dept)).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("voidRecordsDocument", { type: "RDS", id, reason: "Duplicate" }, admin)).error).toBeUndefined();
    expect((await call("voidRecordsDocument", { type: "RDS", id, reason: "Again" }, admin)).error?.message).toMatch(/already voided/);
    expect((await save({ ...rds("Approved"), id })).error?.message).toMatch(/voided and can no longer be changed/);
    expect(await docs("record_box_contents")).toEqual([]);
  });

  it("a voided form no longer takes room in a measured box", async () => {
    // A box the office has measured: capacity 1.
    const first = String((await save(rds("Approved"))).result?.id);
    await db.doc("record_boxes/RDS-2026-01").update({ capacity: 1 });
    await call("voidRecordsDocument", { type: "RDS", id: first, reason: "Withdrawn" }, admin);
    await save(rds("Approved"));
    // The voided one no longer counts, so the second fits in Box 01.
    expect((await docs("record_boxes")).map((b) => b.id)).toEqual(["RDS-2026-01"]);
  });
});

describe("the Records Room", () => {
  async function room() {
    await save(rds("Approved"));
    await save(ria("Approved"));
    const [shelf] = await docs("record_shelves");
    return { shelfId: String(shelf.id) };
  }

  it("moves a box to a free position, and refuses a taken one", async () => {
    const { shelfId } = await room();
    const taken = await call("moveRecordBox", { boxId: "RDS-2026-01", levelId: `${shelfId}-A`, slot: 2 }, admin);
    expect(taken.error?.message).toBe("Another box already stands in that position. Choose an empty one.");
    const moved = await call("moveRecordBox", { boxId: "RDS-2026-01", levelId: `${shelfId}-C`, slot: 3 }, admin);
    expect(moved.error).toBeUndefined();
    expect((await db.doc("record_boxes/RDS-2026-01").get()).data()).toMatchObject({ shelf_level_id: `${shelfId}-C`, slot: 3 });
    expect((await db.doc(`record_box_positions/${shelfId}-A~1`).get()).exists).toBe(false);
    expect((await db.doc(`record_box_positions/${shelfId}-C~3`).get()).get("box_id")).toBe("RDS-2026-01");
  });

  it("of two boxes moved into one free position at the same moment, exactly one gets it", async () => {
    const { shelfId } = await room();
    const results = await Promise.all(
      ["RDS-2026-01", "RIA-2026-01"].map((boxId) => call("moveRecordBox", { boxId, levelId: `${shelfId}-E`, slot: 1 }, admin)),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect((await docs("record_boxes")).filter((b) => b.shelf_level_id === `${shelfId}-E`)).toHaveLength(1);
  });

  it("adds a shelf with levels A–E, and removes only an empty one", async () => {
    const { shelfId } = await room();
    const added = await call("createRecordShelf", { name: "Shelf 2", location: "North wall", position: 1 }, admin);
    expect(added.error).toBeUndefined();
    const newId = String(added.result?.id);
    expect((await docs("record_shelf_levels")).filter((l) => l.shelf_id === newId)).toHaveLength(5);
    expect((await call("createRecordShelf", { name: " ", position: 2 }, admin)).error?.message).toMatch(/Give the shelf a name/);

    const busy = await call("deleteRecordShelf", { id: shelfId }, admin);
    expect(busy.error?.message).toBe("Boxes still stand on this shelf. Move them to another shelf first.");
    expect((await call("deleteRecordShelf", { id: newId }, admin)).error).toBeUndefined();
    expect((await docs("record_shelf_levels")).filter((l) => l.shelf_id === newId)).toEqual([]);
  });

  it("is changed by Administrators only", async () => {
    await room();
    const { token: viewer } = await staffToken("viewer@alaminos.gov.ph", "Viewer");
    expect((await call("createRecordShelf", { name: "X", position: 1 }, viewer)).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("moveRecordBox", { boxId: "RDS-2026-01", levelId: "x-A", slot: 1 }, viewer)).error?.status).toBe(
      "PERMISSION_DENIED",
    );
  });
});
