import { countRows, requireDb, unwrap } from "@/lib/db";
import { usesFirestore } from "@/lib/data-backend";

/**
 * Counts for badges and dashboard figures, from whichever database the table
 * lives in (lib/data-backend.ts). Neither database sends the rows themselves.
 * The Firestore helpers are loaded only for a Firestore table, so a Supabase
 * build never downloads the Firebase SDK.
 */
export async function countRecords(table: string, statuses?: readonly string[]): Promise<number> {
  if (!usesFirestore(table)) return countRows(table, statuses);
  const { countByStatus } = await import("@/lib/firestore");
  return countByStatus(table, statuses);
}

/** The three columns stock status is derived from, for every inventory item. */
export async function loadStockLevels(): Promise<
  { on_hand: number; reorder_level: number; critical_level: number }[]
> {
  if (usesFirestore("inventory_items")) {
    const [{ orderBy }, { fetchAllRows }] = await Promise.all([
      import("firebase/firestore"),
      import("@/lib/firestore"),
    ]);
    const rows = await fetchAllRows("inventory_items", [orderBy("item_code")]);
    return rows.map((r) => ({
      on_hand: Number(r.on_hand),
      reorder_level: Number(r.reorder_level),
      critical_level: Number(r.critical_level),
    }));
  }
  return unwrap(
    await requireDb().from("inventory_items").select("on_hand, reorder_level, critical_level"),
  ) as { on_hand: number; reorder_level: number; critical_level: number }[];
}
