import {
  byFields,
  callFunction,
  claimKey,
  getRow,
  listWhere,
  matchesSearch,
  saveClaimedRow,
  updateRow,
  type Row,
} from "@/lib/firestore";
import {
  rowToAccount,
  rowToBill,
  rowToReading,
  rowToSubmeter,
  rowToSubmeterBill,
  type AccountDraftInput,
  type AccountListFilters,
  type BillDraftInput,
  type MeterReadingDraftInput,
  type MeterReadingFilters,
  type SubmeterAssignmentInput,
  type SubmeterBillDraftInput,
  type SubmeterBillFilters,
  type SubmeterDraftInput,
  type SubmeterListFilters,
} from "@/features/water/api.supabase";
import { deleteHolders, setArchived } from "@/features/shared/record-holders";
import type {
  SubmeterStatus,
  WaterAccount,
  WaterBill,
  WaterBillFilters,
  WaterMeterReading,
  WaterSubmeter,
  WaterSubmeterBill,
} from "@/features/water/types";

/**
 * Water Consumption service — Firestore-backed. Same signatures as
 * api.supabase.ts. Bills are numbered (WC) and saved by the
 * createNumberedRecord Cloud Function in one transaction; a reading's
 * consumption, a generated column in Postgres, is computed on every save;
 * deleting an account or submeter removes what belongs to it
 * (cascadeDeletes).
 */

const ACCOUNTS = "water_accounts";
const BILLS = "water_bills";
const SUBMETERS = "water_submeters";
const SUBMETER_BILLS = "water_submeter_bills";
const READINGS = "water_meter_readings";
const nowIso = () => new Date().toISOString();

/* ---------------- accounts ---------------- */

export async function listWaterAccounts(filters: AccountListFilters = {}): Promise<WaterAccount[]> {
  const rows = await listWhere(ACCOUNTS, { location: filters.location }, byFields("account_number"));
  return rows
    .filter((r) => matchesSearch(r, ["account_number", "account_name", "location", "meter_number"], filters.search))
    .map(rowToAccount);
}

export async function getWaterAccount(id: string): Promise<WaterAccount | null> {
  const row = await getRow(ACCOUNTS, id);
  return row ? rowToAccount(row) : null;
}

const accountFields = (input: AccountDraftInput) => ({
  account_number: input.accountNumber,
  account_name: input.accountName?.trim() || null,
  location: input.location,
  meter_number: input.meterNumber,
});

/** Account numbers are unique, held by a claim (unique_keys) saved with the account. */
const accountKey = (r: Record<string, unknown>) => claimKey(ACCOUNTS, "account_number", String(r.account_number ?? ""));
const DUPLICATE_ACCOUNT = "That account number is already registered.";

export async function createWaterAccount(input: AccountDraftInput): Promise<WaterAccount> {
  const at = nowIso();
  return rowToAccount(
    await saveClaimedRow({
      collection: ACCOUNTS,
      id: `wa-${Date.now()}`,
      isNew: true,
      fields: { ...accountFields(input), created_at: at, updated_at: at },
      keyOf: accountKey,
      duplicate: DUPLICATE_ACCOUNT,
      notFound: "",
    }),
  );
}

export async function updateWaterAccount(id: string, input: AccountDraftInput): Promise<WaterAccount> {
  return rowToAccount(
    await saveClaimedRow({
      collection: ACCOUNTS,
      id,
      isNew: false,
      fields: { ...accountFields(input), updated_at: nowIso() },
      keyOf: accountKey,
      duplicate: DUPLICATE_ACCOUNT,
      notFound: `Water account not found: ${id}`,
    }),
  );
}

/**
 * Deletes accounts that hold no records; an account with bills or submeters
 * is kept (official records are never deleted) — archive it instead.
 */
export async function deleteWaterAccounts(ids: string[]): Promise<void> {
  await deleteHolders(ACCOUNTS, ids);
}

