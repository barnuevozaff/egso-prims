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
  rowToSubmeter,
  rowToSubmeterBill,
  type AccountDraftInput,
  type AccountListFilters,
  type BillDraftInput,
  type SubmeterBillDraftInput,
  type SubmeterBillFilters,
  type SubmeterDraftInput,
  type SubmeterListFilters,
} from "@/features/energy/api.supabase";
import { deleteHolders, setArchived } from "@/features/shared/record-holders";
import type {
  EnergyAccount,
  EnergyBill,
  EnergyBillFilters,
  EnergySubmeter,
  EnergySubmeterBill,
  SubmeterStatus,
} from "@/features/energy/types";

/**
 * Energy Consumption service — Firestore-backed. Same signatures as
 * api.supabase.ts. Bills are numbered (EC) and saved by the
 * createNumberedRecord Cloud Function in one transaction; deleting an
 * account or submeter removes its bills through the cascadeDeletes function.
 */

const ACCOUNTS = "energy_accounts";
const BILLS = "energy_bills";
const SUBMETERS = "energy_submeters";
const SUBMETER_BILLS = "energy_submeter_bills";
const nowIso = () => new Date().toISOString();

/* ---------------- accounts ---------------- */

export async function listEnergyAccounts(filters: AccountListFilters = {}): Promise<EnergyAccount[]> {
  const rows = await listWhere(ACCOUNTS, { location: filters.location }, byFields("account_number"));
  return rows
    .filter((r) => matchesSearch(r, ["account_number", "account_name", "location", "meter_number"], filters.search))
    .map(rowToAccount);
}

