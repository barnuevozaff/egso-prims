import { fetchAll, isoDate, requireDb, searchOr, unwrap } from "@/lib/db";
import type { AuditEntry, AuditListFilters } from "@/features/audit/types";

/**
 * Audit service — Supabase-backed. Entries are immutable except for reviewer
 * comments; database triggers append a log row for every mutation in the
 * document tables automatically.
 */

const TABLE = "audit_logs";
const uid = () => crypto.randomUUID();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToEntry(r: any): AuditEntry {
  return {
    id: r.id,
    timestamp: r.timestamp,
    user: r.user_name,
    email: r.email ?? undefined,
    userRole: r.user_role,
    departmentCode: r.department_code,
    module: r.module,
    action: r.action,
    documentNumber: r.document_number ?? undefined,
    previousValue: r.previous_value ?? undefined,
    updatedValue: r.updated_value ?? undefined,
    response: r.response,
    remarks: r.remarks ?? undefined,
    ip: r.ip,
    browser: r.browser,
    os: r.os,
    sessionId: r.session_id,
    severity: r.severity,
    status: r.status,
    comments: r.comments ?? [],
  };
}

export async function listAuditEntries(filters: AuditListFilters = {}): Promise<AuditEntry[]> {
  const db = requireDb();
  let q = db.from(TABLE).select("*").order("timestamp", { ascending: false });
  if (filters.user) q = q.eq("user_name", filters.user);
  if (filters.departmentCode) q = q.eq("department_code", filters.departmentCode);
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.dateFrom) q = q.gte("timestamp", isoDate(filters.dateFrom));
  if (filters.dateTo) q = q.lte("timestamp", isoDate(filters.dateTo, true));
  if (filters.search?.trim()) {
    q = q.or(
      // Covers user name, account email, record number, module and the
      // response/remarks description text.
      searchOr(
        [
          "id",
          "user_name",
          "email",
          "module",
          "action",
          "document_number",
          "response",
          "remarks",
          "ip",
        ],
        filters.search,
      ),
    );
  }
  if (filters.limit) return unwrap(await q.limit(filters.limit)).map(rowToEntry);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToEntry);
}

export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToEntry(data) : null;
}

/** Entries touching the same document (workflow trail). */
export async function listRelatedEntries(entry: AuditEntry): Promise<AuditEntry[]> {
  if (!entry.documentNumber) return [];
  const db = requireDb();
  return unwrap(
    await db
      .from(TABLE)
      .select("*")
      .eq("document_number", entry.documentNumber)
      .order("timestamp", { ascending: true }),
  ).map(rowToEntry);
}

/** Entries from the same login session. */
export async function listSessionEntries(entry: AuditEntry): Promise<AuditEntry[]> {
  const db = requireDb();
  return unwrap(
    await db
      .from(TABLE)
      .select("*")
      .eq("session_id", entry.sessionId)
      .order("timestamp", { ascending: false }),
  ).map(rowToEntry);
}

export async function addAuditComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<AuditEntry> {
  const db = requireDb();
  const current = await getAuditEntry(id);
  if (!current) throw new Error(`Audit entry not found: ${id}`);
  const comments = [
    ...current.comments,
    { id: uid(), createdAt: new Date().toISOString(), ...input },
  ];
  return rowToEntry(
    unwrap(await db.from(TABLE).update({ comments }).eq("id", id).select().single()),
  );
}

export async function deleteAuditEntries(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

export function exportAuditCsv(rows: AuditEntry[]): string {
  const header = ["Timestamp", "User", "Department", "Module", "Action", "Document", "IP", "Severity", "Status"];
  const lines = rows.map((e) =>
    [
      e.timestamp,
      `"${e.user}"`,
      e.departmentCode,
      e.module,
      `"${e.action}"`,
      e.documentNumber ?? "",
      e.ip,
      e.severity,
      e.status,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