/** Archives or restores an account; it keeps everything it holds. */
export async function archiveWaterAccount(id: string, archived: boolean): Promise<WaterAccount> {
  return rowToAccount(await setArchived(ACCOUNTS, id, archived));
}

/* ---------------- bills ---------------- */

export async function listWaterBills(filters: WaterBillFilters = {}): Promise<WaterBill[]> {
  const rows = (
    await listWhere(
      BILLS,
      { account_id: filters.accountId, billing_year: filters.year, billing_month: filters.month },
      byFields("-billing_year", "-billing_month"),
    )
  )
    .map(rowToBill)
    // Voided bills stay on file but drop out of active lists and totals.
    .filter((b) => filters.includeVoided || !b.voided);
  const ord = (y: number, m: number) => y * 12 + m;
  const from = filters.fromYear && filters.fromMonth ? ord(filters.fromYear, filters.fromMonth) : null;
  const to = filters.toYear && filters.toMonth ? ord(filters.toYear, filters.toMonth) : null;
  return rows.filter((b) => {
    const o = ord(b.billingYear, b.billingMonth);
    return (from === null || o >= from) && (to === null || o <= to);
  });
}

export async function createWaterBill(input: BillDraftInput): Promise<WaterBill> {
  const row = await callFunction<Row>("createNumberedRecord", {
    type: "WC",
    record: {
      account_id: input.accountId,
      billing_month: input.billingMonth,
      billing_year: input.billingYear,
      amount: input.amount,
      consumption: input.consumption,
      remarks: input.remarks?.trim() || null,
    },
  });
  return rowToBill(row);
}

/**
 * Bills are finalized records (policy 2026-10-20): corrected with a reason
 * through correctWaterBill, or voided — never edited in place or deleted.
 */
export async function updateWaterBill(
  _id: string,
  _input: Pick<BillDraftInput, "amount" | "consumption" | "remarks">,
): Promise<WaterBill> {
  throw new Error("Bills are corrected with a reason, or voided, not edited or deleted directly.");
}

export async function deleteWaterBills(_ids: string[]): Promise<void> {
  throw new Error("Bills are corrected with a reason, or voided, not edited or deleted directly.");
}

/** Corrects a bill, keeping the previous values in its revisions. */
export async function correctWaterBill(
  id: string,
  input: Pick<BillDraftInput, "amount" | "consumption" | "remarks">,
  reason: string,
): Promise<WaterBill> {
  return rowToBill(
    await callFunction<Row>("correctUtilityRecord", {
      type: "WC",
      id,
      changes: { amount: input.amount, consumption: input.consumption, remarks: input.remarks?.trim() || null },
      reason,
    }),
  );
}

/** Voids a bill: it stays on file, out of totals; its month is free for a corrected bill. */
export async function voidWaterBill(id: string, reason: string): Promise<WaterBill> {
  return rowToBill(await callFunction<Row>("voidUtilityRecord", { type: "WC", id, reason }));
}

/* ---------------- submeters ---------------- */

export async function listWaterSubmeters(filters: SubmeterListFilters = {}): Promise<WaterSubmeter[]> {
  return (
    await listWhere(
      SUBMETERS,
      { account_id: filters.accountId, assigned_office: filters.assignedOffice, status: filters.status },
      byFields("submeter_number"),
    )
  ).map(rowToSubmeter);
}

const submeterFields = (input: Omit<SubmeterDraftInput, "accountId">) => ({
  submeter_name: input.submeterName,
  submeter_number: input.submeterNumber,
  assigned_office: input.assignedOffice,
  assigned_department: input.assignedDepartment?.trim() || null,
  assigned_facility: input.assignedFacility?.trim() || null,
  assigned_user: input.assignedUser?.trim() || null,
  remarks: input.remarks?.trim() || null,
  status: input.status,
});

const DUPLICATE_SUBMETER = "That submeter number already exists on this account.";

