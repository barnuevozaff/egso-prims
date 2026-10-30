import { describe, expect, it } from "vitest";

import { buildRoom, searchRoom, type CatalogDoc } from "@/features/records/room/room-model";
import type { BoxContent, RecordBox, ShelfWithLevels } from "@/features/records/shelf-types";

const levels = (shelfId: string) =>
  ["A", "B", "C", "D", "E"].map((label, i) => ({ id: `${shelfId}-${label}`, shelfId, label, position: i }));
const shelf = (id: string, name: string, named: Record<string, string> = {}): ShelfWithLevels => ({
  id,
  name,
  position: 0,
  levels: levels(id).map((l) => ({ ...l, name: named[l.label] })),
});
const doc = (type: CatalogDoc["type"], id: string, status: CatalogDoc["status"], title = "Municipal Treasurer"): CatalogDoc => ({
  type,
  id,
  number: `${type}-2026-${id.padStart(6, "0")}`,
  title,
  date: "2026-10-20",
  status,
});
const content = (type: CatalogDoc["type"], id: string, boxId: string): BoxContent => ({
  id: `${type}-${id}`,
  boxId,
  documentType: type,
  sourceId: id,
  documentNo: `${type}-2026-${id.padStart(6, "0")}`,
  agency: "Municipal Treasurer",
  date: "2026-10-20",
  filedAt: "2026-10-21T00:00:00.000Z",
  moves: [],
});

const boxes: RecordBox[] = [
  // Made by placing, named by the office.
  { id: "b1", shelfLevelId: "s1-A", slot: 1, labelOverride: "Procurement Archives 2026" },
  // Filed by kind and year before 30 Oct 2026, in a third position.
  { id: "RDS-2026-01", documentType: "RDS", year: 2026, sequence: 1, shelfLevelId: "s1-B", slot: 3 },
];

const model = buildRoom({
  shelves: [shelf("s1", "Municipal Records Shelf", { A: "Administrative Records" })],
  boxes,
  contents: [content("RIA", "1", "b1"), content("RAD", "2", "b1"), content("RDS", "3", "RDS-2026-01")],
  catalog: [
    doc("RIA", "1", "Approved"),
    doc("RAD", "2", "Approved"),
    doc("RDS", "3", "Approved"),
    doc("RDS", "4", "Approved", "Office of the Mayor"),
    doc("RIA", "5", "Submitted"),
    doc("RAD", "6", "Returned"),
    doc("RDS", "7", "Cancelled"),
  ],
});

describe("the Records Room model (30 Oct 2026)", () => {
  it("gives every level two box positions, and a third only where a box from before still stands", () => {
    const [s] = model.shelves;
    expect(s.levels.map((l) => l.positions.length)).toEqual([2, 3, 2, 2, 2]);
    expect(s.levels[1].positions[2]).toMatchObject({ slot: 3, legacy: true, name: "Records Disposition Schedule — 2026 — Box 01" });
    expect(s.levels[0]).toMatchObject({ title: "Administrative Records" });
    expect(s.levels[1]).toMatchObject({ title: "Level B" });
  });

  it("holds several records in one box, and counts them", () => {
    const [s] = model.shelves;
    expect(s.levels[0].positions[0]).toMatchObject({ name: "Procurement Archives 2026" });
    expect(s.levels[0].positions[0].items.map((i) => i.documentNo)).toEqual(["RAD-2026-000002", "RIA-2026-000001"]);
    expect(s.levels[0].positions[1]).toMatchObject({ name: "Box 2", items: [] });
    expect(s).toMatchObject({ records: 3, boxesInUse: 2 });
  });

  it("lists as unplaced only approved records in no box, and keeps those awaiting approval apart", () => {
    expect(model.unplaced.map((d) => d.number)).toEqual(["RDS-2026-000004"]);
    expect(model.awaiting.map((d) => d.number).sort()).toEqual(["RAD-2026-000006", "RIA-2026-000005"]);
  });

  it("finds a placed record by the name of its shelf, level or box, with its exact place", () => {
    const hits = searchRoom(model, "procurement archives");
    expect(hits.map((h) => h.doc.number)).toEqual(["RAD-2026-000002", "RIA-2026-000001"]);
    expect(hits[0]).toMatchObject({ kind: "placed", placement: { position: { slot: 1, levelId: "s1-A" } } });
  });

  it("tells placed, unplaced and awaiting records apart, and leaves voided ones out", () => {
    const kinds = Object.fromEntries(searchRoom(model, "2026").map((h) => [h.doc.number, h.kind]));
    expect(kinds).toMatchObject({
      "RDS-2026-000003": "placed",
      "RDS-2026-000004": "unplaced",
      "RIA-2026-000005": "awaiting",
    });
    expect(kinds["RDS-2026-000007"]).toBeUndefined();
    expect(searchRoom(model, "mayor").map((h) => h.kind)).toEqual(["unplaced"]);
  });
});
