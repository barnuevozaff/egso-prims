import { describe, expect, it } from "vitest";

import { isOfficeEmail } from "../src/accounts.js";
import { assertAllowedProject } from "../src/project.js";

describe("isOfficeEmail (enforce_office_domain, migration 036)", () => {
  it("accepts office addresses in any letter case", () => {
    expect(isOfficeEmail("Clerk@Alaminos.gov.ph")).toBe(true);
  });

  it("rejects other domains, look-alikes and missing addresses", () => {
    for (const email of ["clerk@gmail.com", "clerk@alaminos.gov.ph.evil.com", "alaminos.gov.ph", "", null]) {
      expect(isOfficeEmail(email)).toBe(false);
    }
  });
});

describe("assertAllowedProject", () => {
  it("allows GSO PRIMS and offline emulator projects", () => {
    expect(assertAllowedProject("egso-b2c0a")).toBe("egso-b2c0a");
    expect(assertAllowedProject("demo-egso-prims")).toBe("demo-egso-prims");
  });

  it("refuses the municipality's live project by name", () => {
    expect(() => assertAllowedProject("alaminos-municipality")).toThrow(/off-limits/);
  });

  it("refuses the retired development project by name", () => {
    expect(() => assertAllowedProject("egso-2k26")).toThrow(/off-limits/);
  });

  it("refuses look-alikes, other projects and a missing project", () => {
    for (const id of ["egso-b2c0a-copy", "EGSO-B2C0A", " egso-b2c0a", "egso", "some-other-project", ""]) {
      expect(() => assertAllowedProject(id)).toThrow();
    }
    expect(() => assertAllowedProject(undefined)).toThrow(/No Firebase project/);
  });
});
