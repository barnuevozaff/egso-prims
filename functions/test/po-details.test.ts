import { describe, expect, it } from "vitest";

import { itemChanges } from "../src/documents/po-details.js";

const line = (id: string, description: string, quantity = 1, unitCost = 10, unit = "pc", stockNo = "") => ({
  id,
  description,
  quantity,
  unit,
  unitCost,
  stockNo,
});

const old = [line("a", "Bondpaper"), line("b", "Pencil"), line("c", "Ballpen")];

describe("a purchase order's item changes, as its history lists them (30 Oct 2026)", () => {
  it("lists a line added and a line removed, and nothing for the lines kept", () => {
    const next = [line("a", "Bondpaper"), line("c", "Ballpen"), line("", "Stapler", 2, 85.5)];
    expect(itemChanges(old, next).map((c) => c.line)).toEqual([
      "Added: Stapler · 2 pc at ₱85.50",
      "Removed: Pencil · 1 pc at ₱10.00",
    ]);
  });

  it("says what changed on a line kept", () => {
    const next = [line("a", "Bondpaper", 5, 12.25, "ream"), old[1], old[2]];
    expect(itemChanges(old, next).map((c) => c.line)).toEqual([
      "Bondpaper: quantity 1 → 5, unit pc → ream, unit cost ₱10.00 → ₱12.25",
    ]);
  });

  it("records a stock number filled in as a completion", () => {
    const changes = itemChanges(old, [line("a", "Bondpaper", 1, 10, "pc", "SP-1"), old[1], old[2]]);
    expect(changes).toEqual([
      expect.objectContaining({ kind: "completed", line: "Bondpaper stock/property no.: blank → SP-1" }),
    ]);
  });

  it("finds nothing when nothing changed", () => {
    expect(itemChanges(old, old.map((o) => ({ ...o })))).toEqual([]);
  });
});
