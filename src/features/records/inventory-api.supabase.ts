import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { NEEDS_FIREBASE } from "@/features/shared/revisions";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import type {
  AppraisalInput,
  AppraisalListFilters,
  InventoryAppraisal,
  InventoryAppraisalWithRecords,
  InventoryRecord,
} from "@/features/records/inventory-types";

/**
 * Records Inventory and Appraisal service — same conventions as the
 * Disposition Schedule service beside it. Components never call Supabase
 * directly.
 */

const APPRAISALS = "inventory_appraisals";
const RECORDS = "inventory_records";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/** Empty string is how a cleared form field arrives; the column wants null. */
const orNull = (v?: string) => v?.trim() || null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToAppraisal(r: any): InventoryAppraisal {
  return {
    id: r.id,
    inventoryNo: r.inventory_no,
    officeName: r.office_name,
    departmentDivision: r.department_division ?? undefined,
    sectionUnit: r.section_unit ?? undefined,
    telephoneNo: r.telephone_no ?? undefined,
    emailAddress: r.email_address ?? undefined,
    officeAddress: r.office_address,
    personInCharge: r.person_in_charge ?? undefined,
    datePrepared: r.date_prepared,
    preparedBy: r.prepared_by ?? undefined,
    preparedByPosition: r.prepared_by_position ?? undefined,
    assistedBy: r.assisted_by ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    status: r.status,
    voidReason: r.void_reason ?? undefined,
    voidedAt: r.voided_at ?? undefined,
    voidedBy: r.voided_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToRecord(r: any): InventoryRecord {
  return {
    id: r.id,
    appraisalId: r.appraisal_id,
    itemNumber: r.item_number,
    titleAndDescription: r.title_and_description,
    periodCovered: r.period_covered ?? undefined,
    volume: r.volume ?? undefined,
    recordsMedium: r.records_medium ?? undefined,
    restrictions: r.restrictions ?? undefined,
    locationOfRecords: r.location_of_records ?? undefined,
    frequencyOfUse: r.frequency_of_use ?? undefined,
    duplication: r.duplication ?? undefined,
    timeValue: r.time_value ?? undefined,
    utilityValue: r.utility_value ?? undefined,
    retentionActive: r.retention_active,
    retentionStorage: r.retention_storage,
    retentionTotal: r.retention_total,
    dispositionProvision: r.disposition_provision ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Rows for one appraisal's lines, renumbered from 1 on every save: the editor
 * lets a clerk delete a middle row, and an inventory that printed 1, 2, 4
 * would be read as a missing item by the National Archives.
 */
export function recordRows(appraisalId: string, input: AppraisalInput) {
  const ts = nowIso();
  return input.records.map((r, i) => ({
    id: uid(),
    appraisal_id: appraisalId,
    item_number: i + 1,
    title_and_description: r.titleAndDescription.trim(),
    period_covered: orNull(r.periodCovered),
    volume: orNull(r.volume),
    records_medium: orNull(r.recordsMedium),
    restrictions: orNull(r.restrictions),
    location_of_records: orNull(r.locationOfRecords),
    frequency_of_use: orNull(r.frequencyOfUse),
    duplication: orNull(r.duplication),
    time_value: r.timeValue ?? null,
    utility_value: r.utilityValue ?? null,
    retention_active: r.retentionActive,
    retention_storage: r.retentionStorage,
    disposition_provision: orNull(r.dispositionProvision),
    created_at: ts,
    updated_at: ts,
  }));
}

/** Rejects an appraisal the printed form could not represent. */
export function validate(input: AppraisalInput) {
  if (!input.officeName.trim()) throw new Error("Name of office is required.");
  if (!input.officeAddress.trim()) throw new Error("Address is required.");
  if (!input.datePrepared) throw new Error("Date prepared is required.");
  if (input.records.length === 0)
    throw new Error("An inventory needs at least one record series.");
  input.records.forEach((r, i) => {
    if (!r.titleAndDescription.trim())
      throw new Error(`Item ${i + 1} needs a records series title and description.`);
    if (r.retentionActive < 0 || r.retentionStorage < 0)
      throw new Error(`Item ${i + 1} cannot have a negative retention period.`);
  });
}

export function headerRow(input: AppraisalInput) {
  return {
    office_name: input.officeName.trim(),
    department_division: orNull(input.departmentDivision),
    section_unit: orNull(input.sectionUnit),
    telephone_no: orNull(input.telephoneNo),
    email_address: orNull(input.emailAddress),
    office_address: input.officeAddress.trim(),
    person_in_charge: orNull(input.personInCharge),
    date_prepared: input.datePrepared,
    prepared_by: orNull(input.preparedBy),
    prepared_by_position: orNull(input.preparedByPosition),
    assisted_by: orNull(input.assistedBy),
    approved_by: orNull(input.approvedBy),
    status: input.status,
  };
}

export async function listAppraisals(
  filters: AppraisalListFilters = {},
): Promise<InventoryAppraisal[]> {
  const db = requireDb();
  const rows = await fetchAll<unknown>((from, to) => {
    let q = db.from(APPRAISALS).select("*").order("date_prepared", { ascending: false });
    if (filters.status && filters.status !== "All") q = q.eq("status", filters.status);
    if (filters.search?.trim())
      q = q.or(searchOr(["inventory_no", "office_name", "department_division"], filters.search));
    return q.range(from, to);
  });
  return rows.map(rowToAppraisal);
}

/** Line counts for a set of appraisals, so the list can show them in one query. */
export async function recordCounts(appraisalIds: string[]): Promise<Record<string, number>> {
  if (appraisalIds.length === 0) return {};
  const db = requireDb();
  const rows = await fetchAll<{ appraisal_id: string }>((from, to) =>
    db.from(RECORDS).select("appraisal_id").in("appraisal_id", appraisalIds).range(from, to),
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.appraisal_id] = (counts[r.appraisal_id] ?? 0) + 1;
  return counts;
}

export async function getAppraisal(id: string): Promise<InventoryAppraisalWithRecords | null> {
  const db = requireDb();
  const header = unwrap(await db.from(APPRAISALS).select("*").eq("id", id).maybeSingle());
  if (!header) return null;
  const records = await fetchAll<unknown>((from, to) =>
    db
      .from(RECORDS)
      .select("*")
      .eq("appraisal_id", id)
      .order("item_number", { ascending: true })
      .range(from, to),
  );
  return { ...rowToAppraisal(header), records: records.map(rowToRecord) };
}

/**
 * Creates an appraisal and its lines. The number is allocated only after the
 * header validates, because every allocation consumes a sequence value and a
 * discarded number leaves a permanent gap.
 */
export async function createAppraisal(input: AppraisalInput): Promise<InventoryAppraisal> {
  validate(input);
  const db = requireDb();
  const id = uid();
  const ts = nowIso();
  const inventoryNo = await nextDocumentNumber("RIA");

  const header = unwrap(
    await db
      .from(APPRAISALS)
      .insert({ id, inventory_no: inventoryNo, ...headerRow(input), created_at: ts, updated_at: ts })
      .select()
      .single(),
  );

  try {
    unwrap(await db.from(RECORDS).insert(recordRows(id, input)).select());
  } catch (e) {
    // A header with no lines is not a document. Roll it back rather than
    // leaving an inventory number pointing at an empty form.
    await db.from(APPRAISALS).delete().eq("id", id);
    throw e;
  }

  return rowToAppraisal(header);
}

/**
 * Replaces an appraisal's header and lines. The lines are deleted and
 * re-inserted rather than diffed: item numbers are positional, so a diff would
 * have to reconcile renumbering anyway.
 */
export async function updateAppraisal(
  id: string,
  input: AppraisalInput,
): Promise<InventoryAppraisal> {
  validate(input);
  const db = requireDb();

  const header = unwrap(
    await db
      .from(APPRAISALS)
      .update({ ...headerRow(input), updated_at: nowIso() })
      .eq("id", id)
      .select()
      .single(),
  );

  unwrap(await db.from(RECORDS).delete().eq("appraisal_id", id).select());
  unwrap(await db.from(RECORDS).insert(recordRows(id, input)).select());

  return rowToAppraisal(header);
}

/** Deletes an appraisal. Its records go with it (on delete cascade). */
export async function deleteAppraisal(id: string): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(APPRAISALS).delete().eq("id", id).select());
}

/** Voiding needs the Firebase backend: Supabase's status check allows only the four form statuses. */
export async function voidAppraisal(_id: string, _reason: string): Promise<InventoryAppraisal> {
  throw new Error(NEEDS_FIREBASE);
}
