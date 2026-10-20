/**
 * Supabase → Firestore migration plan: which table becomes which collection,
 * under which document ID, with which unique-value claims, which columns
 * Postgres generated, and which totals must reconcile.
 *
 * Pure functions only, so the plan is unit-tested without a database
 * (functions/test/migration-plan.test.ts) and the importer
 * (migration/import.ts) only reads files and writes documents.
 *
 * Source format: one JSON file per table, `<table>.json`, an array of rows
 * with the Postgres column names — what the Supabase table editor's export
 * or `select *` through PostgREST returns. Document IDs keep the existing
 * primary key (docs/firebase/data-model.md), except bills, whose ID becomes
 * their billing period, as new bills get (see `rekey`).
 */

export type Row = Record<string, unknown>;

export interface TablePlan {
  table: string;
  collection: string;
  /** Firestore document ID for a source row. */
  idOf: (row: Row) => string;
  /** unique_keys claim IDs the document holds (data-model.md, "Unique keys"). */
  claims?: (row: Row) => string[];
  /** Columns Postgres generated, recomputed here and compared with the export. */
  generated?: (row: Row) => Row;
  /** Columns whose sum must match before and after (reconciliation). */
  totals?: string[];
  /** The document number field, for counters and duplicate checks. */
  numberField?: string;
  /** Fields that must be unique across the table (besides the ID). */
  unique?: (row: Row) => string | null;
  /** A row the new system cannot hold as it is: the reason, or null. */
  invalid?: (row: Row) => string | null;
}

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v ?? 0);
const pad2 = (v: unknown) => String(v).padStart(2, "0");

/** Same as claimKey in src/lib/firestore.ts: "/" cannot be in a document ID. */
export const claimKey = (collection: string, field: string, value: string) =>
  `${collection}.${field}:${value.replaceAll("/", "%2F")}`;

/** As normalizeName in src/features/violations/lib.ts and name_key in migration 030. */
export const normalizeName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const byId = (row: Row) => s(row.id);
const period = (prefix: string, parent: string) => (row: Row) =>
  `${prefix}-${s(row[parent])}-${s(row.billing_year)}-${pad2(row.billing_month)}`;

const tripFuel = (r: Row): Row => {
  const distance = n(r.ending_odometer) - n(r.beginning_odometer);
  const kmpl = n(r.km_per_liter);
  const used = kmpl ? distance / kmpl : null;
  return {
    distance_travelled: distance,
    fuel_total: n(r.beginning_fuel) + n(r.fuel_added),
    fuel_used: used,
    ending_fuel: used === null ? null : n(r.beginning_fuel) + n(r.fuel_added) - used,
  };
};

/**
 * Everything the app stores, in dependency order (parents before children).
 */