/** A submeter number is unique on its account, held by a claim saved with the submeter. */
const submeterKey = (r: Record<string, unknown>) =>
  claimKey(SUBMETERS, "submeter_number", `${String(r.account_id ?? "")}~${String(r.submeter_number ?? "")}`);

export async function createWaterSubmeter(input: SubmeterDraftInput): Promise<WaterSubmeter> {
  const at = nowIso();
  return rowToSubmeter(
    await saveClaimedRow({
      collection: SUBMETERS,
      id: `ws-${input.accountId}-${Date.now()}`,
      isNew: true,
      fields: { account_id: input.accountId, ...submeterFields(input), created_at: at, updated_at: at },
      keyOf: submeterKey,
      duplicate: DUPLICATE_SUBMETER,
      notFound: "",
    }),
  );
}

export async function updateWaterSubmeter(id: string, input: Omit<SubmeterDraftInput, "accountId">): Promise<WaterSubmeter> {
  return rowToSubmeter(
    await saveClaimedRow({
      collection: SUBMETERS,
      id,
      isNew: false,
      fields: { ...submeterFields(input), updated_at: nowIso() },
      keyOf: submeterKey,
      duplicate: DUPLICATE_SUBMETER,
      notFound: `Water submeter not found: ${id}`,
    }),
  );
}

/**
 * Reassigns a submeter without touching its identity, status or billing
 * history — used when a meter changes hands between offices or custodians.
 */
export async function assignWaterSubmeter(id: string, input: SubmeterAssignmentInput): Promise<WaterSubmeter> {
  return rowToSubmeter(
    await updateRow(SUBMETERS, id, `Water submeter not found: ${id}`, () => ({
      assigned_office: input.assignedOffice,
      assigned_department: input.assignedDepartment?.trim() || null,
      assigned_facility: input.assignedFacility?.trim() || null,
      assigned_user: input.assignedUser?.trim() || null,
      updated_at: nowIso(),
    })),
  );
}

/**
 * Archiving keeps the submeter and its billing history for reporting; only
 * active submeters count toward the account's live totals.
 */
export async function archiveWaterSubmeter(id: string, status: SubmeterStatus): Promise<WaterSubmeter> {
  return rowToSubmeter(
    await updateRow(SUBMETERS, id, `Water submeter not found: ${id}`, () => ({ status, updated_at: nowIso() })),
  );
}

/** Deletes submeters that hold no bills or readings; one that does is kept — archive it instead. */
export async function deleteWaterSubmeters(ids: string[]): Promise<void> {
  await deleteHolders(SUBMETERS, ids);
}

/* ---------------- submeter bills ---------------- */

export async function listWaterSubmeterBills(filters: SubmeterBillFilters = {}): Promise<WaterSubmeterBill[]> {
  return (
    await listWhere(
      SUBMETER_BILLS,
      { submeter_id: filters.submeterId, billing_year: filters.year, billing_month: filters.month },
      byFields("-billing_year", "-billing_month"),
    )
  )
    .map(rowToSubmeterBill)
    .filter((b) => filters.includeVoided || !b.voided);
}

/**
 * Saved by the server (createUtilityEntry): one active bill per submeter and
 * month, and none for an archived submeter or account.
 */
export async function createWaterSubmeterBill(input: SubmeterBillDraftInput): Promise<WaterSubmeterBill> {
  return rowToSubmeterBill(
    await callFunction<Row>("createUtilityEntry", {
      type: "WSB",
      record: {
        submeter_id: input.submeterId,
        billing_month: input.billingMonth,
        billing_year: input.billingYear,
        consumption: input.consumption,
        amount: input.amount,
        remarks: input.remarks?.trim() || null,
      },
    }),
  );
}

