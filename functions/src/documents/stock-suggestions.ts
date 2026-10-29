import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";

import { PUBLIC_CALLABLE, callerOf, enforcePublicLimit } from "./caller.js";

/**
 * The stock list for the portal's RIS form — the Firestore counterpart of
 * portal_stock_suggestions (migration 050). Signed-out visitors cannot read
 * the register, so this returns only an item's ID, code, name, unit and
 * whether any is on hand.
 *
 * With no query it returns the whole list, A to Z (29 Oct 2026): the form
 * shows it as soon as the item field is clicked and narrows it as the
 * requester types, without another call. With a query it returns at most 8
 * matches, as the portal build before 29 Oct 2026 asks for them.
 *
 * Firestore cannot match the middle of a name, so the register's names are
 * read once and kept for a few minutes per function instance; typing in the
 * form does not re-read the whole register on every keystroke.
 */

interface StockName {
  id: string;
  code: string;
  name: string;
  unit: string;
  onHand: number;
}

// Short, so an item an Administrator has just saved is offered within half a minute.
const CACHE_MS = 30 * 1000;
let cache: { at: number; items: StockName[] } | null = null;

async function stockNames(): Promise<StockName[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const snap = await getFirestore().collection("inventory_items").select("item_code", "name", "unit", "on_hand").get();
  const items = snap.docs.map((d) => ({
    id: d.id,
    code: String(d.get("item_code") ?? ""),
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

// The item's ID and code link the requested line to the register (22 Oct
// 2026); the quantity on hand stays private, only whether there is any.
const forPortal = (i: StockName) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, in_stock: i.onHand > 0 });

/** A ceiling on one answer, far above the register's size. */
export const STOCK_LIST_MAX = 1000;

export function stockList(items: StockName[]) {
  return items
    .filter((i) => i.name.trim())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, STOCK_LIST_MAX)
    .map(forPortal);
}

export function suggest(items: StockName[], query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return items
    .filter((i) => i.name.toLowerCase().includes(q) || (!!i.code && i.code.toLowerCase().includes(q)))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 8)
    .map(forPortal);
}

export const portalStockSuggestions = onCall(PUBLIC_CALLABLE, async (request) => {
  const query = typeof request.data?.query === "string" ? request.data.query.slice(0, 100).trim() : "";
  if (query.length === 1) return [];
  if ((await callerOf(request)).kind === "public") await enforcePublicLimit(request, "suggest");
  const items = await stockNames();
  return query ? suggest(items, query) : stockList(items);
});
