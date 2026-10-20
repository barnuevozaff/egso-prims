import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import { NEEDS_FIREBASE, rowToRevisions, rowToVoid } from "@/features/shared/revisions";
import type {
  EnergyAccount,
  EnergyBill,
  EnergyBillFilters,
  EnergySubmeter,
  EnergySubmeterBill,
  SubmeterStatus,
} from "@/features/energy/types";

/**
 * Energy Consumption service — Supabase-backed, same conventions as every
 * other General Services Office module. Components never call Supabase directly.
 */

const ACCOUNTS = "energy_accounts";
const BILLS = "energy_bills";
const SUBMETERS = "energy_submeters";
const SUBMETER_BILLS = "energy_submeter_bills";
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToAccount(r: any): EnergyAccount {
  return {
    id: r.id,
    accountNumber: r.account_number,
    accountName: r.account_name ?? undefined,
    location: r.location,
    meterNumber: r.meter_number,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived === true,
    archivedAt: r.archived_at ?? undefined,
    archivedBy: r.archived_by ?? undefined,
  };
}

export function rowToBill(r: any): EnergyBill {
  return {
    id: r.id,
    docNumber: r.doc_number ?? undefined,
    accountId: r.account_id,
    billingMonth: r.billing_month,
    billingYear: r.billing_year,
    amount: Number(r.amount),
    kwh: Number(r.kwh ?? 0),
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
    ...rowToVoid(r),
    revisions: rowToRevisions(r),
  };
}

/* ---------------- accounts ---------------- */

export interface AccountListFilters {
  search?: string;
  location?: string;
}

export async function listEnergyAccounts(
  filters: AccountListFilters = {},
): Promise<EnergyAccount[]> {
  const db = requireDb();
  let q = db.from(ACCOUNTS).select("*").order("account_number", { ascending: true });
  if (filters.location) q = q.eq("location", filters.location);
  if (filters.search?.trim()) {
    q = q.or(
      searchOr(["account_number", "account_name", "location", "meter_number"], filters.search),
    );
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToAccount);
}

export async function getEnergyAccount(id: string): Promise<EnergyAccount | null> {
  const db = requireDb();
  const { data, error } = await db.from(ACCOUNTS).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToAccount(data) : null;
}

export interface AccountDraftInput {
  accountNumber: string;
  accountName?: string;
  location: string;
  meterNumber: string;
}

export async function createEnergyAccount(input: AccountDraftInput): Promise<EnergyAccount> {
  const db = requireDb();
  const at = nowIso();
  const row = {
    id: `ea-${Date.now()}`,
    account_number: input.accountNumber,
    account_name: input.accountName?.trim() || null,
    location: input.location,
    meter_number: input.meterNumber,
    created_at: at,
    updated_at: at,
  };
  return rowToAccount(unwrap(await db.from(ACCOUNTS).insert(row).select().single()));
}

export async function updateEnergyAccount(
  id: string,
  input: AccountDraftInput,
): Promise<EnergyAccount> {
  const db = requireDb();
  const row = {
    account_number: input.accountNumber,
    account_name: input.accountName?.trim() || null,
    location: input.location,
    meter_number: input.meterNumber,
    updated_at: nowIso(),
  };
  return rowToAccount(unwrap(await db.from(ACCOUNTS).update(row).eq("id", id).select().single()));
}

/** Deletes accounts; their bills cascade in the database. */
export async function deleteEnergyAccounts(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(ACCOUNTS).delete().in("id", ids));
}

/* ---------------- bills ---------------- */

export async function listEnergyBills(filters: EnergyBillFilters = {}): Promise<EnergyBill[]> {
  const db = requireDb();
  let q = db
    .from(BILLS)
    .select("*")
    .order("billing_year", { ascending: false })
    .order("billing_month", { ascending: false });
  if (filters.accountId) q = q.eq("account_id", filters.accountId);
  if (filters.year) q = q.eq("billing_year", filters.year);
  if (filters.month) q = q.eq("billing_month", filters.month);
  const rows = (await fetchAll((from, to) => q.range(from, to))).map(rowToBill);

  // Period-range filtering is ordinal (year*12+month), applied in memory so
  // the range can straddle a year boundary.
  const ord = (y: number, m: number) => y * 12 + m;
  const from =
    filters.fromYear && filters.fromMonth ? ord(filters.fromYear, filters.fromMonth) : null;
  const to = filters.toYear && filters.toMonth ? ord(filters.toYear, filters.toMonth) : null;
  return rows.filter((b) => {
    const o = ord(b.billingYear, b.billingMonth);
    if (from !== null && o < from) return false;
    if (to !== null && o > to) return false;
    return true;
  });
}

