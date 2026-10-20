import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { NEEDS_FIREBASE } from "@/features/shared/revisions";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import type {
  DisposalInput,
  DisposalItem,
  DisposalListFilters,
  DisposalRequest,
  DisposalRequestWithItems,
} from "@/features/records/disposal-types";

/**
 * Request for Authority to Dispose of Records service — same conventions as
 * the two records services beside it. Components never call Supabase directly.
 */

const REQUESTS = "disposal_requests";
const ITEMS = "disposal_items";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/** Empty string is how a cleared form field arrives; the column wants null. */
const orNull = (v?: string) => v?.trim() || null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToRequest(r: any): DisposalRequest {
  return {
    id: r.id,
    requestNo: r.request_no,
    agencyName: r.agency_name,
    agencyAddress: r.agency_address,
    requestDate: r.request_date,
    telephoneNumber: r.telephone_number ?? undefined,
    emailAddress: r.email_address ?? undefined,
    locationOfRecords: r.location_of_records ?? undefined,
    volumeCubicMeter: r.volume_cubic_meter ?? undefined,
    preparedBy: r.prepared_by ?? undefined,
    preparedByPosition: r.prepared_by_position ?? undefined,
    certifiedBy: r.certified_by ?? undefined,
    certifiedByPosition: r.certified_by_position ?? undefined,
    status: r.status,
    voidReason: r.void_reason ?? undefined,
    voidedAt: r.voided_at ?? undefined,
    voidedBy: r.voided_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToItem(r: any): DisposalItem {
  return {
    id: r.id,
    requestId: r.request_id,
    itemNumber: r.item_number,
    grdsRdsItemNo: r.grds_rds_item_no ?? undefined,
    titleAndDescription: r.title_and_description,
    periodCovered: r.period_covered ?? undefined,
    retentionAndProvisions: r.retention_and_provisions ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Rows for one request's lines, renumbered from 1 on every save. */
export function itemRows(requestId: string, input: DisposalInput) {
  const ts = nowIso();
  return input.items.map((it, i) => ({
    id: uid(),
    request_id: requestId,
    item_number: i + 1,
    grds_rds_item_no: orNull(it.grdsRdsItemNo),
    title_and_description: it.titleAndDescription.trim(),
    period_covered: orNull(it.periodCovered),
    retention_and_provisions: orNull(it.retentionAndProvisions),
    created_at: ts,
    updated_at: ts,
  }));
}

/** Rejects a request the printed form could not represent. */
export function validate(input: DisposalInput) {
  if (!input.agencyName.trim()) throw new Error("Agency name is required.");
  if (!input.agencyAddress.trim()) throw new Error("Address is required.");
  if (!input.requestDate) throw new Error("Date is required.");
  if (input.items.length === 0)
    throw new Error("A disposal request needs at least one record series.");
  input.items.forEach((it, i) => {
    if (!it.titleAndDescription.trim())
      throw new Error(`Item ${i + 1} needs a record series title and description.`);
  });
}

export function headerRow(input: DisposalInput) {
  return {
    agency_name: input.agencyName.trim(),
    agency_address: input.agencyAddress.trim(),
    request_date: input.requestDate,
    telephone_number: orNull(input.telephoneNumber),
    email_address: orNull(input.emailAddress),
    location_of_records: orNull(input.locationOfRecords),
    volume_cubic_meter: orNull(input.volumeCubicMeter),
    prepared_by: orNull(input.preparedBy),
    prepared_by_position: orNull(input.preparedByPosition),
    certified_by: orNull(input.certifiedBy),
    certified_by_position: orNull(input.certifiedByPosition),
    status: input.status,
  };
}

export async function listRequests(
  filters: DisposalListFilters = {},
): Promise<DisposalRequest[]> {
  const db = requireDb();
  const rows = await fetchAll<unknown>((from, to) => {
    let q = db.from(REQUESTS).select("*").order("request_date", { ascending: false });
    if (filters.status && filters.status !== "All") q = q.eq("status", filters.status);
    if (filters.search?.trim())
      q = q.or(searchOr(["request_no", "agency_name", "location_of_records"], filters.search));
    return q.range(from, to);
  });
  return rows.map(rowToRequest);
}

/** Line counts for a set of requests, so the list can show them in one query. */
export async function itemCounts(requestIds: string[]): Promise<Record<string, number>> {
  if (requestIds.length === 0) return {};
  const db = requireDb();
  const rows = await fetchAll<{ request_id: string }>((from, to) =>
    db.from(ITEMS).select("request_id").in("request_id", requestIds).range(from, to),
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.request_id] = (counts[r.request_id] ?? 0) + 1;
  return counts;
}

export async function getRequest(id: string): Promise<DisposalRequestWithItems | null> {
  const db = requireDb();
  const header = unwrap(await db.from(REQUESTS).select("*").eq("id", id).maybeSingle());
  if (!header) return null;
  const items = await fetchAll<unknown>((from, to) =>
    db
      .from(ITEMS)
      .select("*")
      .eq("request_id", id)
      .order("item_number", { ascending: true })
      .range(from, to),
  );
  return { ...rowToRequest(header), items: items.map(rowToItem) };
}

/**
 * Creates a request and its lines. The number is allocated only after the
 * header validates, because every allocation consumes a sequence value and a
 * discarded number leaves a permanent gap.
 */
export async function createRequest(input: DisposalInput): Promise<DisposalRequest> {
  validate(input);
  const db = requireDb();
  const id = uid();
  const ts = nowIso();
  const requestNo = await nextDocumentNumber("RAD");

  const header = unwrap(
    await db
      .from(REQUESTS)
      .insert({ id, request_no: requestNo, ...headerRow(input), created_at: ts, updated_at: ts })
      .select()
      .single(),
  );

  try {
    unwrap(await db.from(ITEMS).insert(itemRows(id, input)).select());
  } catch (e) {
    // A request with no lines asks permission to destroy nothing. Roll it
    // back rather than leaving a request number pointing at an empty form.
    await db.from(REQUESTS).delete().eq("id", id);
    throw e;
  }

  return rowToRequest(header);
}

/** Replaces a request's header and lines. */
export async function updateRequest(
  id: string,
  input: DisposalInput,
): Promise<DisposalRequest> {
  validate(input);
  const db = requireDb();

  const header = unwrap(
    await db
      .from(REQUESTS)
      .update({ ...headerRow(input), updated_at: nowIso() })
      .eq("id", id)
      .select()
      .single(),
  );

  unwrap(await db.from(ITEMS).delete().eq("request_id", id).select());
  unwrap(await db.from(ITEMS).insert(itemRows(id, input)).select());

  return rowToRequest(header);
}

/** Deletes a request. Its items go with it (on delete cascade). */
export async function deleteRequest(id: string): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(REQUESTS).delete().eq("id", id).select());
}

/** Voiding needs the Firebase backend: Supabase's status check allows only the four form statuses. */
export async function voidRequest(_id: string, _reason: string): Promise<DisposalRequest> {
  throw new Error(NEEDS_FIREBASE);
}
