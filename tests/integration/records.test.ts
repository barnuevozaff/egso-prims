import { beforeEach, describe, expect, it } from "vitest";

import {
  createSchedule,
  deleteSchedule,
  voidSchedule,
  getSchedule,
  listSchedules,
  seriesCounts,
  updateSchedule,
} from "@/features/records/api";
import { createAppraisal, getAppraisal, listAppraisals } from "@/features/records/inventory-api";
import { createRequest, getRequest, itemCounts } from "@/features/records/disposal-api";
import {
  createShelf,
  deleteShelf,
  findFiledBox,
  listBoxes,
  listContents,
  listShelves,
  moveBox,
  relabelBox,
  updateShelf,
} from "@/features/records/shelf-api";
import type { ScheduleInput } from "@/features/records/types";
import type { AppraisalInput } from "@/features/records/inventory-types";
import type { DisposalInput } from "@/features/records/disposal-types";

import { createTeam, manilaYear, resetEmulators, signInAs } from "./setup";

/** Records Management through the screens' own service calls, on Firestore. Synthetic forms only. */

const schedule = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  agencyName: "Municipality of Alaminos — GSO",
  agencyAddress: "Poblacion, Alaminos, Laguna",
  datePrepared: "2026-10-15",
  status: "Draft",
  series: [
    { itemNumber: 1, titleAndDescription: "Purchase requests (test data)", retentionActive: 2, retentionStorage: 3 },
    { itemNumber: 2, titleAndDescription: "Vouchers (test data)", retentionActive: 5, retentionStorage: 5, remarks: "Original copies" },
  ],
  ...over,
});

const appraisal = (over: Partial<AppraisalInput> = {}): AppraisalInput => ({
  officeName: "General Services Office",
  officeAddress: "Poblacion, Alaminos, Laguna",
  datePrepared: "2026-10-15",
  status: "Approved",
  records: [
    {
      itemNumber: 1, titleAndDescription: "Supply ledgers (test data)", periodCovered: "2020–2025", timeValue: "T",
      utilityValue: "Adm", retentionActive: 5, retentionStorage: 5,
    },
  ],
  ...over,
});

const disposal = (over: Partial<DisposalInput> = {}): DisposalInput => ({
  agencyName: "Municipality of Alaminos — GSO",
  agencyAddress: "Poblacion, Alaminos, Laguna",
  requestDate: "2026-10-16",
  status: "Submitted",
  items: [
    { itemNumber: 1, titleAndDescription: "Old canvass sheets (test data)", periodCovered: "2010–2012" },
    { itemNumber: 2, titleAndDescription: "Old delivery receipts (test data)" },
  ],
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
  await signInAs("admin@alaminos.gov.ph");
});

