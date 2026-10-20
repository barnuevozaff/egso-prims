import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Firestore } from "firebase-admin/firestore";

import {
  countersFrom,
  findDuplicates,
  NOT_IMPORTED,
  PLAN,
  prepareRecords,
  totalsOf,
  transformRow,
  type CounterDoc,
  type Row,
} from "./plan.ts";

/**
 * Imports a Supabase export into Firestore, then reconciles it.
 *
 * Emulator only for now: assertLocalTarget refuses anything but a local
 * emulator and a demo-* project. Running it against egso-b2c0a is a later,
 * separately approved step (docs/firebase/migration.md).
 *
 * Order of work, and why:
 *   1. Check the export: rows that repeat a unique value, which Postgres
 *      would have refused, stop the import before anything is written.
 *   2. Check the target is empty: an import is all or nothing; rerunning
 *      over a partial import is not supported.
 *   3. Write documents with their unique-value claims, in batches.
 *   4. Write the document counters, raised to the highest number in use.
 *   5. Read everything back: counts and money totals must match the export.
 *
 * Run it BEFORE the Cloud Functions are deployed: every imported write would
 * otherwise fire recordEvents and file an audit entry and notification per
 * row.
 */

export interface TableResult {
  table: string;
  collection: string;
  source: number;
  written: number;
  target: number;
  mismatches: string[];
  totalsSource: Record<string, number>;
  totalsTarget: Record<string, number>;
  ok: boolean;
}

export interface ImportReport {
  ok: boolean;
  dryRun: boolean;
  errors: string[];
  /** Tables in the export that are not imported, with the reason. */
  skipped: string[];
  tables: TableResult[];
  claims: number;
  counters: CounterDoc[];
}

/** Refuses anything that is not the local emulator under a demo-* project. */
export function assertLocalTarget(projectId: string | undefined): void {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error("FIRESTORE_EMULATOR_HOST must point at the local emulator; refusing to import.");
  }
  if (!projectId || !projectId.startsWith("demo-")) {
    throw new Error(`Imports run only against a demo-* emulator project, not ${projectId ?? "(none)"}.`);
  }
}

/** Reads `<table>.json` files (each an array of rows) from a folder. */
export function readExport(dir: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const rows: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!Array.isArray(rows)) throw new Error(`${file} must hold an array of rows.`);
    out[file.slice(0, -5)] = rows as Row[];
  }
  return out;
}

const BATCH = 400;

export async function runImport(
  db: Firestore,
  exported: Record<string, Row[]>,
  options: { dryRun?: boolean; storageBase?: string } = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? false;
  const storageBase = options.storageBase ?? "https://firebasestorage.googleapis.com/v0/b/BUCKET/o";
  const report: ImportReport = { ok: false, dryRun, errors: [], skipped: [], tables: [], claims: 0, counters: [] };
  // Records Room tables take the IDs functions/src/records uses.
  const prepared = prepareRecords(exported);
  const data = prepared.data;
  report.errors.push(...prepared.errors);

  const known = new Set(PLAN.map((p) => p.table));
  for (const table of Object.keys(data)) {
    if (known.has(table)) continue;
    report.skipped.push(`${table} (${data[table].length} rows): ${NOT_IMPORTED[table] ?? "not in the migration plan"}`);
  }

  // 1. The export itself: repeated unique values, and values the new system
  // cannot hold. (Claim keys start with their collection, so two tables
  // never compete for one.)
  for (const plan of PLAN) report.errors.push(...findDuplicates(plan, data[plan.table] ?? []));

  // 2. The target.
  for (const plan of [...PLAN.map((p) => p.collection), "unique_keys", "document_counters", "record_box_positions"]) {
    if (!(await db.collection(plan).limit(1).get()).empty) {
      report.errors.push(`${plan} already holds documents; import only into an empty database.`);
    }
  }
  if (report.errors.length) return report;

  // 3. Documents and their claims.
  const transformed = PLAN.map((plan) => ({
    plan,
    rows: (data[plan.table] ?? []).map((r) => ({ source: r, ...transformRow(plan, r, storageBase) })),
  }));
  const at = new Date().toISOString();
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending && !dryRun) await batch.commit();
    batch = db.batch();
    pending = 0;
  };
  const write = async (path: string, doc: Row) => {
    batch.set(db.doc(path), doc);
    if (++pending >= BATCH) await flush();
  };
  for (const { plan, rows } of transformed) {
    for (const r of rows) {
      await write(`${plan.collection}/${r.id}`, r.doc);
      for (const key of plan.claims?.(r.source) ?? []) {
        await write(`unique_keys/${key}`, { collection: plan.collection, doc_id: r.id, created_at: at, migrated: true });
        report.claims += 1;
      }
    }
  }

  for (const e of prepared.extra) await write(e.path, e.doc);

  // 4. Counters.
  report.counters = countersFrom(data.document_counters ?? [], data);
  for (const c of report.counters) {
    await write(`document_counters/${c.id}`, {
      document_type: c.document_type,
      year: c.year,
      current_sequence: c.current_sequence,
      ...(c.last_year !== undefined ? { last_year: c.last_year } : {}),
      updated_at: new Date(),
    });
  }
  await flush();

  // 5. Reconciliation.
  for (const { plan, rows } of transformed) {
    const target = dryRun ? rows.map((r) => r.doc) : (await db.collection(plan.collection).get()).docs.map((d) => d.data());
    const result: TableResult = {
      table: plan.table,
      collection: plan.collection,
      source: (data[plan.table] ?? []).length,
      written: rows.length,
      target: target.length,
      mismatches: rows.flatMap((r) => r.mismatches.map((m) => `${r.id}: ${m}`)),
      totalsSource: totalsOf(plan, data[plan.table] ?? []),
      totalsTarget: totalsOf(plan, target),
      ok: false,
    };
    result.ok =
      result.source === result.target &&
      Object.keys(result.totalsSource).every((k) => result.totalsSource[k] === result.totalsTarget[k]);
    if (!result.ok) report.errors.push(`${plan.table}: did not reconcile (${result.source} rows in, ${result.target} found).`);
    report.tables.push(result);
  }
  report.ok = report.errors.length === 0;
  return report;
}
