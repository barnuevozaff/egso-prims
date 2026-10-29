import { describe, expect, it } from "vitest";

import { compareWithPR } from "@/features/purchase-orders/lib";

const pr = [
  { description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 },
  { description: "Ballpen, black", quantity: 3, unit: "box", estimatedCost: 120 },
];
const po = (over: Partial<{ description: string; quantity: number; unit: string; unitCost: number }>[] = []) =>
  pr.map((it, i) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitCost: it.estimatedCost, ...over[i] }));

describe("an order against its approved request (21 Oct 2026)", () => {
  it("finds no difference when the order copies the request", () => {
    expect(compareWithPR(pr, po())).toMatchObject({ changes: [], prTotal: 2860, poTotal: 2860, difference: 0 });
  });

  it("flags quantities and costs above the request as increases, and those below as not", () => {
    const { changes, difference } = compareWithPR(pr, po([{ quantity: 12 }, { unitCost: 100 }]));
    expect(changes).toEqual([
      { kind: "quantity", description: "Bond paper, A4", from: 10, to: 12, increase: true },
      { kind: "cost", description: "Ballpen, black", from: 120, to: 100, increase: false },
    ]);
    expect(difference).toBe(500 - 60);
  });

  it("matches by description ignoring case and spacing; new lines are added, missing ones removed", () => {
    const order = [
      { description: "  bond PAPER,  a4 ", quantity: 10, unit: "ream", unitCost: 250 },
      { description: "Stapler", quantity: 1, unit: "pc", unitCost: 300 },
    ];
    expect(compareWithPR(pr, order).changes).toEqual([
      { kind: "added", description: "Stapler", increase: true },
      { kind: "removed", description: "Ballpen, black", increase: false },
    ]);
  });

  it("notes a changed unit", () => {
    expect(compareWithPR(pr, po([{ unit: "box" }])).changes).toEqual([
      { kind: "unit", description: "Bond paper, A4", from: "ream", to: "box", increase: false },
    ]);
  });
});
