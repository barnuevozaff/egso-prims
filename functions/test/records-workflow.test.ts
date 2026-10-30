import { describe, expect, it } from "vitest";

import { assertPlaceable, assertStatusMove, NEXT_STATUS } from "../src/records/workflow.js";

describe("assertStatusMove — the moves a Records Management form may make", () => {
  it("lets a new form be kept as a draft or submitted, never approved", () => {
    expect(() => assertStatusMove("New", "Draft", "A disposition schedule")).not.toThrow();
    expect(() => assertStatusMove("New", "Submitted", "A disposition schedule")).not.toThrow();
    expect(() => assertStatusMove("New", "Approved", "A disposition schedule")).toThrow(/first made/);
    expect(() => assertStatusMove("New", "Returned", "A disposition schedule")).toThrow();
  });

  it("approves or returns only a submitted form", () => {
    expect(() => assertStatusMove("Submitted", "Approved", "RDS-2026-000001")).not.toThrow();
    expect(() => assertStatusMove("Submitted", "Returned", "RDS-2026-000001")).not.toThrow();
    expect(() => assertStatusMove("Draft", "Approved", "RDS-2026-000001")).toThrow(/is Draft and cannot go to Approved/);
    expect(() => assertStatusMove("Returned", "Approved", "RDS-2026-000001")).toThrow();
  });

  it("keeps a form where it is on a plain save", () => {
    for (const s of ["Draft", "Submitted", "Approved", "Returned"]) {
      expect(() => assertStatusMove(s, s, "RDS-2026-000001")).not.toThrow();
    }
  });

  it("takes an approved form only back for revision", () => {
    expect(() => assertStatusMove("Approved", "Returned", "RIA-2026-000001")).not.toThrow();
    expect(() => assertStatusMove("Approved", "Draft", "RIA-2026-000001")).toThrow();
    expect(() => assertStatusMove("Approved", "Submitted", "RIA-2026-000001")).toThrow();
  });

  it("refuses any move from a voided or unknown status", () => {
    expect(() => assertStatusMove("Cancelled", "Approved", "RAD-2026-000001")).toThrow();
    expect(NEXT_STATUS.Cancelled).toBeUndefined();
  });
});

describe("assertPlaceable — only an approved form goes in a box", () => {
  it("places an approved form", () => {
    expect(() => assertPlaceable("Approved", "RDS-2026-000003")).not.toThrow();
  });

  it("refuses every other status with the reason", () => {
    expect(() => assertPlaceable("Submitted", "RDS-2026-000003")).toThrow(/waiting for approval/);
    expect(() => assertPlaceable("Draft", "RDS-2026-000003")).toThrow(/is a draft/);
    expect(() => assertPlaceable("Returned", "RDS-2026-000003")).toThrow(/returned for revision/);
    expect(() => assertPlaceable("Cancelled", "RDS-2026-000003")).toThrow(/voided/);
    expect(() => assertPlaceable("", "RDS-2026-000003")).toThrow(/only an approved document/);
  });
});
