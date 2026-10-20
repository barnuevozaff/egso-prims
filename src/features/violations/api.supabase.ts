import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { NEEDS_FIREBASE } from "@/features/shared/revisions";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import { formatDate, normalizeName, orDash } from "@/features/violations/lib";
import type {
  PaymentStatus,
  Violation,
  Violator,
  ViolatorProfile,
} from "@/features/violations/types";

/**
 * Violation Management service — Supabase-backed, same conventions as every
 * other General Services Office module. Components never call Supabase directly.
 *
 * Payment rules are enforced here as well as by the table's constraints, so a
 * bad payment is rejected with a readable message before it reaches the
 * database.
 */

const VIOLATORS = "violators";
const VIOLATIONS = "violations";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToViolator(r: any): Violator {
  return {
    id: r.id,
    fullName: r.full_name,
    contactNumber: r.contact_number ?? undefined,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived === true,
    archivedAt: r.archived_at ?? undefined,
    archivedBy: r.archived_by ?? undefined,
  };
}

export function rowToViolation(r: any): Violation {
  return {
    id: r.id,
    violatorId: r.violator_id,
    violationNo: r.violation_no,
    violationType: r.violation_type,
    description: r.description ?? undefined,
    dateIssued: r.date_issued,
    amount: Number(r.amount ?? 0),
    remarks: r.remarks ?? undefined,
    apprehendedBy: r.apprehended_by ?? undefined,
    citationNo: r.citation_no ?? undefined,
    paymentStatus: (r.payment_status ?? "Pending") as PaymentStatus,
    paymentDate: r.payment_date ?? undefined,
    orNumber: r.or_number ?? undefined,
    amountPaid: Number(r.amount_paid ?? 0),
    paymentMethod: r.payment_method ?? undefined,
    paymentRemarks: r.payment_remarks ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
    outstandingBalance: Number(r.outstanding_balance ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    cancelledAt: r.cancelled_at ?? undefined,
    cancelledBy: r.cancelled_by ?? undefined,
  };
}

/* ---------------- violator profiles ---------------- */

export async function listViolators(search?: string): Promise<Violator[]> {
  const db = requireDb();
  let q = db.from(VIOLATORS).select("*").order("full_name", { ascending: true });
  if (search?.trim()) q = q.or(searchOr(["full_name", "contact_number", "address"], search));
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToViolator);
}

export async function getViolator(id: string): Promise<Violator | null> {
  const db = requireDb();
  const { data, error } = await db.from(VIOLATORS).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToViolator(data) : null;
}

export interface ViolatorInput {
  fullName: string;
  contactNumber?: string;
  email?: string;
  address?: string;
}

export async function createViolator(input: ViolatorInput): Promise<Violator> {
  const db = requireDb();
  const at = nowIso();
  const row = {
    id: `vlt-${uid()}`,
    full_name: input.fullName.trim(),
    contact_number: input.contactNumber?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    created_at: at,
    updated_at: at,
  };
  return rowToViolator(unwrap(await db.from(VIOLATORS).insert(row).select().single()));
}

export async function updateViolator(id: string, input: ViolatorInput): Promise<Violator> {
  const db = requireDb();
  const row = {
    full_name: input.fullName.trim(),
    contact_number: input.contactNumber?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    updated_at: nowIso(),
  };
  return rowToViolator(
    unwrap(await db.from(VIOLATORS).update(row).eq("id", id).select().single()),
  );
}

/** Removes profiles; their violations cascade with them. */
export async function deleteViolators(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(VIOLATORS).delete().in("id", ids));
}

/**
 * The profile for a typed name, matched on the normalised key rather than the
 * displayed string — "NASOL, RICHARD" finds "Nasol, Richard".
 */
export async function findViolatorByName(name: string): Promise<Violator | null> {
  const db = requireDb();
  const key = normalizeName(name);
  if (!key) return null;
  const { data, error } = await db
    .from(VIOLATORS)
    .select("*")
    .eq("name_key", key)
    .maybeSingle();
  if (error) return null;
  return data ? rowToViolator(data) : null;
}

/**
 * Resolves a typed name to a profile, creating one only if the office has
 * never recorded this person before.
 *
 * A new profile carries the name alone. Contact number, email and address are
 * not asked for on the violation form — they belong to the person, not to the
 * ticket, and are filled in later from Edit Profile.
 */
async function findOrCreateViolator(
  name: string,
): Promise<{ violator: Violator; created: boolean }> {
  const existing = await findViolatorByName(name);
  if (existing) return { violator: existing, created: false };

  try {
    return { violator: await createViolator({ fullName: name }), created: true };
  } catch (e) {
    // Lost a race with a concurrent insert of the same person: the unique
    // index on name_key rejected the second write, so adopt the winner.
    const raced = await findViolatorByName(name);
    if (raced) return { violator: raced, created: false };
    throw e;
  }
}

