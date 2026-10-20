/**
 * Corrections and voids of finalized records (approved policy, 2026-10-20).
 *
 * A correction keeps the record and its number and records what changed:
 * the previous and new value of each field, the reason, the account and the
 * time. A void is the reversal: the record stays, marked voided with its
 * reason, and drops out of active totals. Written by the correctUtilityRecord
 * and voidUtilityRecord Cloud Functions; the Supabase fallback has neither
 * column, so there a record is never voided and has no revisions.
 */

export interface RecordRevision {
  id: string;
  /** ISO time of the correction. */
  at: string;
  /** The account that made it (its email). */
  by: string;
  reason: string;
  /** Each changed field, before and after. */
  changes: Record<string, { from: unknown; to: unknown }>;
}

/** What a finalized record carries besides its own fields. */
export interface FinalizedRecord {
  voided?: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  revisions?: RecordRevision[];
}

export interface VoidInfo {
  voided: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToRevisions(r: any): RecordRevision[] {
  return Array.isArray(r?.revisions)
    ? r.revisions.map((v: any) => ({
        id: String(v.id ?? v.at),
        at: String(v.at),
        by: String(v.by ?? v.by_uid ?? ""),
        reason: String(v.reason ?? ""),
        changes: v.changes ?? {},
      }))
    : [];
}

export function rowToVoid(r: any): VoidInfo {
  return {
    voided: r?.voided === true,
    voidReason: r?.void_reason ?? undefined,
    voidedAt: r?.voided_at ?? undefined,
    voidedBy: r?.voided_by ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Only the records that count: voided ones stay on file but drop out of totals. */
export const activeOnly = <T extends { voided?: boolean }>(rows: T[]): T[] => rows.filter((r) => !r.voided);

/** Message used where the Supabase fallback cannot do what Firebase does. */
export const NEEDS_FIREBASE =
  "Voiding needs the Firebase backend: the Supabase database has no place to keep a void.";

/** Whether a record has anything to show in its history. */
export const hasHistory = (r: FinalizedRecord) => !!r.voided || (r.revisions?.length ?? 0) > 0;