export const PLAN: TablePlan[] = [
  { table: "suppliers", collection: "suppliers", idOf: byId },
  { table: "system_configuration", collection: "system_configuration", idOf: byId },
  {
    table: "purchase_requests",
    collection: "purchase_requests",
    idOf: (r) => s(r.pr_number || r.id),
    numberField: "pr_number",
  },
  { table: "purchase_orders", collection: "purchase_orders", idOf: (r) => s(r.po_number || r.id), numberField: "po_number" },
  { table: "ris_requests", collection: "ris_requests", idOf: (r) => s(r.ris_number || r.id), numberField: "ris_number" },
  { table: "reservations", collection: "reservations", idOf: (r) => s(r.res_number || r.id), numberField: "res_number" },
  {
    table: "inventory_items",
    collection: "inventory_items",
    idOf: byId,
    claims: (r) => [`inventory_items.item_code:${s(r.item_code)}`],
    unique: (r) => s(r.item_code),
    // The app has never accepted "/" in an item code (firestore.rules,
    // claimsItsCode); one that slipped into Supabase must be renamed first.
    invalid: (r) => (s(r.item_code).includes("/") ? `item code "${s(r.item_code)}" contains "/"; rename it before importing` : null),
    totals: ["on_hand"],
  },
  { table: "stock_card", collection: "stock_card", idOf: byId, totals: ["quantity_in", "quantity_out"] },
  {
    table: "energy_accounts",
    collection: "energy_accounts",
    idOf: byId,
    claims: (r) => [claimKey("energy_accounts", "account_number", s(r.account_number))],
    unique: (r) => s(r.account_number),
  },
  {
    table: "energy_bills",
    collection: "energy_bills",
    idOf: period("eb", "account_id"),
    unique: period("eb", "account_id"),
    totals: ["amount", "kwh"],
    numberField: "doc_number",
  },
  {
    table: "energy_submeters",
    collection: "energy_submeters",
    idOf: byId,
    claims: (r) => [claimKey("energy_submeters", "submeter_number", `${s(r.account_id)}~${s(r.submeter_number)}`)],
    unique: (r) => `${s(r.account_id)}~${s(r.submeter_number)}`,
  },
  {
    table: "energy_submeter_bills",
    collection: "energy_submeter_bills",
    idOf: period("esb", "submeter_id"),
    unique: period("esb", "submeter_id"),
    totals: ["amount", "consumption"],
  },
  {
    table: "water_accounts",
    collection: "water_accounts",
    idOf: byId,
    claims: (r) => [claimKey("water_accounts", "account_number", s(r.account_number))],
    unique: (r) => s(r.account_number),
  },
  {
    table: "water_bills",
    collection: "water_bills",
    idOf: period("wb", "account_id"),
    unique: period("wb", "account_id"),
    totals: ["amount", "consumption"],
    numberField: "doc_number",
  },
  {
    table: "water_submeters",
    collection: "water_submeters",
    idOf: byId,
    claims: (r) => [claimKey("water_submeters", "submeter_number", `${s(r.account_id)}~${s(r.submeter_number)}`)],
    unique: (r) => `${s(r.account_id)}~${s(r.submeter_number)}`,
  },
  {
    table: "water_submeter_bills",
    collection: "water_submeter_bills",
    idOf: period("wsb", "submeter_id"),
    unique: period("wsb", "submeter_id"),
    totals: ["amount", "consumption"],
  },
  {
    table: "water_meter_readings",
    collection: "water_meter_readings",
    idOf: byId,
    generated: (r) => ({ consumption: n(r.current_reading) - n(r.previous_reading) }),
    totals: ["amount"],
  },
  {
    table: "fuel_vehicles",
    collection: "fuel_vehicles",
    idOf: byId,
    claims: (r) => [claimKey("fuel_vehicles", "plate_number", s(r.plate_number))],
    unique: (r) => s(r.plate_number),
  },
  {
    table: "fuel_transactions",
    collection: "fuel_transactions",
    idOf: byId,
    generated: (r) => ({ total_amount: n(r.liters) * n(r.price_per_liter) }),
    totals: ["liters", "total_amount"],
    numberField: "doc_number",
  },
  {
    table: "fuel_odometer_readings",
    collection: "fuel_odometer_readings",
    idOf: byId,
    generated: (r) => ({ distance: n(r.current_odometer) - n(r.previous_odometer) }),
    totals: ["fuel_cost", "fuel_liters"],
  },
  {
    table: "fuel_trips",
    collection: "fuel_trips",
    idOf: byId,
    generated: tripFuel,
    unique: (r) => s(r.control_no) || null,
  },
  {
    table: "violators",
    collection: "violators",
    idOf: byId,
    generated: (r) => ({ name_key: normalizeName(s(r.full_name)) }),
    claims: (r) => [`violators.name_key:${normalizeName(s(r.full_name)).replaceAll("/", " ")}`],
    unique: (r) => normalizeName(s(r.full_name)),
  },
  {
    table: "violations",
    collection: "violations",
    idOf: (r) => s(r.violation_no || r.id),
    generated: (r) => ({ outstanding_balance: n(r.amount) - n(r.amount_paid) }),
    totals: ["amount", "amount_paid"],
    numberField: "violation_no",
  },
  { table: "notifications", collection: "notifications", idOf: byId },
  { table: "audit_logs", collection: "audit_logs", idOf: byId },

  // Records Management. These tables are reshaped first by prepareRecords
  // (levels, boxes and contents get the IDs functions/src/records uses).
  {
    table: "disposition_schedules",
    collection: "disposition_schedules",
    idOf: byId,
    claims: (r) => [`disposition_schedules.schedule_no:${s(r.schedule_no)}`],
    unique: (r) => s(r.schedule_no),
    numberField: "schedule_no",
  },
  {
    table: "record_series",
    collection: "record_series",
    idOf: byId,
    generated: (r) => ({ retention_total: n(r.retention_active) + n(r.retention_storage) }),
    unique: (r) => `${s(r.schedule_id)}#${s(r.item_number)}`,
  },
  {
    table: "inventory_appraisals",
    collection: "inventory_appraisals",
    idOf: byId,
    claims: (r) => [`inventory_appraisals.inventory_no:${s(r.inventory_no)}`],
    unique: (r) => s(r.inventory_no),
    numberField: "inventory_no",
  },
  {
    table: "inventory_records",
    collection: "inventory_records",
    idOf: byId,
    generated: (r) => ({ retention_total: n(r.retention_active) + n(r.retention_storage) }),
    unique: (r) => `${s(r.appraisal_id)}#${s(r.item_number)}`,
  },
  {
    table: "disposal_requests",
    collection: "disposal_requests",
    idOf: byId,
    claims: (r) => [`disposal_requests.request_no:${s(r.request_no)}`],
    unique: (r) => s(r.request_no),
    numberField: "request_no",
  },
  {
    table: "disposal_items",
    collection: "disposal_items",
    idOf: byId,
    unique: (r) => `${s(r.request_id)}#${s(r.item_number)}`,
  },
  { table: "record_shelves", collection: "record_shelves", idOf: byId },
  { table: "record_shelf_levels", collection: "record_shelf_levels", idOf: byId, unique: (r) => s(r.id) },
  { table: "record_boxes", collection: "record_boxes", idOf: byId, unique: (r) => `${s(r.shelf_level_id)}~${s(r.slot)}` },
  { table: "record_box_contents", collection: "record_box_contents", idOf: byId },
];

