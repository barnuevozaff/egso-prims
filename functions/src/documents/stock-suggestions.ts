import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";

import { PUBLIC_CALLABLE, callerOf, enforcePublicLimit } from "./caller.js";

/**
 * Stock suggestions for the portal's RIS form — the Firestore counterpart of
 * portal_stock_suggestions (migration 050). Signed-out visitors cannot read
 * the register, so this returns only an item's name, unit and whether any is
 * on hand, for at most 8 items whose name contains the query, names that
 * start with it first.
 *
 * Firestore cannot match the middle of a name, so the register's names are
 * read once and kept for a few minutes per function instance; typing in the
 * form does not re-read the whole register on every keystroke.
 */

interface StockName {
  name: string;
  unit: string;
  onHand: number;
}

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; items: StockName[] } | null = null;

async function stockNames(): Promise<StockName[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const snap = await getFirestore().collection("inventory_items").select("name", "unit", "on_hand").get();
  const items = snap.docs.map((d) => ({
    name: String(d.get("name") ?? ""),
    unit: String(d.get("unit") ?? ""),
    onHand: Number(d.get("on_hand") ?? 0),
  }));
  cache = { at: Date.now(), items };
  return items;
}

/** For tests: forget the cached register. */
export const resetStockSuggestionCache = () => {
  cache = null;
};

export function suggest(items: StockName[], query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return items
    .filter((i) => i.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 8)
    .map((i) => ({ name: i.name, unit: i.unit, in_stock: i.onHand > 0 }));
}

export const portalStockSuggestions = onCall(PUBLIC_CALLABLE, async (request) => {
  const query = typeof request.data?.query === "string" ? request.data.query.slice(0, 100) : "";
  if (query.trim().length < 2) return [];
  if (callerOf(request).kind === "public") await enforcePublicLimit(request, "suggest");
  return suggest(await stockNames(), query);
});
