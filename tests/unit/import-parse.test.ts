import { describe, expect, it } from "vitest";

import type { OcrWord } from "../../src/features/inventory/smart-import/ocr";
import { parseRows } from "../../src/features/inventory/smart-import/parse";

/** Words laid out as on a page: each word's box starts at x, on line y. */
function line(y: number, cells: [string, number][]): OcrWord[] {
  return cells.flatMap(([text, x]) => {
    let at = x;
    return text.split(" ").map((t) => {
      const w = { text: t, confidence: 95, x0: at, x1: at + t.length * 7, y0: y, y1: y + 12, page: 1 };
      at = w.x1 + 4;
      return w;
    });
  });
}

describe("Scan / Import reads an itemized table (22 Oct 2026)", () => {
  // The official PR table: Item No. | Unit | Item Description | Quantity | Unit Cost | Total Cost
  const header = line(100, [["Item No.", 20], ["Unit", 110], ["Item Description", 180], ["Quantity", 420], ["Unit Cost", 510], ["Total Cost", 620]]);
  const rows = [
    ...line(130, [["1", 30], ["ream", 110], ["Bond paper A4", 180], ["10", 430], ["250.00", 515], ["2,500.00", 625]]),
    ...line(160, [["2", 30], ["pc", 110], ["Correction tape", 180], ["5", 430], ["35.50", 515], ["177.50", 625]]),
    ...line(190, [["Total", 180], ["2,677.50", 625]]),
  ];
  const { rows: out, usedHeader } = parseRows([...header, ...rows]);

  it("finds the header and every item row, and skips the total line", () => {
    expect(usedHeader).toBe(true);
    expect(out.map((r) => r.itemName)).toEqual(["Bond paper A4", "Correction tape"]);
  });

  it("takes the unit price from Unit Cost, never from the Total Cost column", () => {
    expect(out.map((r) => [r.unit, r.quantity, r.unitCost, r.lineTotal])).toEqual([
      ["ream", "10", "250.00", "2500.00"],
      ["pc", "5", "35.50", "177.50"],
    ]);
  });

  it("marks a guessed category as a suggestion to check, never as read from the document", () => {
    for (const r of out) {
      if (r.category) expect(r.categorySource).toBe("suggested");
      expect(r.uncertain.category).toBe(true);
    }
  });

  it("leaves the unit price blank and flagged when only an amount is printed", () => {
    const amountOnly = parseRows([
      ...line(100, [["Description", 20], ["Qty", 300], ["Amount", 400]]),
      ...line(130, [["Folder long", 20], ["20", 305], ["300.00", 405]]),
    ]).rows;
    expect(amountOnly).toHaveLength(1);
    expect(amountOnly[0]).toMatchObject({ itemName: "Folder long", quantity: "20", unitCost: "", lineTotal: "300.00" });
    expect(amountOnly[0].uncertain.unitCost).toBe(true);
  });
});
