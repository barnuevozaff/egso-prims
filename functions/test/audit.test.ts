import { describe, expect, it } from "vitest";

import { actorOf, buildAuditEntry, PUBLIC_PORTAL, SYSTEM } from "../src/audit.js";

const now = new Date("2026-10-19T02:00:00Z");

describe("buildAuditEntry (log_audit, migration 047)", () => {
  it("records a staff member creating a purchase request", () => {
    const entry = buildAuditEntry({
      collection: "purchase_requests",
      docId: "PR-2026-000243",
      before: undefined,
      after: { pr_number: "PR-2026-000243", status: "Submitted" },
      actor: { user: "clerk@alaminos.gov.ph", role: "Authenticated User" },
      now,
    });
    expect(entry).toMatchObject({
      user_name: "clerk@alaminos.gov.ph",
      user_role: "Authenticated User",
      module: "Purchase Requests",
      action: "Record Created",
      document_number: "PR-2026-000243",
      previous_value: null,
      updated_value: "Status: Submitted",
      response: "Record Created via GSO PRIMS",
      severity: "Information",
    });
  });

  it("names writes without a signed-in user as the public portal", () => {
    const entry = buildAuditEntry({
      collection: "reservations",
      docId: "FR-2026-000010",
      before: undefined,
      after: { res_number: "FR-2026-000010", status: "Pending" },
      actor: PUBLIC_PORTAL,
      now,
    });
    expect(entry).toMatchObject({ user_name: "Public Portal", user_role: "Public Portal" });
  });

  it("marks deletions critical and shows the last status", () => {
    const entry = buildAuditEntry({
      collection: "energy_bills",
      docId: "b1",
      before: { account_number: "EA-1", payment_status: "Paid" },
      after: undefined,
      actor: { user: "clerk@alaminos.gov.ph", role: "Authenticated User" },
      now,
    });
    expect(entry).toMatchObject({
      action: "Record Deleted",
      severity: "Critical",
      previous_value: "Status: Paid",
      updated_value: "—",
      document_number: "EA-1",
    });
  });

  it("warns when a disposal request is approved", () => {
    const entry = buildAuditEntry({
      collection: "disposal_requests",
      docId: "d1",
      before: { request_no: "RAD-2026-000001", status: "Pending" },
      after: { request_no: "RAD-2026-000001", status: "Approved" },
      actor: { user: "admin@alaminos.gov.ph", role: "Authenticated User" },
      now,
    });
    expect(entry?.severity).toBe("Warning");
  });

  it("falls back to the document ID when nothing else names the record", () => {
    const entry = buildAuditEntry({
      collection: "fuel_transactions",
      docId: "abc-123",
      before: undefined,
      after: { amount: 1500 },
      actor: { user: "clerk@alaminos.gov.ph", role: "Authenticated User" },
      now,
    });
    expect(entry).toMatchObject({ document_number: "abc-123", updated_value: "Status: 1500" });
  });

  it("does not audit its own collections", () => {
    for (const collection of ["audit_logs", "notifications", "document_counters"]) {
      expect(
        buildAuditEntry({ collection, docId: "x", before: undefined, after: { a: 1 }, actor: PUBLIC_PORTAL, now }),
      ).toBeNull();
    }
  });
});

describe("actorOf — who a write is recorded under", () => {
  it("a portal submission (created_by_uid null) is the public portal", async () => {
    expect(await actorOf("service_account", undefined, undefined, { created_by_uid: null })).toBe(PUBLIC_PORTAL);
  });

  it("a write with no stamp and no signed-in account is the system, not the public", async () => {
    expect(await actorOf("service_account", undefined, { status: "A" }, { status: "B" })).toBe(SYSTEM);
    expect(await actorOf("unknown", undefined, { status: "A" }, undefined)).toBe(SYSTEM);
  });

  it("an unauthenticated write is the public portal", async () => {
    expect(await actorOf("unauthenticated", undefined, { status: "A" }, undefined)).toBe(PUBLIC_PORTAL);
  });

  it("an old stamp left on a record is not reused for a later unstamped write", async () => {
    const before = { updated_by_uid: "u1", updated_at: "t1", status: "A" };
    expect(await actorOf("service_account", undefined, before, { ...before, status: "B" })).toBe(SYSTEM);
  });
});