export interface BillDraftInput {
  accountId: string;
  billingMonth: number;
  billingYear: number;
  amount: number;
  kwh: number;
  remarks?: string;
}

export async function createEnergyBill(input: BillDraftInput): Promise<EnergyBill> {
  const db = requireDb();
  const docNumber = await nextDocumentNumber("EC");
  const row = {
    id: `eb-${input.accountId}-${input.billingYear}-${String(input.billingMonth).padStart(2, "0")}`,
    doc_number: docNumber,
    account_id: input.accountId,
    billing_month: input.billingMonth,
    billing_year: input.billingYear,
    amount: input.amount,
    kwh: input.kwh,
    remarks: input.remarks?.trim() || null,
    created_at: nowIso(),
  };
  const { data, error } = await db.from(BILLS).insert(row).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.toLowerCase().includes("duplicate")) {
      throw new Error("A bill for that account and billing period already exists.");
    }
    throw new Error(`Unable to record the bill: ${msg}`);
  }
  return rowToBill(data);
}

export async function updateEnergyBill(
  id: string,
  input: Pick<BillDraftInput, "amount" | "kwh" | "remarks">,
): Promise<EnergyBill> {
  const db = requireDb();
  const row = {
    amount: input.amount,
    kwh: input.kwh,
    remarks: input.remarks?.trim() || null,
  };
  return rowToBill(unwrap(await db.from(BILLS).update(row).eq("id", id).select().single()));
}

export async function deleteEnergyBills(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(BILLS).delete().in("id", ids));
}

/* ---------------- submeters ---------------- */

export function rowToSubmeter(r: any): EnergySubmeter {
  return {
    id: r.id,
    accountId: r.account_id,
    submeterName: r.submeter_name,
    submeterNumber: r.submeter_number,
    officeCode: r.office_code,
    assignedUser: r.assigned_user ?? undefined,
    status: r.status as SubmeterStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToSubmeterBill(r: any): EnergySubmeterBill {
  return {
    id: r.id,
    submeterId: r.submeter_id,
    billingMonth: r.billing_month,
    billingYear: r.billing_year,
    consumption: Number(r.consumption ?? 0),
    amount: Number(r.amount),
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
    ...rowToVoid(r),
    revisions: rowToRevisions(r),
  };
}

export interface SubmeterListFilters {
  accountId?: string;
  officeCode?: string;
  status?: string;
}

export async function listEnergySubmeters(
  filters: SubmeterListFilters = {},
): Promise<EnergySubmeter[]> {
  const db = requireDb();
  let q = db.from(SUBMETERS).select("*").order("submeter_number", { ascending: true });
  if (filters.accountId) q = q.eq("account_id", filters.accountId);
  if (filters.officeCode) q = q.eq("office_code", filters.officeCode);
  if (filters.status) q = q.eq("status", filters.status);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToSubmeter);
}

export interface SubmeterDraftInput {
  accountId: string;
  submeterName: string;
  submeterNumber: string;
  officeCode: string;
  assignedUser?: string;
  status: SubmeterStatus;
}

export async function createEnergySubmeter(
  input: SubmeterDraftInput,
): Promise<EnergySubmeter> {
  const db = requireDb();
  const at = nowIso();
  const row = {
    id: `es-${input.accountId}-${Date.now()}`,
    account_id: input.accountId,
    submeter_name: input.submeterName,
    submeter_number: input.submeterNumber,
    office_code: input.officeCode,
    assigned_user: input.assignedUser?.trim() || null,
    status: input.status,
    created_at: at,
    updated_at: at,
  };
  const { data, error } = await db.from(SUBMETERS).insert(row).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.toLowerCase().includes("duplicate")) {
      throw new Error("That submeter number already exists on this account.");
    }
    throw new Error(`Unable to save the submeter: ${msg}`);
  }
  return rowToSubmeter(data);
}

export async function updateEnergySubmeter(
  id: string,
  input: Omit<SubmeterDraftInput, "accountId">,
): Promise<EnergySubmeter> {
  const db = requireDb();
  const row = {
    submeter_name: input.submeterName,
    submeter_number: input.submeterNumber,
    office_code: input.officeCode,
    assigned_user: input.assignedUser?.trim() || null,
    status: input.status,
    updated_at: nowIso(),
  };
  return rowToSubmeter(unwrap(await db.from(SUBMETERS).update(row).eq("id", id).select().single()));
}

