import { describe, expect, it } from "vitest";

import { isAccountToken } from "../src/accounts.js";
import { assertAllowedProject } from "../src/project.js";

describe("isAccountToken: every console-created account is an Administrator (29 Oct 2026)", () => {
  it("accepts an email-and-password session, any domain, with no claims", () => {
    for (const email of ["egsoalaminos@gmail.com", "clerk@alaminos.gov.ph"]) {
      expect(isAccountToken({ email, firebase: { sign_in_provider: "password" } })).toBe(true);
    }
  });

  it("refuses anonymous, custom-token and email-less sessions, and no session", () => {
    expect(isAccountToken({ email: "x@gmail.com", firebase: { sign_in_provider: "anonymous" } })).toBe(false);
    expect(isAccountToken({ email: "x@gmail.com", firebase: { sign_in_provider: "custom" } })).toBe(false);
    expect(isAccountToken({ email: " ", firebase: { sign_in_provider: "password" } })).toBe(false);
    expect(isAccountToken({ firebase: { sign_in_provider: "password" } })).toBe(false);
    expect(isAccountToken(undefined)).toBe(false);
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