const RECORDS_FORMS = {
  RDS: { table: "disposition_schedules", column: "schedule_id", number: "schedule_no", agency: "agency_name", date: "date_prepared" },
  RIA: { table: "inventory_appraisals", column: "appraisal_id", number: "inventory_no", agency: "office_name", date: "date_prepared" },
  RAD: { table: "disposal_requests", column: "disposal_id", number: "request_no", agency: "agency_name", date: "request_date" },
} as const;

/**
 * Reshapes the Records Room tables into the IDs functions/src/records uses,
 * so one box per position and one place per document hold as document IDs:
 *   record_shelf_levels/{shelfId}-{A..E}
 *   record_boxes/{type}-{year}-{nn}           (+ record_box_positions/{level}~{slot})
 *   record_box_contents/{type}-{documentId}   (with the document's number, agency, date)
 * References are rewritten to the new IDs; the old ones are kept as legacy_id.
 */
export function prepareRecords(data: Record<string, Row[]>): {
  data: Record<string, Row[]>;
  extra: { path: string; doc: Row }[];
  errors: string[];
} {
  const out = { ...data };
  const extra: { path: string; doc: Row }[] = [];
  const errors: string[] = [];

  const levelIds = new Map<string, string>();
  const levelShelf = new Map<string, string>();
  if (data.record_shelf_levels) {
    out.record_shelf_levels = data.record_shelf_levels.map((l) => {
      const id = `${s(l.shelf_id)}-${s(l.label)}`;
      levelIds.set(s(l.id), id);
      levelShelf.set(id, s(l.shelf_id));
      return { ...l, id, legacy_id: l.id };
    });
  }
  const level = (old: unknown) => levelIds.get(s(old)) ?? (old === null || old === undefined ? null : s(old));
  if (data.record_series) {
    out.record_series = data.record_series.map((r) => ({ ...r, shelf_level_id: level(r.shelf_level_id) }));
  }

  const boxIds = new Map<string, string>();
  if (data.record_boxes) {
    out.record_boxes = data.record_boxes.map((b) => {
      const id = `${s(b.document_type)}-${s(b.year)}-${pad2(b.sequence)}`;
      boxIds.set(s(b.id), id);
      const levelId = level(b.shelf_level_id);
      if (!levelId || !levelShelf.has(levelId)) errors.push(`record_boxes: box ${id} stands on an unknown shelf level`);
      extra.push({
        path: `record_box_positions/${levelId}~${s(b.slot)}`,
        doc: { box_id: id, shelf_id: levelShelf.get(String(levelId)) ?? null, level_id: levelId, slot: n(b.slot) },
      });
      return { ...b, id, legacy_id: b.id, shelf_level_id: levelId };
    });
  }

  if (data.record_box_contents) {
    out.record_box_contents = data.record_box_contents.flatMap((c) => {
      const type = (Object.keys(RECORDS_FORMS) as (keyof typeof RECORDS_FORMS)[]).find((t) => c[RECORDS_FORMS[t].column]);
      if (!type) {
        errors.push(`record_box_contents: row ${s(c.id)} names no document`);
        return [];
      }
      const form = RECORDS_FORMS[type];
      const source = s(c[form.column]);
      const header = (data[form.table] ?? []).find((h) => s(h.id) === source);
      if (!header) errors.push(`record_box_contents: ${type} ${source} is filed but not in the export`);
      return [
        {
          id: `${type}-${source}`,
          legacy_id: c.id,
          box_id: boxIds.get(s(c.box_id)) ?? s(c.box_id),
          document_type: type,
          source_id: source,
          document_no: s(header?.[form.number]),
          agency: s(header?.[form.agency]),
          date: s(header?.[form.date]),
          filed_at: c.filed_at,
          updated_at: c.filed_at,
        },
      ];
    });
  }
  return { data: out, extra, errors };
}