export interface RecordViolationInput extends ViolationInput {
  /** Typed on the violation form; the profile is found or created from it. */
  violatorName: string;
}

/**
 * The module's primary action: record a violation against a name.
 *
 * The profile is found or created automatically, so an administrator never
 * registers a person as a separate step, and a second violation for someone
 * already on file attaches to their existing profile instead of duplicating
 * it.
 */
export async function recordViolation(input: RecordViolationInput): Promise<{
  violation: Violation;
  violator: Violator;
  createdProfile: boolean;
}> {
  const name = input.violatorName.trim();
  if (!name) throw new Error("Enter the violator's name.");

  const { violator, created } = await findOrCreateViolator(name);

  try {
    const violation = await createViolation(violator.id, input);
    return { violation, violator, createdProfile: created };
  } catch (e) {
    // A profile opened for this violation and nothing else would be a stray
    // empty record, so it goes back out with the failure.
    if (created) {
      try {
        await deleteViolators([violator.id]);
      } catch {
        // Best effort — the original failure is what matters.
      }
    }
    throw e;
  }
}

/* ---------------- violations ---------------- */

export async function listViolations(violatorId?: string): Promise<Violation[]> {
  const db = requireDb();
  let q = db.from(VIOLATIONS).select("*").order("date_issued", { ascending: false });
  if (violatorId) q = q.eq("violator_id", violatorId);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToViolation);
}

export interface ViolationInput {
  violationType: string;
  description?: string;
  /** yyyy-MM-dd */
  dateIssued: string;
  amount: number;
  remarks?: string;
  /** Officer who apprehended the violator. */
  apprehendedBy?: string;
  /** Serial on the paper ticket issued at apprehension — not the payment OR. */
  citationNo?: string;
}

/**
 * Records a violation against an existing profile. The violator is supplied by
 * the profile the form was opened from, so the name is never re-selected.
 *
 * New violations always start unsettled: Pending, no payment date, no receipt
 * number, ₱0 paid, and the full assessed amount outstanding.
 */
export async function createViolation(
  violatorId: string,
  input: ViolationInput,
): Promise<Violation> {
  const db = requireDb();
  if (input.amount <= 0) throw new Error("The assessed amount must be more than ₱0.");

  const violationNo = await nextDocumentNumber("VT");
  const at = nowIso();
  const row = {
    id: violationNo,
    violator_id: violatorId,
    violation_no: violationNo,
    violation_type: input.violationType,
    description: input.description?.trim() || null,
    date_issued: input.dateIssued,
    amount: input.amount,
    remarks: input.remarks?.trim() || null,
    apprehended_by: input.apprehendedBy?.trim() || null,
    citation_no: input.citationNo?.trim() || null,
    payment_status: "Pending" as PaymentStatus,
    payment_date: null,
    or_number: null,
    amount_paid: 0,
    payment_method: null,
    payment_remarks: null,
    cancel_reason: null,
    created_at: at,
    updated_at: at,
  };
  return rowToViolation(unwrap(await db.from(VIOLATIONS).insert(row).select().single()));
}

/** Corrects the particulars of a violation. Payment fields are untouched. */
export async function updateViolation(
  id: string,
  input: ViolationInput,
): Promise<Violation> {
  const db = requireDb();
  if (input.amount <= 0) throw new Error("The assessed amount must be more than ₱0.");

  const current = await getViolation(id);
  if (!current) throw new Error(`Violation not found: ${id}`);
  if (current.paymentStatus === "Paid" && input.amount !== current.amount) {
    throw new Error("A settled violation's assessed amount can no longer be changed.");
  }

  const row = {
    violation_type: input.violationType,
    description: input.description?.trim() || null,
    date_issued: input.dateIssued,
    amount: input.amount,
    remarks: input.remarks?.trim() || null,
    apprehended_by: input.apprehendedBy?.trim() || null,
    citation_no: input.citationNo?.trim() || null,
    updated_at: nowIso(),
  };
  return rowToViolation(
    unwrap(await db.from(VIOLATIONS).update(row).eq("id", id).select().single()),
  );
}

export async function getViolation(id: string): Promise<Violation | null> {
  const db = requireDb();
  const { data, error } = await db.from(VIOLATIONS).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToViolation(data) : null;
}

export interface PaymentInput {
  /** yyyy-MM-dd */
  paymentDate: string;
  orNumber: string;
  amountPaid: number;
  paymentMethod?: string;
  remarks?: string;
}

