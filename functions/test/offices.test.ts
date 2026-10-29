import { describe, expect, it } from "vitest";

import { cleanOfficeName, OFFICIAL_OFFICES, officeKey } from "../src/offices.js";

describe("the official office list (29 Oct 2026)", () => {
  it("is the municipality's 31 offices, each once", () => {
    expect(OFFICIAL_OFFICES).toHaveLength(31);
    expect(new Set(OFFICIAL_OFFICES.map(officeKey)).size).toBe(31);
    expect(OFFICIAL_OFFICES[0]).toBe("Office of the Municipal Accountant");
    expect(OFFICIAL_OFFICES[10]).toBe("General Services Office");
    expect(OFFICIAL_OFFICES[30]).toBe("Materials Recovery Facility");
  });

  it("matches names ignoring letter case and spacing", () => {
    expect(officeKey("  General   Services office ")).toBe(officeKey("General Services Office"));
  });

  it("tidies a name, and refuses one too short or too long", () => {
    expect(cleanOfficeName("  Public   Market ")).toBe("Public Market");
    expect(() => cleanOfficeName(" x ")).toThrow(/Enter the office's name/);
    expect(() => cleanOfficeName(undefined)).toThrow(/Enter the office's name/);
    expect(() => cleanOfficeName("x".repeat(121))).toThrow(/at most 120/);
  });
});
