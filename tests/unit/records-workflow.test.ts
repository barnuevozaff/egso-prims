import { describe, expect, it } from "vitest";

import { filingState, NEXT_STATUS, pageMoves, recordActions, savedMessage } from "@/features/records/workflow";
import { NEXT_STATUS as SERVER_NEXT } from "../../functions/src/records/workflow";

describe("Records Management workflow on screen", () => {
  it("offers only moves the server accepts", () => {
    for (const from of [null, "Draft", "Submitted", "Approved", "Returned"] as const) {
      for (const a of recordActions(from)) {
        expect(NEXT_STATUS[from ?? "New"]).toContain(a.to);
      }
    }
  });

  it("holds the same table as saveRecordsDocument", () => {
    expect(NEXT_STATUS).toEqual(SERVER_NEXT);
  });

  it("puts the next step first and asks before approving or returning", () => {
    expect(recordActions(null)[0]).toMatchObject({ to: "Submitted", kind: "primary" });
    expect(recordActions("Draft")[0]).toMatchObject({ to: "Submitted", kind: "primary" });
    expect(recordActions("Returned")[0]).toMatchObject({ to: "Submitted", kind: "primary" });
    const submitted = recordActions("Submitted", "RDS-2026-000002");
    expect(submitted[0]).toMatchObject({ to: "Approved", kind: "primary" });
    expect(submitted[0].confirm?.title).toBe("Approve RDS-2026-000002?");
    expect(submitted.find((a) => a.to === "Returned")).toMatchObject({ kind: "back" });
    expect(submitted.find((a) => a.to === "Returned")?.confirm).toBeDefined();
    expect(recordActions("Approved").find((a) => a.to === "Returned")?.confirm).toBeDefined();
  });

  it("never offers approval to a draft or a new form", () => {
    for (const from of [null, "Draft", "Returned"] as const) {
      expect(recordActions(from).map((a) => a.to)).not.toContain("Approved");
    }
  });

  it("names the step a save took", () => {
    expect(savedMessage("RDS-2026-000002", "Submitted", "Approved")).toMatch(/approved/);
    expect(savedMessage("RDS-2026-000002", "Draft", "Draft")).toMatch(/changes saved/);
    expect(savedMessage("RDS-2026-000002", null, "Submitted")).toMatch(/submitted for approval/);
  });
});

describe("filing in the Records Room", () => {
  it("offers Place only to an approved form in no box", () => {
    expect(filingState("Approved", false)).toMatchObject({ kind: "unplaced", canPlace: true, canLocate: false });
    for (const status of ["Draft", "Submitted", "Returned", "Cancelled"] as const) {
      expect(filingState(status, false).canPlace).toBe(false);
    }
  });

  it("says why a form that is not approved cannot be placed", () => {
    expect(filingState("Submitted", false).note).toMatch(/once it is approved/);
    expect(filingState("Draft", false).note).toMatch(/submitted and approved/);
    expect(filingState("Returned", false).note).toMatch(/Returned for revision/);
    expect(filingState("Cancelled", false).note).toMatch(/voided form is not placed/);
  });

  it("offers Locate, not Place, once it is in a box; a voided one is neither placed nor located", () => {
    expect(filingState("Approved", true)).toMatchObject({ kind: "filed", canPlace: false, canLocate: true });
    expect(filingState("Cancelled", true)).toMatchObject({ kind: "voided", canPlace: false, canLocate: false });
  });
});

describe("the steps on a record page", () => {
  it("offers only real moves, never a plain save", () => {
    expect(pageMoves("Draft").map((a) => a.to)).toEqual(["Submitted"]);
    expect(pageMoves("Submitted").map((a) => a.to)).toEqual(["Approved", "Returned"]);
    expect(pageMoves("Returned").map((a) => a.to)).toEqual(["Submitted"]);
    expect(pageMoves("Approved").map((a) => a.to)).toEqual(["Returned"]);
    expect(pageMoves("Cancelled")).toEqual([]);
  });
});
