import { describe, expect, it } from "vitest";

import { actionOf } from "../src/audit.js";
import {
  countersFrom,
  findDuplicates,
  normaliseValue,
  PLAN,
  prepareRecords,
  rewriteAttachment,
  totalsOf,
  transformRow,
} from "../migration/plan.ts";
import { SYNTHETIC } from "../migration/fixtures/synthetic.ts";

const plan = (table: string) => PLAN.find((p) => p.table === table)!;
const BASE = "https://storage.test/v0/b/demo/o";

describe("migration plan", () => {
  it("covers every table the app stores, except the retired ones", () => {
    const tables = PLAN.map((p) => p.table);
    for (const t of [
      "purchase_requests", "inventory_items", "energy_bills", "fuel_trips", "violations", "audit_logs",
      "disposition_schedules", "record_series", "inventory_appraisals", "inventory_records", "disposal_requests",
      "disposal_items", "record_shelves", "record_shelf_levels", "record_boxes", "record_box_contents",
    ]) {
      expect(tables).toContain(t);
    }
    for (const t of ["doc_counters", "record_files", "record_file_movements"]) expect(tables).not.toContain(t);
  });

  it("gives Records Room levels, boxes and contents the IDs the functions use", () => {
    const { data, extra, errors } = prepareRecords(SYNTHETIC);
    expect(errors).toEqual([]);
    expect(data.record_series[0].shelf_level_id).toBe("shelf-t1-A");
    expect(data.record_boxes[0]).toMatchObject({ id: "RDS-2026-01", shelf_level_id: "shelf-t1-A" });
    expect(data.record_box_contents[0]).toMatchObject({ id: "RDS-rds-t1", box_id: "RDS-2026-01", document_no: "RDS-2026-000001" });
    expect(extra).toEqual([
      { path: "record_box_positions/shelf-t1-A~1", doc: { box_id: "RDS-2026-01", shelf_id: "shelf-t1", level_id: "shelf-t1-A", slot: 1 } },
    ]);
    const orphan = prepareRecords({ ...SYNTHETIC, record_box_contents: [{ id: "c", box_id: "box-uuid-1", disposal_id: "gone" }] });
    expect(orphan.errors).toEqual(["record_box_contents: RAD gone is filed but not in the export"]);
  });

  it("keeps primary keys, but keys bills by their period as new bills are", () => {
    const pr = transformRow(plan("purchase_requests"), SYNTHETIC.purchase_requests[0], BASE);
    expect(pr.id).toBe("PR-2026-000041");
    const bill = transformRow(plan("energy_bills"), SYNTHETIC.energy_bills[0], BASE);
    expect(bill.id).toBe("eb-ea-t1-2026-08");
    expect(bill.doc).toMatchObject({ id: "eb-ea-t1-2026-08", legacy_id: "6f1c-uuid-1", doc_number: "EC-2026-000007" });
  });

  it("turns Postgres timestamps into ISO text and leaves dates alone", () => {
    expect(normaliseValue("2026-09-30 08:15:00+08")).toBe("2026-09-30T00:15:00.000Z");
    expect(normaliseValue("2026-09-30")).toBe("2026-09-30");
    expect(normaliseValue(42)).toBe(42);
  });

  it("recomputes generated columns and reports any the export disagrees with", () => {
    const ok = transformRow(plan("fuel_trips"), SYNTHETIC.fuel_trips[0], BASE);
    expect(ok.mismatches).toEqual([]);
    const bad = transformRow(plan("violations"), { ...SYNTHETIC.violations[1], outstanding_balance: 3 }, BASE);
    expect(bad.doc.outstanding_balance).toBe(1000);
    expect(bad.mismatches).toEqual(["outstanding_balance: export 3, recomputed 1000"]);
  });

  it("points attachments at Cloud Storage under attachments/", () => {
    const a = rewriteAttachment(
      { name: "q.pdf", url: "https://x.supabase.co/storage/v1/object/public/attachments/u1/q.pdf" },
      BASE,
    );
    expect(a).toMatchObject({ path: "attachments/u1/q.pdf", url: `${BASE}/attachments%2Fu1%2Fq.pdf?alt=media` });
  });

  it("finds repeated unique values Postgres would have refused", () => {
    const dupes = findDuplicates(plan("fuel_vehicles"), [
      { id: "a", plate_number: "TST 1" },
      { id: "b", plate_number: "TST 1" },
    ]);
    expect(dupes).toEqual(["fuel_vehicles: rows 1 and 2 share TST 1"]);
    expect(findDuplicates(plan("energy_bills"), [SYNTHETIC.energy_bills[0], { ...SYNTHETIC.energy_bills[0], id: "other" }])).toHaveLength(2);
  });

  it("builds counters at or above every number in use, with last_year, trips and the audit log", () => {
    const counters = Object.fromEntries(countersFrom(SYNTHETIC.document_counters, SYNTHETIC).map((c) => [c.id, c]));
    expect(counters["PR-2026"]).toMatchObject({ current_sequence: 41, last_year: 2026 });
    expect(counters["PO-2026"].current_sequence).toBe(12);
    expect(counters["PR-2025"].current_sequence).toBe(977);
    expect(counters["RIS-0"]).toMatchObject({ current_sequence: 3, last_year: 2026 });
    expect(counters["TRIP-2026-09"]).toMatchObject({ document_type: "TRIP", year: 2026, current_sequence: 14 });
    expect(counters["AUD-2026"].current_sequence).toBe(154);
    expect(counters["EC-2026"].current_sequence).toBe(8);
  });

  it("sums money and quantities to the centavo", () => {
    expect(totalsOf(plan("energy_bills"), SYNTHETIC.energy_bills)).toEqual({ amount: 25001, kwh: 1650 });
  });
});

describe("audit actions, as log_audit named them", () => {
  it("names the changes that have their own words", () => {
    expect(actionOf("violations", { payment_status: "Pending" }, { payment_status: "Paid" })).toBe("Payment Recorded");
    expect(actionOf("violations", { payment_status: "Pending" }, { payment_status: "Cancelled" })).toBe("Violation Cancelled");
    expect(actionOf("disposal_requests", { status: "Draft" }, { status: "Submitted" })).toBe("Disposal Requested");
    expect(actionOf("disposal_requests", { status: "Submitted" }, { status: "Approved" })).toBe("Disposal Authorised");
    expect(actionOf("disposition_schedules", { status: "Draft" }, { status: "Submitted" })).toBe("Schedule Submitted");
    expect(actionOf("inventory_appraisals", { status: "Returned" }, { status: "Approved" })).toBe("Schedule Approved");
    expect(actionOf("record_boxes", undefined, { slot: 1 })).toBe("Box Created");
    expect(actionOf("record_boxes", { slot: 1, shelf_level_id: "a" }, { slot: 2, shelf_level_id: "a" })).toBe("Box Moved");
    expect(actionOf("record_box_contents", undefined, { box_id: "b" })).toBe("Record Filed");
    expect(actionOf("record_box_contents", { box_id: "b" }, undefined)).toBe("Record Unfiled");
  });

  it("calls everything else created, updated or deleted", () => {
    expect(actionOf("purchase_requests", undefined, { status: "Submitted" })).toBe("Record Created");
    expect(actionOf("record_boxes", { slot: 1, label_override: null }, { slot: 1, label_override: "x" })).toBe("Record Updated");
    expect(actionOf("energy_bills", { amount: 1 }, undefined)).toBe("Record Deleted");
  });
});
