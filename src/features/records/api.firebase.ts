import { byFields, callFunction, getRow, listWhere, matchesSearch, type Row } from "@/lib/firestore";
import {
  rowToSchedule,
  rowToSeries,
  seriesRows,
  validate,
} from "@/features/records/api.supabase";
import { countByParent, lineFields } from "@/features/records/records-firestore";
import type {
  DispositionSchedule,
  DispositionScheduleWithSeries,
  ScheduleInput,
  ScheduleListFilters,
} from "@/features/records/types";

/**
 * Records Disposition Schedule service — Firestore-backed. Same signatures
 * as api.supabase.ts. A schedule, its record series, its RDS number and its
 * place in the Records Room are saved together by the saveRecordsDocument
 * Cloud Function; record series keep their IDs across saves.
 */

const SCHEDULES = "disposition_schedules";
const SERIES = "record_series";

export async function listSchedules(filters: ScheduleListFilters = {}): Promise<DispositionSchedule[]> {
  const status = filters.status && filters.status !== "All" ? filters.status : undefined;
  return (await listWhere(SCHEDULES, { status }, byFields("-date_prepared")))
    .filter((r) => matchesSearch(r, ["schedule_no", "agency_name"], filters.search))
    .map(rowToSchedule);
}

export async function seriesCounts(scheduleIds: string[]): Promise<Record<string, number>> {
  return countByParent(SERIES, "schedule_id", scheduleIds);
}

export async function getSchedule(id: string): Promise<DispositionScheduleWithSeries | null> {
  const header = await getRow(SCHEDULES, id);
  if (!header) return null;
  const series = await listWhere(SERIES, { schedule_id: id }, byFields("item_number"));
  return { ...rowToSchedule(header), series: series.map(rowToSeries) };
}

function payload(input: ScheduleInput, id?: string) {
  return {
    type: "RDS",
    id,
    header: {
      agency_name: input.agencyName.trim(),
      agency_address: input.agencyAddress.trim(),
      date_prepared: input.datePrepared,
      status: input.status,
    },
    // A new line has no ID yet; the function gives it one.
    lines: seriesRows("", input).map((r, i) => lineFields(r, "schedule_id", Boolean(input.series[i].id))),
  };
}

export async function createSchedule(input: ScheduleInput): Promise<DispositionSchedule> {
  validate(input);
  return rowToSchedule(await callFunction<Row>("saveRecordsDocument", payload(input)));
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<DispositionSchedule> {
  validate(input);
  return rowToSchedule(await callFunction<Row>("saveRecordsDocument", payload(input, id)));
}

/**
 * Numbered forms are voided, never deleted (approved policy, 2026-10-20):
 * use voidSchedule.
 */
export async function deleteSchedule(_id: string): Promise<void> {
  throw new Error("Numbered Records forms are voided with a reason, not deleted.");
}

/**
 * Voids the form: it keeps its number, lines and filing history, becomes
 * Cancelled with the reason, the Administrator and the time, and drops out of
 * the Records Room's active records. Administrators only.
 */
export async function voidSchedule(id: string, reason: string): Promise<DispositionSchedule> {
  return rowToSchedule(await callFunction<Row>("voidRecordsDocument", { type: "RDS", id, reason }));
}