export async function getEnergyAccount(id: string): Promise<EnergyAccount | null> {
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

export async function createEnergyAccount(input: AccountDraftInput): Promise<EnergyAccount> {
  const at = nowIso();
  return rowToAccount(
    await saveClaimedRow({
      collection: ACCOUNTS,
      id: `ea-${Date.now()}`,
      isNew: true,
      fields: { ...accountFields(input), created_at: at, updated_at: at },
      keyOf: accountKey,
      duplicate: DUPLICATE_ACCOUNT,
      notFound: "",
    }),
  );
}

export async function updateEnergyAccount(id: string, input: AccountDraftInput): Promise<EnergyAccount> {
  return rowToAccount(
    await saveClaimedRow({
      collection: ACCOUNTS,
      id,
      isNew: false,
      fields: { ...accountFields(input), updated_at: nowIso() },
      keyOf: accountKey,
      duplicate: DUPLICATE_ACCOUNT,
      notFound: `Energy account not found: ${id}`,
    }),
  );
}

/**
 * Deletes accounts that hold no records; an account with bills or submeters
 * is kept (official records are never deleted) — archive it instead.
 */
export async function deleteEnergyAccounts(ids: string[]): Promise<void> {
  await deleteHolders(ACCOUNTS, ids);
}

/** Archives or restores an account; it keeps everything it holds. */
export async function archiveEnergyAccount(id: string, archived: boolean): Promise<EnergyAccount> {
  return rowToAccount(await setArchived(ACCOUNTS, id, archived));
}

/* ---------------- bills ---------------- */

export async function listEnergyBills(filters: EnergyBillFilters = {}): Promise<EnergyBill[]> {
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
  // Period-range filtering is ordinal (year*12+month), so the range can
  // straddle a year boundary.
  const ord = (y: number, m: number) => y * 12 + m;
  const from = filters.fromYear && filters.fromMonth ? ord(filters.fromYear, filters.fromMonth) : null;
  const to = filters.toYear && filters.toMonth ? ord(filters.toYear, filters.toMonth) : null;
  return rows.filter((b) => {
    const o = ord(b.billingYear, b.billingMonth);
    return (from === null || o >= from) && (to === null || o <= to);
  });
}

export async function createEnergyBill(input: BillDraftInput): Promise<EnergyBill> {
  const row = await callFunction<Row>("createNumberedRecord", {
    type: "EC",
    record: {
      account_id: input.accountId,
      billing_month: input.billingMonth,
      billing_year: input.billingYear,
      amount: input.amount,
      kwh: input.kwh,
      remarks: input.remarks?.trim() || null,
    },
  });
  return rowToBill(row);
}

/**
 * Bills are finalized records (policy 2026-10-20): corrected with a reason
 * through correctEnergyBill, or voided — never edited in place or deleted.
 */
export async function updateEnergyBill(
  _id: string,
  _input: Pick<BillDraftInput, "amount" | "kwh" | "remarks">,
): Promise<EnergyBill> {
  throw new Error("Bills are corrected with a reason, or voided, not edited or deleted directly.");
}

export async function deleteEnergyBills(_ids: string[]): Promise<void> {
  throw new Error("Bills are corrected with a reason, or voided, not edited or deleted directly.");
}

/** Corrects a bill, keeping the previous values in its revisions. */
export async function correctEnergyBill(
  id: string,
  input: Pick<BillDraftInput, "amount" | "kwh" | "remarks">,
  reason: string,
): Promise<EnergyBill> {
  return rowToBill(
    await callFunction<Row>("correctUtilityRecord", {
      type: "EC",
      id,
      changes: { amount: input.amount, kwh: input.kwh, remarks: input.remarks?.trim() || null },
      reason,
    }),
  );
}

/** Voids a bill: it stays on file, out of totals; its month is free for a corrected bill. */
export async function voidEnergyBill(id: string, reason: string): Promise<EnergyBill> {
  return rowToBill(await callFunction<Row>("voidUtilityRecord", { type: "EC", id, reason }));
}

/* ---------------- submeters ---------------- */

export async function listEnergySubmeters(filters: SubmeterListFilters = {}): Promise<EnergySubmeter[]> {
  return (
    await listWhere(
      SUBMETERS,
      { account_id: filters.accountId, office_code: filters.officeCode, status: filters.status },
      byFields("submeter_number"),
    )
  ).map(rowToSubmeter);
}

const submeterFields = (input: Omit<SubmeterDraftInput, "accountId">) => ({
  submeter_name: input.submeterName,
  submeter_number: input.submeterNumber,
  office_code: input.officeCode,
  assigned_user: input.assignedUser?.trim() || null,
  status: input.status,
});

const DUPLICATE_SUBMETER = "That submeter number already exists on this account.";

/** A submeter number is unique on its account, held by a claim saved with the submeter. */
const submeterKey = (r: Record<string, unknown>) =>
  claimKey(SUBMETERS, "submeter_number", `${String(r.account_id ?? "")}~${String(r.submeter_number ?? "")}`);

export async function createEnergySubmeter(input: SubmeterDraftInput): Promise<EnergySubmeter> {
  const at = nowIso();
  return rowToSubmeter(
    await saveClaimedRow({
      collection: SUBMETERS,
      id: `es-${input.accountId}-${Date.now()}`,
      isNew: true,
      fields: { account_id: input.accountId, ...submeterFields(input), created_at: at, updated_at: at },
      keyOf: submeterKey,
      duplicate: DUPLICATE_SUBMETER,
      notFound: "",
    }),
  );
}

export async function updateEnergySubmeter(
  id: string,
  input: Omit<SubmeterDraftInput, "accountId">,
): Promise<EnergySubmeter> {
  return rowToSubmeter(
    await saveClaimedRow({
      collection: SUBMETERS,
      id,
      isNew: false,
      fields: { ...submeterFields(input), updated_at: nowIso() },
      keyOf: submeterKey,
      duplicate: DUPLICATE_SUBMETER,
      notFound: `Energy submeter not found: ${id}`,
    }),
  );
}

/**
 * Archiving keeps the submeter and its billing history for reporting; only
 * active submeters count toward the account's live totals.
 */
export async function archiveEnergySubmeter(id: string, status: SubmeterStatus): Promise<EnergySubmeter> {
  return rowToSubmeter(
    await updateRow(SUBMETERS, id, `Energy submeter not found: ${id}`, () => ({ status, updated_at: nowIso() })),
  );
}

/** Deletes submeters that hold no bills; one with bills is kept — set it Inactive instead. */
export async function deleteEnergySubmeters(ids: string[]): Promise<void> {
  await deleteHolders(SUBMETERS, ids);
}

/* ---------------- submeter bills ---------------- */

export async function listEnergySubmeterBills(filters: SubmeterBillFilters = {}): Promise<EnergySubmeterBill[]> {
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
 * month, and none for an inactive submeter or an archived account.
 */
export async function createEnergySubmeterBill(input: SubmeterBillDraftInput): Promise<EnergySubmeterBill> {
  return rowToSubmeterBill(
    await callFunction<Row>("createUtilityEntry", {
      type: "ESB",
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

/** Submeter bills keep their correction history (2026-10-21): use correctEnergySubmeterBill. */
export async function updateEnergySubmeterBill(
  _id: string,
  _input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
): Promise<EnergySubmeterBill> {
  throw new Error("Submeter bills are corrected with a reason; their previous values are kept.");
}

/** Corrects a submeter bill, keeping the previous values in its revisions. */
export async function correctEnergySubmeterBill(
  id: string,
  input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
  reason: string,
): Promise<EnergySubmeterBill> {
  return rowToSubmeterBill(
    await callFunction<Row>("correctUtilityRecord", {
      type: "ESB",
      id,
      changes: { consumption: input.consumption, amount: input.amount, remarks: input.remarks?.trim() || null },
      reason,
    }),
  );
}

/** Submeter bills are voided, not deleted (approved 2026-10-21). */
export async function deleteEnergySubmeterBills(_ids: string[]): Promise<void> {
  throw new Error("Submeter bills are voided with a reason, not deleted; the record and its history are kept.");
}

/** Voids a submeter bill: it stays on file, out of totals, and gives its month up. */
export async function voidEnergySubmeterBill(id: string, reason: string): Promise<EnergySubmeterBill> {
  return rowToSubmeterBill(await callFunction<Row>("voidUtilityRecord", { type: "ESB", id, reason }));
}