/** Submeter bills keep their correction history (2026-10-21): use correctWaterSubmeterBill. */
export async function updateWaterSubmeterBill(
  _id: string,
  _input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
): Promise<WaterSubmeterBill> {
  throw new Error("Submeter bills are corrected with a reason; their previous values are kept.");
}

/** Corrects a submeter bill, keeping the previous values in its revisions. */
export async function correctWaterSubmeterBill(
  id: string,
  input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
  reason: string,
): Promise<WaterSubmeterBill> {
  return rowToSubmeterBill(
    await callFunction<Row>("correctUtilityRecord", {
      type: "WSB",
      id,
      changes: { consumption: input.consumption, amount: input.amount, remarks: input.remarks?.trim() || null },
      reason,
    }),
  );
}

/** Submeter bills are voided, not deleted (approved 2026-10-21). */
export async function deleteWaterSubmeterBills(_ids: string[]): Promise<void> {
  throw new Error("Submeter bills are voided with a reason, not deleted; the record and its history are kept.");
}

/** Voids a submeter bill: it stays on file, out of totals, and gives its month up. */
export async function voidWaterSubmeterBill(id: string, reason: string): Promise<WaterSubmeterBill> {
  return rowToSubmeterBill(await callFunction<Row>("voidUtilityRecord", { type: "WSB", id, reason }));
}

/* ---------------- meter readings ---------------- */

/** Readings newest first, so the first row is always the latest. */
export async function listWaterMeterReadings(filters: MeterReadingFilters = {}): Promise<WaterMeterReading[]> {
  return (await listWhere(READINGS, { submeter_id: filters.submeterId }, byFields("-reading_date", "-created_at")))
    .map(rowToReading)
    .filter((r) => filters.includeVoided || !r.voided);
}

const BACKWARDS = "The current reading cannot be lower than the previous reading.";

/** The reading's columns, with consumption computed as Postgres generated it. */
function readingFields(input: Omit<MeterReadingDraftInput, "submeterId">) {
  if (input.currentReading < input.previousReading) throw new Error(BACKWARDS);
  return {
    reading_date: input.readingDate,
    previous_reading: input.previousReading,
    current_reading: input.currentReading,
    consumption: input.currentReading - input.previousReading,
    amount: input.amount,
    remarks: input.remarks?.trim() || null,
  };
}

/** Saved by the server (createUtilityEntry): none for an archived submeter or account. */
export async function createWaterMeterReading(input: MeterReadingDraftInput): Promise<WaterMeterReading> {
  const { consumption: _derived, ...fields } = readingFields(input);
  return rowToReading(
    await callFunction<Row>("createUtilityEntry", { type: "WMR", record: { submeter_id: input.submeterId, ...fields } }),
  );
}

/** Readings keep their correction history (2026-10-21): use correctWaterMeterReading. */
export async function updateWaterMeterReading(
  _id: string,
  _input: Omit<MeterReadingDraftInput, "submeterId">,
): Promise<WaterMeterReading> {
  throw new Error("Meter readings are corrected with a reason; their previous values are kept.");
}

/** Corrects a reading, keeping the previous values (consumption included) in its revisions. */
export async function correctWaterMeterReading(
  id: string,
  input: Omit<MeterReadingDraftInput, "submeterId">,
  reason: string,
): Promise<WaterMeterReading> {
  const { consumption: _derived, ...changes } = readingFields(input);
  return rowToReading(await callFunction<Row>("correctUtilityRecord", { type: "WMR", id, changes, reason }));
}

/** Readings are voided, not deleted (approved 2026-10-21). */
export async function deleteWaterMeterReadings(_ids: string[]): Promise<void> {
  throw new Error("Meter readings are voided with a reason, not deleted; the record and its history are kept.");
}

/** Voids a reading: it stays on file and out of totals. */
export async function voidWaterMeterReading(id: string, reason: string): Promise<WaterMeterReading> {
  return rowToReading(await callFunction<Row>("voidUtilityRecord", { type: "WMR", id, reason }));
}