/**
 * Settles a violation. Full payment only — the assessed amount is paid in one
 * go, or not at all — so there is no partial state to represent and the
 * outstanding balance always lands on ₱0.
 */
export async function recordPayment(id: string, input: PaymentInput): Promise<Violation> {
  const db = requireDb();
  const current = await getViolation(id);
  if (!current) throw new Error(`Violation not found: ${id}`);
  if (current.paymentStatus === "Paid") throw new Error("This violation is already settled.");
  if (current.paymentStatus === "Cancelled") {
    throw new Error("A cancelled violation cannot take a payment.");
  }
  if (!input.paymentDate) throw new Error("Select the payment date.");
  if (!input.orNumber?.trim()) throw new Error("Enter the receipt/OR number.");
  if (input.amountPaid > current.amount) {
    throw new Error("The payment cannot be more than the assessed amount.");
  }
  if (input.amountPaid !== current.amount) {
    throw new Error("Record the full assessed amount — partial payments are not accepted.");
  }

  const row = {
    payment_status: "Paid" as PaymentStatus,
    payment_date: input.paymentDate,
    or_number: input.orNumber.trim(),
    amount_paid: current.amount,
    payment_method: input.paymentMethod?.trim() || null,
    payment_remarks: input.remarks?.trim() || null,
    updated_at: nowIso(),
  };
  return rowToViolation(
    unwrap(await db.from(VIOLATIONS).update(row).eq("id", id).select().single()),
  );
}

/** Voids an unsettled violation, keeping it on the record with its reason. */
export async function cancelViolation(id: string, reason: string): Promise<Violation> {
  const db = requireDb();
  const current = await getViolation(id);
  if (!current) throw new Error(`Violation not found: ${id}`);
  if (current.paymentStatus === "Paid") {
    throw new Error("A settled violation can no longer be cancelled.");
  }

  const row = {
    payment_status: "Cancelled" as PaymentStatus,
    payment_date: null,
    or_number: null,
    amount_paid: 0,
    cancel_reason: reason.trim() || null,
    updated_at: nowIso(),
  };
  return rowToViolation(
    unwrap(await db.from(VIOLATIONS).update(row).eq("id", id).select().single()),
  );
}

export async function deleteViolations(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(VIOLATIONS).delete().in("id", ids));
}

/* ---------------- export ---------------- */

const csvText = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** The profile register, one line per violator. */
export function exportViolatorsCsv(rows: ViolatorProfile[]): string {
  const header = [
    "Violator Name", "Contact Number", "Total Violations", "Paid", "Pending",
    "Total Amount", "Amount Paid", "Outstanding Balance", "Status",
  ];
  const lines = rows.map((p) =>
    [
      csvText(p.violator.fullName),
      csvText(p.violator.contactNumber ?? ""),
      p.totalViolations,
      p.paidCount,
      p.pendingCount,
      p.totalAmount.toFixed(2),
      p.totalPaid.toFixed(2),
      p.outstandingBalance.toFixed(2),
      p.status,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/** One violator's full violation and payment history. */
export function exportViolationsCsv(profile: ViolatorProfile): string {
  const header = [
    "Violation No.", "Citation No.", "Violation", "Apprehended By", "Date Issued",
    "Amount", "Payment Status", "Payment Date", "Receipt/OR No.", "Amount Paid",
    "Outstanding Balance", "Remarks",
  ];
  const lines = profile.violations.map((v) =>
    [
      v.violationNo,
      csvText(v.citationNo ?? ""),
      csvText(v.violationType),
      csvText(v.apprehendedBy ?? ""),
      formatDate(v.dateIssued),
      v.amount.toFixed(2),
      v.paymentStatus,
      v.paymentDate ? formatDate(v.paymentDate) : orDash(undefined),
      orDash(v.orNumber),
      v.amountPaid.toFixed(2),
      (v.amount - v.amountPaid).toFixed(2),
      csvText(v.remarks ?? ""),
    ].join(","),
  );
  return [
    `Violator,${csvText(profile.violator.fullName)}`,
    `Total Violations,${profile.totalViolations}`,
    `Total Assessed,${profile.totalAmount.toFixed(2)}`,
    `Total Paid,${profile.totalPaid.toFixed(2)}`,
    `Outstanding Balance,${profile.outstandingBalance.toFixed(2)}`,
    "",
    header.join(","),
    ...lines,
  ].join("\n");
}

/** Archiving needs the Firebase backend. */
export async function archiveViolator(_id: string, _archived: boolean): Promise<Violator> {
  throw new Error(NEEDS_FIREBASE);
}
