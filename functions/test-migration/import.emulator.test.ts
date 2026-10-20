import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertLocalTarget, readExport, runImport } from "../migration/import.ts";
import { SYNTHETIC } from "../migration/fixtures/synthetic.ts";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "../test-emulator/setup.js";

/**
 * The migration importer against the Firestore emulator alone — no Cloud
 * Functions running, as a real import runs before they are deployed.
 * Synthetic data only.
 */

let db: Firestore;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
});

describe("runImport", () => {
  it("imports the export with its claims and counters, and reconciles counts and totals", async () => {
    const report = await runImport(db, SYNTHETIC, { storageBase: "https://storage.test/v0/b/demo/o" });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.tables.every((t) => t.ok)).toBe(true);
    expect(report.skipped).toEqual([
      "document_counters (3 rows): rebuilt from the data and the counter rows (countersFrom)",
    ]);

    // The Records Room, in the shape functions/src/records expects.
    expect((await db.doc("record_shelf_levels/shelf-t1-A").get()).get("legacy_id")).toBe("lvl-uuid-a");
    expect((await db.doc("record_boxes/RDS-2026-01").get()).data()).toMatchObject({
      shelf_level_id: "shelf-t1-A",
      slot: 1,
      legacy_id: "box-uuid-1",
    });
    expect((await db.doc("record_box_positions/shelf-t1-A~1").get()).data()).toMatchObject({
      box_id: "RDS-2026-01",
      shelf_id: "shelf-t1",
    });
    expect((await db.doc("record_box_contents/RDS-rds-t1").get()).data()).toMatchObject({
      box_id: "RDS-2026-01",
      document_no: "RDS-2026-000001",
      agency: "Test Agency",
      date: "2026-08-01",
    });
    expect((await db.doc("unique_keys/disposition_schedules.schedule_no:RDS-2026-000001").get()).get("doc_id")).toBe("rds-t1");
    expect((await db.doc("document_counters/BOX-RDS-2026").get()).get("current_sequence")).toBe(1);
    expect((await db.doc("document_counters/RIA-2026").get()).get("current_sequence")).toBe(2);

    // Documents keep their keys; bills are keyed by period.
    expect((await db.doc("purchase_requests/PR-2026-000041").get()).get("created_at")).toBe("2026-09-30T00:15:00.000Z");
    expect((await db.doc("energy_bills/eb-ea-t1-2026-09").get()).get("legacy_id")).toBe("6f1c-uuid-2");
    expect(
      (await db.doc("purchase_requests/PR-2026-000041").get()).get("attachments")[0],
    ).toMatchObject({ path: "attachments/u1/q.pdf" });

    // Claims the app's rules expect, including a value with "/".
    for (const key of [
      "inventory_items.item_code:OS-0001",
      "energy_accounts.account_number:ACC-T-001",
      "energy_submeters.submeter_number:ea-t1~S-1",
      "fuel_vehicles.plate_number:TST 1234",
      "water_accounts.account_number:WAC%2FT%2F001",
      "violators.name_key:tester juan",
    ]) {
      expect((await db.doc(`unique_keys/${key}`).get()).exists, key).toBe(true);
    }

    // Counters at or above the data.
    expect((await db.doc("document_counters/PO-2026").get()).get("current_sequence")).toBe(12);
    expect((await db.doc("document_counters/TRIP-2026-09").get()).get("current_sequence")).toBe(14);

    const bills = report.tables.find((t) => t.table === "energy_bills")!;
    expect(bills.totalsTarget).toEqual({ amount: 25001, kwh: 1650 });
  });

  it("stops before writing anything when the export repeats a unique value", async () => {
    const bad = {
      ...SYNTHETIC,
      fuel_vehicles: [...SYNTHETIC.fuel_vehicles, { id: "fv-t2", plate_number: "TST 1234" }],
    };
    const report = await runImport(db, bad);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["fuel_vehicles: rows 1 and 2 share TST 1234"]);
    expect((await db.collection("purchase_requests").get()).empty).toBe(true);
  });

  it("stops on a value the new system cannot hold, naming it", async () => {
    const bad = { ...SYNTHETIC, inventory_items: [{ id: "inv-x", item_code: "OS/0009", on_hand: 1 }] };
    const report = await runImport(db, bad);
    expect(report.errors).toEqual([
      'inventory_items: row 1: item code "OS/0009" contains "/"; rename it before importing',
    ]);
    expect((await db.collection("inventory_items").get()).empty).toBe(true);
  });

  it("refuses a database that already holds documents", async () => {
    await runImport(db, SYNTHETIC);
    const again = await runImport(db, SYNTHETIC);
    expect(again.ok).toBe(false);
    expect(again.errors[0]).toMatch(/already holds documents/);
  });

  it("writes nothing on a dry run", async () => {
    const report = await runImport(db, SYNTHETIC, { dryRun: true });
    expect(report.ok).toBe(true);
    expect((await db.collection("purchase_requests").get()).empty).toBe(true);
  });

  it("reads an export folder of <table>.json files", () => {
    const dir = mkdtempSync(join(tmpdir(), "gso-export-"));
    writeFileSync(join(dir, "suppliers.json"), JSON.stringify(SYNTHETIC.suppliers));
    expect(readExport(dir)).toEqual({ suppliers: SYNTHETIC.suppliers });
  });

  it("will not run against anything but the local emulator and a demo project", () => {
    expect(() => assertLocalTarget("egso-b2c0a")).toThrow(/demo-\* emulator project/);
    expect(() => assertLocalTarget(PROJECT_ID)).not.toThrow();
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    process.env.FIRESTORE_EMULATOR_HOST = "firestore.googleapis.com:443";
    try {
      expect(() => assertLocalTarget(PROJECT_ID)).toThrow(/local emulator/);
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = host;
    }
  });
});
