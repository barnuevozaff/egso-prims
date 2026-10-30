import { describe, expect, it } from "vitest";

import { fitBlankLines } from "@/features/shared/print-fit";

// A sheet 1000px tall, 18px ruled lines, 50px column heads, a 300px ending.
const PAGE = 1000;
const base = { head: 50, blank: 18, end: 300 };

describe("ruled lines fitted to the sheets (30 Oct 2026)", () => {
  it("an order that fits one sheet keeps the template's lines", () => {
    // 300 + 3 lines + 14 blanks = 606, and the ending to 906: one sheet.
    const n = fitBlankLines({ ...base, first: 300, lines: [18, 18, 18] }, 14, PAGE);
    expect(n).toBe(14);
  });

  it("an order whose ending does not fit rules this sheet to its foot and the next down to the ending", () => {
    // 17 wrapped lines end at 930; the 300px ending cannot follow on this sheet.
    const n = fitBlankLines({ ...base, first: 420, lines: Array(17).fill(30) }, 0, PAGE);
    // Three lines finish sheet one (948, 966, 984); on sheet two, under the heads at 50,
    // 36 lines bring the ending to 698 + 300 = 998, at the foot.
    expect(n).toBe(3 + 36);
  });

  it("a long order fills its last sheet so the ending sits at the foot", () => {
    // 60 lines of 18px from 400: sheet one holds 33 (to 994), sheet two the other 27 (50 + 486 = 536).
    const n = fitBlankLines({ ...base, first: 400, lines: Array(60).fill(18) }, 0, PAGE);
    // From 536, lines while the ending still fits: 536 + 18k + 300 <= 1000, k = 9 (698 + 300 = 998).
    expect(n).toBe(9);
  });

  it("nothing measured yet: the template's lines", () => {
    expect(fitBlankLines({ ...base, blank: 0, first: 0, lines: [] }, 17, PAGE)).toBe(17);
  });
});