/** Tables the plan knows but does not import, with the reason. */
export const NOT_IMPORTED: Record<string, string> = {
  doc_counters: "retired in migration 039",
  record_files: "dropped in migration 046",
  record_file_movements: "dropped in migration 046",
  document_counters: "rebuilt from the data and the counter rows (countersFrom)",
};

/* ---------------- transforms ---------------- */

/** Postgres timestamptz text → ISO 8601 UTC, as the mappers read today; dates stay yyyy-MM-dd. */
export function normaliseValue(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(v)) {
    // Postgres writes the offset as +08 or +0800; JavaScript needs +08:00.
    const iso = v.replace(" ", "T").replace(/([+-]\d{2})(\d{2})?$/, (_m, h: string, m?: string) => `${h}:${m ?? "00"}`);
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return v;
}

/**
 * A Supabase Storage public URL or path → its place in Cloud Storage. Files
 * keep their path under attachments/; the URL is rebuilt once the files are
 * copied (docs/firebase/migration.md, "Attachments").
 */
export function rewriteAttachment(a: Row, storageBase: string): Row {
  const fromUrl = s(a.url).match(/\/storage\/v1\/object\/(?:public|sign)\/attachments\/([^?]+)/)?.[1];
  const path = s(a.path) || (fromUrl ? decodeURIComponent(fromUrl) : "");
  if (!path) return a;
  const target = path.startsWith("attachments/") ? path : `attachments/${path}`;
  return { ...a, path: target, url: `${storageBase}/${encodeURIComponent(target)}?alt=media` };
}

export interface Transformed {
  id: string;
  doc: Row;
  /** Generated columns whose exported value differed from the recomputed one. */
  mismatches: string[];
}

/** One source row → its document: same columns, normalised, generated columns recomputed. */
export function transformRow(plan: TablePlan, row: Row, storageBase: string): Transformed {
  const doc: Row = {};
  for (const [k, v] of Object.entries(row)) doc[k] = normaliseValue(v);
  const mismatches: string[] = [];
  for (const [k, v] of Object.entries(plan.generated?.(row) ?? {})) {
    if (k in row && row[k] !== null && v !== null && Math.abs(Number(row[k]) - Number(v)) > 1e-9 && k !== "name_key") {
      mismatches.push(`${k}: export ${String(row[k])}, recomputed ${String(v)}`);
    }
    if (k === "name_key" && k in row && row[k] !== v) mismatches.push(`name_key: export ${String(row[k])}, recomputed ${String(v)}`);
    doc[k] = v;
  }
  if (Array.isArray(doc.attachments)) {
    doc.attachments = (doc.attachments as Row[]).map((a) => rewriteAttachment(a, storageBase));
  }
  const id = plan.idOf(row);
  if (id !== s(row.id) && row.id !== undefined) doc.legacy_id = row.id;
  doc.id = id;
  return { id, doc, mismatches };
}

