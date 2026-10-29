import { describe, expect, it } from "vitest";

import { SIGNATORY_ROLES } from "@/features/config/types";
import { capitalizeFirstLetter, prSummary } from "@/features/purchase-requests/types";

describe("item descriptions on the official form (21 Oct 2026)", () => {
  it("capitalises only the first letter and keeps everything else as typed", () => {
    expect(capitalizeFirstLetter("bond paper a4")).toBe("Bond paper a4");
    expect(capitalizeFirstLetter("alcohol 70% 500ml")).toBe("Alcohol 70% 500ml");
    expect(capitalizeFirstLetter("EPSON ink bottle 003")).toBe("EPSON ink bottle 003");
    expect(capitalizeFirstLetter("USB Type-C cable")).toBe("USB Type-C cable");
    // The first *letter*, after any leading figures or symbols.
    expect(capitalizeFirstLetter("3-ply face mask")).toBe("3-Ply face mask");
    expect(capitalizeFirstLetter("(blue) ballpen")).toBe("(Blue) ballpen");
    expect(capitalizeFirstLetter("")).toBe("");
    expect(capitalizeFirstLetter("500")).toBe("500");
  });
});

describe("summaries and signatories", () => {
  it("names a request by its purpose, else its first item, never an invented purpose", () => {
    const items = [{ id: "1", description: "Bond paper", quantity: 1, unit: "ream", estimatedCost: 1 }];
    expect(prSummary({ purpose: "Q4 supplies", items, prNumber: "PR-1" })).toBe("Q4 supplies");
    expect(prSummary({ purpose: "", items, prNumber: "PR-1" })).toBe("Bond paper");
    expect(prSummary({ purpose: "", items: [], prNumber: "PR-1" })).toBe("PR-1");
  });

  it("the forms' signatory roles and designations are fixed: three on the PR, two on the PO (21 Oct 2026)", () => {
    expect(SIGNATORY_ROLES.Signatories.map((r) => [r.role, r.designation])).toEqual([
      ["Requested by", "General Services Officer"],
      ["Cash Availability", "Municipal Treasurer"],
      ["Approved by", "Municipal Mayor"],
    ]);
    expect(SIGNATORY_ROLES["PO Signatories"].map((r) => [r.role, r.designation])).toEqual([
      ["Very truly yours", "Municipal Mayor"],
      ["Certified Correct", "BAC Secretary"],
    ]);
  });
});
