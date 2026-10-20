import { byFields, callFunction, getRow, listWhere, matchesSearch, type Row } from "@/lib/firestore";
import {
  headerRow,
  recordRows,
  rowToAppraisal,
  rowToRecord,
  validate,
} from "@/features/records/inventory-api.supabase";
import { countByParent, lineFields } from "@/features/records/records-firestore";
import type {
  AppraisalInput,
  AppraisalListFilters,
  InventoryAppraisal,
  InventoryAppraisalWithRecords,
} from "@/features/records/inventory-types";

/**
 * Records Inventory and Appraisal service — Firestore-backed. Same
 * signatures as inventory-api.supabase.ts; saved with its lines, RIA number
 * and Records Room place by the saveRecordsDocument Cloud Function.
 */

const APPRAISALS = "inventory_appraisals";
const RECORDS = "inventory_records";

export async function listAppraisals(filters: AppraisalListFilters = {}): Promise<InventoryAppraisal[]> {
  const status = filters.status && filters.status !== "All" ? filters.status : undefined;
  return (await listWhere(APPRAISALS, { status }, byFields("-date_prepared")))
    .filter((r) => matchesSearch(r, ["inventory_no", "office_name", "department_division"], filters.search))
    .map(rowToAppraisal);
}

export async function recordCounts(appraisalIds: string[]): Promise<Record<string, number>> {
  return countByParent(RECORDS, "appraisal_id", appraisalIds);
}

export async function getAppraisal(id: string): Promise<InventoryAppraisalWithRecords | null> {
  const header = await getRow(APPRAISALS, id);
  if (!header) return null;
  const records = await listWhere(RECORDS, { appraisal_id: id }, byFields("item_number"));
  return { ...rowToAppraisal(header), records: records.map(rowToRecord) };
}

const payload = (input: AppraisalInput, id?: string) => ({
  type: "RIA",
  id,
  header: headerRow(input),
  lines: recordRows("", input).map((r) => lineFields(r, "appraisal_id", false)),
});

export async function createAppraisal(input: AppraisalInput): Promise<InventoryAppraisal> {
  validate(input);
  return rowToAppraisal(await callFunction<Row>("saveRecordsDocument", payload(input)));
}

export async function updateAppraisal(id: string, input: AppraisalInput): Promise<InventoryAppraisal> {
  validate(input);
  return rowToAppraisal(await callFunction<Row>("saveRecordsDocument", payload(input, id)));
}

/**
 * Numbered forms are voided, never deleted (approved policy, 2026-10-20):
 * use voidAppraisal.
 */
export async function deleteAppraisal(_id: string): Promise<void> {
  throw new Error("Numbered Records forms are voided with a reason, not deleted.");
}

/**
 * Voids the form: it keeps its number, lines and filing history, becomes
 * Cancelled with the reason, the Administrator and the time, and drops out of
 * the Records Room's active records. Administrators only.
 */
export async function voidAppraisal(id: string, reason: string): Promise<InventoryAppraisal> {
  return rowToAppraisal(await callFunction<Row>("voidRecordsDocument", { type: "RIA", id, reason }));
}