/**
 * Archiving keeps the submeter and its billing history for reporting; only
 * active submeters count toward the account's live totals.
 */
export async function archiveEnergySubmeter(
  id: string,
  status: SubmeterStatus,
): Promise<EnergySubmeter> {
  const db = requireDb();
  return rowToSubmeter(
    unwrap(
      await db
        .from(SUBMETERS)
        .update({ status, updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
    ),
  );
}

/** Deletes submeters; their bills cascade in the database. */
export async function deleteEnergySubmeters(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(SUBMETERS).delete().in("id", ids));
}

/* ---------------- submeter bills ---------------- */

export interface SubmeterBillFilters {
  /** Voided entries stay on file; lists leave them out unless asked. */
  includeVoided?: boolean;
  submeterId?: string;
  year?: number;
  month?: number;
}

export async function listEnergySubmeterBills(
  filters: SubmeterBillFilters = {},
): Promise<EnergySubmeterBill[]> {
  const db = requireDb();
  let q = db
    .from(SUBMETER_BILLS)
    .select("*")
    .order("billing_year", { ascending: false })
    .order("billing_month", { ascending: false });
  if (filters.submeterId) q = q.eq("submeter_id", filters.submeterId);
  if (filters.year) q = q.eq("billing_year", filters.year);
  if (filters.month) q = q.eq("billing_month", filters.month);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToSubmeterBill);
}

export interface SubmeterBillDraftInput {
  submeterId: string;
  billingMonth: number;
  billingYear: number;
  consumption: number;
  amount: number;
  remarks?: string;
}

export async function createEnergySubmeterBill(
  input: SubmeterBillDraftInput,
): Promise<EnergySubmeterBill> {
  const db = requireDb();
  const row = {
    id: `esb-${input.submeterId}-${input.billingYear}-${String(input.billingMonth).padStart(2, "0")}`,
    submeter_id: input.submeterId,
    billing_month: input.billingMonth,
    billing_year: input.billingYear,
    consumption: input.consumption,
    amount: input.amount,
    remarks: input.remarks?.trim() || null,
    created_at: nowIso(),
  };
  const { data, error } = await db.from(SUBMETER_BILLS).insert(row).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.toLowerCase().includes("duplicate")) {
      throw new Error("A bill for that submeter and billing period already exists.");
    }
    throw new Error(`Unable to record the bill: ${msg}`);
  }
  return rowToSubmeterBill(data);
}

export async function updateEnergySubmeterBill(
  id: string,
  input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
): Promise<EnergySubmeterBill> {
  const db = requireDb();
  const row = {
    consumption: input.consumption,
    amount: input.amount,
    remarks: input.remarks?.trim() || null,
  };
  return rowToSubmeterBill(
    unwrap(await db.from(SUBMETER_BILLS).update(row).eq("id", id).select().single()),
  );
}

export async function deleteEnergySubmeterBills(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(SUBMETER_BILLS).delete().in("id", ids));
}

/* ---------------- corrections and voids ---------------- */

/**
 * Corrects a bill. Supabase has no column for the revision history the
 * Firebase backend keeps, so here the values change in place.
 */
export async function correctEnergyBill(
  id: string,
  input: Pick<BillDraftInput, "amount" | "kwh" | "remarks">,
  _reason: string,
): Promise<EnergyBill> {
  return updateEnergyBill(id, input);
}

/** Voiding needs the Firebase backend (no void column in Supabase). */
export async function voidEnergyBill(_id: string, _reason: string): Promise<EnergyBill> {
  throw new Error(NEEDS_FIREBASE);
}

/** Corrects a submeter bill; on Supabase the values change in place (no history column). */
export async function correctEnergySubmeterBill(
  id: string,
  input: Pick<SubmeterBillDraftInput, "consumption" | "amount" | "remarks">,
  _reason: string,
): Promise<EnergySubmeterBill> {
  return updateEnergySubmeterBill(id, input);
}

/** Archiving needs the Firebase backend. */
export async function archiveEnergyAccount(_id: string, _archived: boolean): Promise<EnergyAccount> {
  throw new Error(NEEDS_FIREBASE);
}

/** Voiding needs the Firebase backend (approved 2026-10-21). */
export async function voidEnergySubmeterBill(_id: string, _reason: string): Promise<EnergySubmeterBill> {
  throw new Error(NEEDS_FIREBASE);
}