describe("Records Management forms on Firestore", () => {
  it("saves a schedule with its number and lines, lists and searches it", async () => {
    const s = await createSchedule(schedule());
    expect(s).toMatchObject({ scheduleNo: `RDS-${manilaYear()}-000001`, status: "Draft" });
    const full = await getSchedule(s.id);
    expect(full?.series.map((l) => [l.itemNumber, l.titleAndDescription, l.retentionTotal])).toEqual([
      [1, "Purchase requests (test data)", 5],
      [2, "Vouchers (test data)", 10],
    ]);
    expect((await listSchedules({ search: "alaminos" })).map((x) => x.id)).toEqual([s.id]);
    expect(await listSchedules({ status: "Approved" })).toEqual([]);
    expect(await seriesCounts([s.id])).toEqual({ [s.id]: 2 });
  });

  it("keeps the browser's own validation messages", async () => {
    await expect(createSchedule(schedule({ series: [] }))).rejects.toThrow(
      "A disposition schedule needs at least one record series.",
    );
    await expect(createAppraisal(appraisal({ officeName: " " }))).rejects.toThrow("Name of office is required.");
  });

  it("approving files the form in the Records Room; returning it takes it out", async () => {
    const s = await createSchedule(schedule());
    expect(await findFiledBox("RDS", s.id)).toBeNull();
    await updateSchedule(s.id, schedule({ status: "Approved" }));
    const boxId = await findFiledBox("RDS", s.id);
    expect(boxId).toBe("RDS-2026-01");
    const [content] = await listContents();
    expect(content).toMatchObject({ documentType: "RDS", sourceId: s.id, documentNo: s.scheduleNo, boxId });
    await updateSchedule(s.id, schedule({ status: "Returned" }));
    expect(await findFiledBox("RDS", s.id)).toBeNull();
    expect(await listBoxes()).toHaveLength(1);
  });

  it("an edit keeps the schedule's series and renumbers them", async () => {
    const s = await createSchedule(schedule());
    const before = (await getSchedule(s.id))!.series;
    await updateSchedule(
      s.id,
      schedule({ series: [{ ...before[1], itemNumber: 1 }, { itemNumber: 2, titleAndDescription: "Payrolls", retentionActive: 1, retentionStorage: 1 }] }),
    );
    const after = (await getSchedule(s.id))!.series;
    expect(after.map((l) => [l.itemNumber, l.titleAndDescription])).toEqual([[1, "Vouchers (test data)"], [2, "Payrolls"]]);
    expect(after[0].id).toBe(before[1].id);
  });

  it("saves inventories and disposal requests with their numbers", async () => {
    const a = await createAppraisal(appraisal());
    expect(a.inventoryNo).toBe(`RIA-${manilaYear()}-000001`);
    expect((await getAppraisal(a.id))?.records[0]).toMatchObject({ timeValue: "T", utilityValue: "Adm", retentionTotal: 10 });
    expect((await listAppraisals({ status: "Approved" })).map((x) => x.id)).toEqual([a.id]);
    const r = await createRequest(disposal());
    expect(r.requestNo).toBe(`RAD-${manilaYear()}-000001`);
    expect((await getRequest(r.id))?.items.map((i) => i.itemNumber)).toEqual([1, 2]);
    expect(await itemCounts([r.id])).toEqual({ [r.id]: 2 });
  });

  it("a form is voided, not deleted: it keeps its number, lines and box, and leaves the active records", async () => {
    const s = await createSchedule(schedule({ status: "Approved" }));
    await expect(deleteSchedule(s.id)).rejects.toThrow(/voided with a reason, not deleted/);
    const voided = await voidSchedule(s.id, "Superseded by RDS-2026-000002");
    expect(voided).toMatchObject({ scheduleNo: s.scheduleNo, status: "Cancelled", voidReason: "Superseded by RDS-2026-000002", voidedBy: "admin@alaminos.gov.ph" });
    expect((await getSchedule(s.id))?.series).toHaveLength(2);
    // It stays where it was filed, for the record, but not among the active filed documents.
    expect(await findFiledBox("RDS", s.id)).toBe("RDS-2026-01");
    expect(await listContents()).toEqual([]);
    expect((await listSchedules({ status: "Cancelled" })).map((x) => x.id)).toEqual([s.id]);
    await expect(updateSchedule(s.id, schedule())).rejects.toThrow(/voided and can no longer be changed/);
  });

  it("every account reads and changes it", async () => {
    const s = await createSchedule(schedule());
    await signInAs("clerk@alaminos.gov.ph");
    expect((await listSchedules()).map((x) => x.id)).toEqual([s.id]);
    const t = await createSchedule(schedule());
    expect((await listSchedules()).map((x) => x.id).sort()).toEqual([s.id, t.id].sort());
  });
});

describe("the Records Room on Firestore", () => {
  it("lists shelves with levels A–E, boxes and contents; boxes move and are relabelled", async () => {
    await createSchedule(schedule({ status: "Approved" }));
    await createAppraisal(appraisal());
    const [shelf] = await listShelves();
    expect(shelf.levels.map((l) => l.label)).toEqual(["A", "B", "C", "D", "E"]);
    const boxes = await listBoxes();
    expect(boxes.map((b) => [b.documentType, b.slot])).toEqual([["RDS", 1], ["RIA", 2]]);

    await expect(moveBox("RDS-2026-01", shelf.levels[0].id, 2)).rejects.toThrow(
      "Another box already stands in that position. Choose an empty one.",
    );
    await moveBox("RDS-2026-01", shelf.levels[2].id, 3);
    await relabelBox("RDS-2026-01", "RDS 2026 — blue box");
    expect((await listBoxes()).find((b) => b.id === "RDS-2026-01")).toMatchObject({
      shelfLevelId: shelf.levels[2].id,
      slot: 3,
      labelOverride: "RDS 2026 — blue box",
    });
  });

  it("adds, renames and removes an empty shelf; a shelf with boxes stays", async () => {
    await createSchedule(schedule({ status: "Approved" }));
    await createShelf({ name: "Shelf 2", location: "North wall" }, 1);
    const shelves = await listShelves();
    expect(shelves.map((s) => s.name)).toEqual(["Shelf 1", "Shelf 2"]);
    await updateShelf(shelves[1].id, { name: "Shelf 2 (annex)" });
    await expect(deleteShelf(shelves[0].id)).rejects.toThrow("Boxes still stand on this shelf. Move them to another shelf first.");
    await deleteShelf(shelves[1].id);
    expect((await listShelves()).map((s) => s.name)).toEqual(["Shelf 1"]);
    await expect(createShelf({ name: "  " }, 2)).rejects.toThrow(/Give the shelf a name/);
  });
});
