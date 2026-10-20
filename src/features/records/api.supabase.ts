import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { NEEDS_FIREBASE } from "@/features/shared/revisions";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import type {
  DispositionSchedule,
  DispositionScheduleWithSeries,
  RecordSeries,
  ScheduleInput,
  ScheduleListFilters,
} from "@/features/records/types";

/**
 * Records Management service — Supabase-backed, same conventions as every
 * other General Services Office module. Components never call Supabase
 * directly.
 *
 * A schedule and its record series are written together: the paper form is
 * one document, so a header saved without its lines is not a state the office
 * can act on.
 */

const SCHEDULES = "disposition_schedules";
const SERIES = "record_series";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToSchedule(r: any): DispositionSchedule {
  return {
    id: r.id,
    scheduleNo: r.schedule_no,
    agencyName: r.agency_name,
    agencyAddress: r.agency_address,
    datePrepared: r.date_prepared,
    status: r.status,
    voidReason: r.void_reason ?? undefined,
    voidedAt: r.voided_at ?? undefined,
    voidedBy: r.voided_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToSeries(r: any): RecordSeries {
  return {
    id: r.id,
    scheduleId: r.schedule_id,
    itemNumber: r.item_number,
    titleAndDescription: r.title_and_description,
    retentionActive: r.retention_active,
    retentionStorage: r.retention_storage,
    retentionTotal: r.retention_total,
    remarks: r.remarks ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Rows for one schedule's lines, numbered down the page.
 *
 * Item numbers are renumbered from 1 on every save rather than preserved from
 * the form: the editor lets a clerk delete a middle row, and a schedule that
 * printed 1, 2, 4 would be read as a missing item by the National Archives.
 */
export function seriesRows(scheduleId: string, input: ScheduleInput) {
  const ts = nowIso();
  return input.series.map((s, i) => ({
    id: s.id ?? uid(),
    schedule_id: scheduleId,
    item_number: i + 1,
    title_and_description: s.titleAndDescription.trim(),
    retention_active: s.retentionActive,
    retention_storage: s.retentionStorage,
    remarks: s.remarks?.trim() || null,
    created_at: ts,
    updated_at: ts,
  }));
}

/** Rejects a schedule the printed form could not represent. */
export function validate(input: ScheduleInput) {
  if (!input.agencyName.trim()) throw new Error("Agency name is required.");
  if (!input.agencyAddress.trim()) throw new Error("Address is required.");
  if (!input.datePrepared) throw new Error("Date prepared is required.");
  if (input.series.length === 0)
    throw new Error("A disposition schedule needs at least one record series.");
  input.series.forEach((s, i) => {
    if (!s.titleAndDescription.trim())
      throw new Error(`Item ${i + 1} needs a record series title and description.`);
    if (s.retentionActive < 0 || s.retentionStorage < 0)
      throw new Error(`Item ${i + 1} cannot have a negative retention period.`);
  });
}

export async function listSchedules(
  filters: ScheduleListFilters = {},
): Promise<DispositionSchedule[]> {
  const db = requireDb();
  const rows = await fetchAll<unknown>((from, to) => {
    let q = db.from(SCHEDULES).select("*").order("date_prepared", { ascending: false });
    if (filters.status && filters.status !== "All") q = q.eq("status", filters.status);
    if (filters.search?.trim())
      q = q.or(searchOr(["schedule_no", "agency_name"], filters.search));
    return q.range(from, to);
  });
  return rows.map(rowToSchedule);
}

/** Line counts for a set of schedules, so the list can show them in one query. */
export async function seriesCounts(scheduleIds: string[]): Promise<Record<string, number>> {
  if (scheduleIds.length === 0) return {};
  const db = requireDb();
  const rows = await fetchAll<{ schedule_id: string }>((from, to) =>
    db.from(SERIES).select("schedule_id").in("schedule_id", scheduleIds).range(from, to),
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.schedule_id] = (counts[r.schedule_id] ?? 0) + 1;
  return counts;
}

export async function getSchedule(id: string): Promise<DispositionScheduleWithSeries | null> {
  const db = requireDb();
  const header = unwrap(await db.from(SCHEDULES).select("*").eq("id", id).maybeSingle());
  if (!header) return null;
  const series = await fetchAll<unknown>((from, to) =>
    db
      .from(SERIES)
      .select("*")
      .eq("schedule_id", id)
      .order("item_number", { ascending: true })
      .range(from, to),
  );
  return { ...rowToSchedule(header), series: series.map(rowToSeries) };
}

/**
 * Creates a schedule and its lines.
 *
 * The number is allocated only after the header has been validated, because
 * every allocation consumes a sequence value and a discarded number leaves a
 * permanent gap in the office's records.
 */
export async function createSchedule(input: ScheduleInput): Promise<DispositionSchedule> {
  validate(input);
  const db = requireDb();
  const id = uid();
  const ts = nowIso();
  const scheduleNo = await nextDocumentNumber("RDS");

  const header = unwrap(
    await db
      .from(SCHEDULES)
      .insert({
        id,
        schedule_no: scheduleNo,
        agency_name: input.agencyName.trim(),
        agency_address: input.agencyAddress.trim(),
        date_prepared: input.datePrepared,
        status: input.status,
        created_at: ts,
        updated_at: ts,
      })
      .select()
      .single(),
  );

  try {
    unwrap(await db.from(SERIES).insert(seriesRows(id, input)).select());
  } catch (e) {
    // A header with no lines is not a document. Roll it back rather than
    // leaving a schedule number pointing at an empty form.
    await db.from(SCHEDULES).delete().eq("id", id);
    throw e;
  }

  return rowToSchedule(header);
}

/**
 * Replaces a schedule's header and lines.
 *
 * The lines are deleted and re-inserted rather than diffed: item numbers are
 * positional, so a diff would have to reconcile renumbering anyway, and the
 * whole form is submitted at once.
 */
export async function updateSchedule(
  id: string,
  input: ScheduleInput,
): Promise<DispositionSchedule> {
  validate(input);
  const db = requireDb();

  const header = unwrap(
    await db
      .from(SCHEDULES)
      .update({
        agency_name: input.agencyName.trim(),
        agency_address: input.agencyAddress.trim(),
        date_prepared: input.datePrepared,
        status: input.status,
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select()
      .single(),
  );

  /*
   * The lines are updated in place, not deleted and re-inserted, so each
   * series keeps its identity across a save. Anything that points at a
   * series — its shelf in the Records Room, its audit history — survives a
   * one-character fix to a title or a reordering of the lines. Only the lines
   * the clerk removed are deleted, and storage placement is not in the
   * payload, so an update leaves each series on its shelf.
   *
   * Renumbering happens in one upsert: the item-number constraint is checked
   * at the end of the statement (migration 045), so rows can pass through
   * each other's numbers on the way.
   */
  const existing = new Set(
    (
      unwrap(await db.from(SERIES).select("id").eq("schedule_id", id)) as { id: string }[]
    ).map((r) => r.id),
  );
  const rows = seriesRows(id, input);
  const kept = rows.filter((r) => existing.has(r.id));
  const added = rows.filter((r) => !existing.has(r.id));
  const removed = [...existing].filter((rowId) => !rows.some((r) => r.id === rowId));

  if (removed.length > 0) {
    unwrap(await db.from(SERIES).delete().in("id", removed).select());
  }
  if (kept.length > 0) {
    unwrap(
      await db
        .from(SERIES)
        .upsert(kept.map(({ created_at: _created, ...r }) => r), { onConflict: "id" })
        .select(),
    );
  }
  if (added.length > 0) unwrap(await db.from(SERIES).insert(added).select());

  return rowToSchedule(header);
}

/** Deletes a schedule. Its record series go with it (on delete cascade). */
export async function deleteSchedule(id: string): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(SCHEDULES).delete().eq("id", id).select());
}

/** Voiding needs the Firebase backend: Supabase's status check allows only the four form statuses. */
export async function voidSchedule(_id: string, _reason: string): Promise<DispositionSchedule> {
  throw new Error(NEEDS_FIREBASE);
}
