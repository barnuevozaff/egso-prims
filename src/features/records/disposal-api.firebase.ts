import { byFields, callFunction, getRow, listWhere, matchesSearch, type Row } from "@/lib/firestore";
import {
  headerRow,
  itemRows,
  rowToItem,
  rowToRequest,
  validate,
} from "@/features/records/disposal-api.supabase";
import { countByParent, lineFields } from "@/features/records/records-firestore";
import type {
  DisposalInput,
  DisposalListFilters,
  DisposalRequest,
  DisposalRequestWithItems,
} from "@/features/records/disposal-types";

/**
 * Request for Authority to Dispose of Records service — Firestore-backed.
 * Same signatures as disposal-api.supabase.ts; saved with its items, RAD
 * number and Records Room place by the saveRecordsDocument Cloud Function.
 */

const REQUESTS = "disposal_requests";
const ITEMS = "disposal_items";

export async function listRequests(filters: DisposalListFilters = {}): Promise<DisposalRequest[]> {
  const status = filters.status && filters.status !== "All" ? filters.status : undefined;
  return (await listWhere(REQUESTS, { status }, byFields("-request_date")))
    .filter((r) => matchesSearch(r, ["request_no", "agency_name", "location_of_records"], filters.search))
    .map(rowToRequest);
}

export async function itemCounts(requestIds: string[]): Promise<Record<string, number>> {
  return countByParent(ITEMS, "request_id", requestIds);
}

export async function getRequest(id: string): Promise<DisposalRequestWithItems | null> {
  const header = await getRow(REQUESTS, id);
  if (!header) return null;
  const items = await listWhere(ITEMS, { request_id: id }, byFields("item_number"));
  return { ...rowToRequest(header), items: items.map(rowToItem) };
}

const payload = (input: DisposalInput, id?: string) => ({
  type: "RAD",
  id,
  header: headerRow(input),
  lines: itemRows("", input).map((r) => lineFields(r, "request_id", false)),
});

export async function createRequest(input: DisposalInput): Promise<DisposalRequest> {
  validate(input);
  return rowToRequest(await callFunction<Row>("saveRecordsDocument", payload(input)));
}

export async function updateRequest(id: string, input: DisposalInput): Promise<DisposalRequest> {
  validate(input);
  return rowToRequest(await callFunction<Row>("saveRecordsDocument", payload(input, id)));
}

/**
 * Numbered forms are voided, never deleted (approved policy, 2026-10-20):
 * use voidRequest.
 */
export async function deleteRequest(_id: string): Promise<void> {
  throw new Error("Numbered Records forms are voided with a reason, not deleted.");
}

/**
 * Voids the form: it keeps its number, lines and filing history, becomes
 * Cancelled with the reason, the Administrator and the time, and drops out of
 * the Records Room's active records. Administrators only.
 */
export async function voidRequest(id: string, reason: string): Promise<DisposalRequest> {
  return rowToRequest(await callFunction<Row>("voidRecordsDocument", { type: "RAD", id, reason }));
}
