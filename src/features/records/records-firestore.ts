import { where } from "firebase/firestore";

import { fetchAllRows, type Row } from "@/lib/firestore";

/**
 * Helpers the three Records Management form services share on Firestore.
 * Forms are saved by the saveRecordsDocument Cloud Function (header, lines,
 * number and Records Room filing in one transaction); these only read, and
 * shape what the browser sends.
 */

/** How many lines each form has, for the list pages (Firestore `in` takes 30 values at a time). */
export async function countByParent(collection: string, field: string, ids: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 30) {
    const rows = await fetchAllRows(collection, [where(field, "in", ids.slice(i, i + 30))]);
    for (const r of rows) counts[String(r[field])] = (counts[String(r[field])] ?? 0) + 1;
  }
  return counts;
}

/** Strips what the function sets itself (parent, position, timestamps) from a line built for Supabase. */
export function lineFields(row: Row | Record<string, unknown>, parentField: string, keepId: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of [parentField, "item_number", "created_at", "updated_at", "retention_total"]) delete out[k];
  if (!keepId) delete out.id;
  return out;
}