/** Rows whose unique value repeats, which Postgres would have refused: reported, never imported. */
export function findDuplicates(plan: TablePlan, rows: Row[]): string[] {
  const out: string[] = [];
  const seenIds = new Map<string, number>();
  const seenKeys = new Map<string, number>();
  rows.forEach((r, i) => {
    const reason = plan.invalid?.(r);
    if (reason) out.push(`${plan.table}: row ${i + 1}: ${reason}`);
    const id = plan.idOf(r);
    if (seenIds.has(id)) out.push(`${plan.table}: rows ${seenIds.get(id)! + 1} and ${i + 1} share the ID ${id}`);
    else seenIds.set(id, i);
    const key = plan.unique?.(r);
    if (key) {
      if (seenKeys.has(key)) out.push(`${plan.table}: rows ${seenKeys.get(key)! + 1} and ${i + 1} share ${key}`);
      else seenKeys.set(key, i);
    }
  });
  return out;
}

export interface CounterDoc {
  id: string;
  document_type: string;
  year: number;
  current_sequence: number;
  last_year?: number;
}

const NUMBER = /^([A-Z]{2,5})-(\d{4})-(\d+)$/;
const TRIP = /^(\d{4})-(\d{2})-(\d+)$/;

/**
 * Counters for the new system: every Supabase counter row, raised to the
 * highest number actually used (a counter behind its data would hand a
 * number out twice), with `last_year` set (functions/src/numbering.ts) —
 * plus the monthly trip counters and the audit-log counter, which Supabase
 * did not keep as rows.
 */
export function countersFrom(counterRows: Row[], data: Record<string, Row[]>): CounterDoc[] {
  const counters = new Map<string, CounterDoc>();
  const bump = (type: string, year: number, seq: number, lastYear?: number) => {
    const id = `${type}-${year}`;
    const c = counters.get(id) ?? { id, document_type: type, year, current_sequence: 0 };
    c.current_sequence = Math.max(c.current_sequence, seq);
    if (lastYear !== undefined) c.last_year = Math.max(c.last_year ?? 0, lastYear);
    counters.set(id, c);
  };
  for (const r of counterRows) bump(s(r.document_type).toUpperCase(), n(r.year), n(r.current_sequence), n(r.year) || undefined);

  for (const plan of PLAN) {
    if (!plan.numberField) continue;
    for (const r of data[plan.table] ?? []) {
      const m = s(r[plan.numberField]).match(NUMBER);
      if (!m) continue;
      const [, type, year, seq] = m;
      // A number printed in a year counts for that year, and for the
      // continuous counter if it is the one that issued it.
      bump(type, Number(year), Number(seq), Number(year));
      const continuous = counters.get(`${type}-0`);
      if (continuous && continuous.current_sequence >= Number(seq)) {
        continuous.last_year = Math.max(continuous.last_year ?? 0, Number(year));
      }
    }
  }
  for (const r of data.fuel_trips ?? []) {
    const m = s(r.control_no).match(TRIP);
    if (m) bump(`TRIP-${m[1]}`, Number(m[2]), Number(m[3]));
  }
  for (const r of data.audit_logs ?? []) {
    const m = s(r.id).match(/^AUD-(\d{4})-(\d+)$/);
    if (m) bump("AUD", Number(m[1]), Number(m[2]));
  }
  // The current box of each kind and year (document_counters/BOX-RDS-2026).
  for (const b of data.record_boxes ?? []) bump(`BOX-${s(b.document_type)}`, n(b.year), n(b.sequence));
  // Trip counters are stored as TRIP-YYYY-MM (createFuelTrip).
  return [...counters.values()].map((c) =>
    c.document_type.startsWith("TRIP-")
      ? { ...c, id: `${c.document_type}-${pad2(c.year)}`, document_type: "TRIP", year: Number(c.document_type.slice(5)) }
      : c,
  );
}

/** Column sums for reconciliation, rounded to the centavo. */
export function totalsOf(plan: TablePlan, rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of plan.totals ?? []) {
    out[f] = Math.round(rows.reduce((sum, r) => sum + n(r[f]), 0) * 100) / 100;
  }
  return out;
}
