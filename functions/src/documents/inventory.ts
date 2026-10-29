import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import { callerOf, requireRole } from "./caller.js";

/**
 * Registering inventory items (22 Oct 2026): one function for both the Add
 * Item form and Scan / Import, so every item gets its code the same way.
 *
 * - The item code is INV-<year>-<sequence> from the shared document counter
 *   (numbering.ts), allocated in the item's own transaction and claimed in
 *   unique_keys/inventory_items.item_code:{code}. It is never typed, never
 *   changed (firestore.rules keep item_code) and never handed out again.
 * - Opening stock is written with the item as one "Beginning Balance"
 *   stock-card line. An import may instead add received stock to an existing
 *   item, as a stock-card line of its own; nothing else changes stock here.
 * - A new category is saved in inventory_categories, matched without regard
 *   to capitals or extra spaces, so it is offered next time.
 * - Retry-safe: each row's documents are named after the request ID and the
 *   row's key, so a repeated call (double click, retry after a dropped
 *   connection) finds the row already saved and returns it unchanged.
 * - Each row is its own transaction, so a failure is reported per row and
 *   never leaves half an item; the result says which rows were saved.
 */

/** The office's standard categories (src/features/inventory/types.ts ITEM_CATEGORIES). */
export const STANDARD_CATEGORIES = [
  "Office Supplies",
  "ICT Supplies & Equipment",
  "Janitorial & Sanitation Supplies",
  "Electrical Supplies",
  "Plumbing Supplies",
  "Construction Materials",
  "Hardware Supplies",
  "Paint & Finishing Materials",
  "Vehicle Parts & Accessories",
  "Fuel & Lubricants",
  "PPE / Safety Equipment",
  "Medical & First Aid Supplies",
  "Furniture & Fixtures",
  "Appliances",
  "Facility Maintenance Supplies",
  "Sports & Recreation Equipment",
  "Disaster Response Supplies",
  "Garden & Landscaping Supplies",
  "Printing Supplies",
  "Miscellaneous Supplies",
];

const MAX_ROWS = 200;
const DEFAULT_LOCATION = "GSO Stockroom A";

/** Readable form of a typed name: trimmed, single spaces. */
export const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
/** Category identity: the same words, whatever the capitals or spacing. */
export const categoryKey = (name: string) => tidy(name).toLowerCase();
/** Document ID for a custom category (Firestore IDs cannot hold "/"). */
export const categoryDocId = (name: string) => categoryKey(name).replaceAll("/", "%2F");

export interface ItemRowInput {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  reorderLevel?: number | null;
  criticalLevel?: number | null;
  /** Import only: add `quantity` as stock received to this existing item instead of creating one. */
  addToItemId?: string | null;
  /**
   * The row's own key within the request (the review screen's row ID), so a
   * retry after rows were removed still matches each row to what it saved.
   * Defaults to the row's position.
   */
  key?: string;
}

export interface RowResult {
  index: number;
  ok: boolean;
  action?: "created" | "added-stock";
  /** True when this row had already been saved by an earlier attempt of the same request. */
  already?: boolean;
  id?: string;
  code?: string;
  name: string;
  error?: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** Validates one row; returns the cleaned row or a reason it cannot be saved. */
export function cleanRow(raw: unknown, basis: "opening" | "catalog"): ItemRowInput | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? tidy(r.name) : "";
  const category = typeof r.category === "string" ? tidy(r.category) : "";
  const unit = typeof r.unit === "string" ? tidy(r.unit) : "";
  const quantity = num(r.quantity);
  const unitPrice = num(r.unitPrice);
  const level = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));
  const reorderLevel = level(r.reorderLevel);
  const criticalLevel = level(r.criticalLevel);
  const addToItemId = typeof r.addToItemId === "string" && r.addToItemId ? r.addToItemId : null;

  if (!name) return "The item name is missing.";
  if (name.length > 200) return "The item name is longer than 200 characters.";
  if (!addToItemId && !category) return "The category is missing.";
  if (category.length > 100) return "The category is longer than 100 characters.";
  if (!addToItemId && !unit) return "The unit of measure is missing.";
  if (unit.length > 30) return "The unit is longer than 30 characters.";
  if (Number.isNaN(quantity) || quantity < 0) return "The quantity must be zero or more.";
  // Adding received stock leaves the existing item's price as it is.
  if (!addToItemId && (Number.isNaN(unitPrice) || unitPrice < 0)) return "The unit price must be zero or more.";
  if (reorderLevel !== null && (Number.isNaN(reorderLevel) || reorderLevel < 0)) return "The reorder level must be zero or more.";
  if (criticalLevel !== null && (Number.isNaN(criticalLevel) || criticalLevel < 0)) return "The critical level must be zero or more.";
  if (reorderLevel !== null && criticalLevel !== null && criticalLevel > reorderLevel) {
    return "The critical level cannot be above the reorder level.";
  }
  if (addToItemId) {
    if (basis !== "opening") return "Ordered or requested quantities are not stock; they cannot be added to an item.";
    if (!(quantity > 0)) return "Enter the quantity received to add to the existing item.";
  }
  return {
    name,
    category,
    unit,
    // A PR or PO lists what was ordered, not what is on the shelf.
    quantity: basis === "catalog" && !addToItemId ? 0 : quantity,
    unitPrice: addToItemId ? 0 : Math.round(unitPrice * 100) / 100,
    reorderLevel,
    criticalLevel,
    addToItemId,
  };
}

/** Reorder and critical levels a new item starts with when none were typed (as the app did before). */
export function defaultThresholds(quantity: number, reorderPercent: number, criticalPercent: number) {
  if (quantity <= 0) return { reorderLevel: 0, criticalLevel: 0 };
  const share = (p: number, fallback: number) => (Number.isFinite(p) && p > 0 && p <= 100 ? p / 100 : fallback);
  return {
    reorderLevel: Math.max(1, Math.round(quantity * share(reorderPercent, 0.25))),
    criticalLevel: Math.max(1, Math.round(quantity * share(criticalPercent, 0.1))),
  };
}

async function inventorySettings() {
  const db = getFirestore();
  const read = async (key: string) =>
    (await db.collection("system_configuration").doc(`cfg-inventory-${key.replace(/_/g, "-")}`).get()).get("value");
  const [reorder, critical, location] = await Promise.all([
    read("reorder_percent"),
    read("critical_percent"),
    read("default_stock_location"),
  ]);
  return {
    reorderPercent: Number(reorder ?? 25),
    criticalPercent: Number(critical ?? 10),
    location: typeof location === "string" && location.trim() ? location.trim() : DEFAULT_LOCATION,
  };
}

/**
 * Reads the category inside the transaction and returns the name to file the
 * item under — the standard or saved spelling when it already exists — and,
 * for a new one, the document to create.
 */
async function resolveCategory(tx: Transaction, typed: string) {
  const standard = STANDARD_CATEGORIES.find((c) => categoryKey(c) === categoryKey(typed));
  if (standard) return { name: standard, create: null };
  const ref = getFirestore().collection("inventory_categories").doc(categoryDocId(typed));
  const snap = await tx.get(ref);
  if (snap.exists) return { name: String(snap.get("name") ?? typed), create: null };
  return { name: tidy(typed), create: ref };
}

export const createInventoryItems = onCall({ timeoutSeconds: 300 }, async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "register inventory items");
  if (caller.kind !== "staff") throw new HttpsError("permission-denied", "Sign in first.");

  const data = (request.data ?? {}) as Record<string, unknown>;
  const requestId = typeof data.requestId === "string" ? data.requestId : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) throw new HttpsError("invalid-argument", "A request ID is required.");
  const source = data.source === "import" ? "import" : "manual";
  const basis = data.basis === "catalog" ? "catalog" : "opening";
  if (source === "import" && data.basis !== "opening" && data.basis !== "catalog") {
    throw new HttpsError("invalid-argument", "Say whether the document shows stock on hand or only ordered items.");
  }
  const sourceName = typeof data.sourceName === "string" ? tidy(data.sourceName).slice(0, 120) : "";
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length === 0) throw new HttpsError("invalid-argument", "There are no items to save.");
  if (rows.length > MAX_ROWS) throw new HttpsError("invalid-argument", `Save at most ${MAX_ROWS} items at a time.`);

  const db = getFirestore();
  const [settings, numbering] = await Promise.all([inventorySettings(), readNumberingSettings()]);
  const results: RowResult[] = [];

  for (let index = 0; index < rows.length; index++) {
    const cleaned = cleanRow(rows[index], basis);
    const label = typeof (rows[index] as { name?: unknown })?.name === "string" ? tidy((rows[index] as { name: string }).name) : "";
    if (typeof cleaned === "string") {
      results.push({ index, ok: false, name: label || `Row ${index + 1}`, error: cleaned });
      continue;
    }
    const rawKey = (rows[index] as { key?: unknown })?.key;
    const key = typeof rawKey === "string" && /^[A-Za-z0-9-]{1,40}$/.test(rawKey) ? rawKey : String(index);
    const itemId = `inv-${requestId}-${key}`;
    const ledgerId = `stk-${requestId}-${key}`;
    try {
      const result = await db.runTransaction(async (tx): Promise<RowResult> => {
        const at = new Date().toISOString();
        const ledgerRef = db.collection("stock_card").doc(ledgerId);

        if (cleaned.addToItemId) {
          // Stock received for an item already on the register.
          const ledger = await tx.get(ledgerRef);
          const itemRef = db.collection("inventory_items").doc(cleaned.addToItemId);
          const item = await tx.get(itemRef);
          if (ledger.exists) {
            return { index, ok: true, action: "added-stock", already: true, id: item.id, code: String(item.get("item_code") ?? ""), name: cleaned.name };
          }
          if (!item.exists) throw new HttpsError("not-found", "The existing item was not found.");
          const balance = Number(item.get("on_hand") ?? 0) + cleaned.quantity;
          const code = String(item.get("item_code") ?? "");
          const unit = String(item.get("unit") ?? "");
          const text = `Stock received: +${cleaned.quantity} ${unit} (balance ${balance})${sourceName ? `, imported from ${sourceName}` : ""}`;
          tx.update(itemRef, {
            on_hand: balance,
            history: [...((item.get("history") as unknown[]) ?? []), { id: ledgerId, kind: "update", text, at }],
            updated_at: at,
            updated_by_uid: caller.uid,
          });
          tx.create(ledgerRef, {
            id: ledgerId,
            date: at,
            document_number: "IMPORT",
            type: "Manual Adjustment",
            item_id: item.id,
            item_name: String(item.get("name") ?? cleaned.name),
            quantity_in: cleaned.quantity,
            quantity_out: 0,
            balance,
            remarks: `Stock received${sourceName ? ` — imported from ${sourceName}` : ""}`,
            user_name: caller.email || "Administrator",
            created_by_uid: caller.uid,
          });
          return { index, ok: true, action: "added-stock", id: item.id, code, name: cleaned.name };
        }

        // A new item. All reads first (item, category, counter, claims), then the writes.
        const itemRef = db.collection("inventory_items").doc(itemId);
        const existing = await tx.get(itemRef);
        if (existing.exists) {
          return { index, ok: true, action: "created", already: true, id: itemId, code: String(existing.get("item_code") ?? ""), name: cleaned.name };
        }
        const category = await resolveCategory(tx, cleaned.category);
        const claim = (code: string) => db.collection("unique_keys").doc(`inventory_items.item_code:${code}`);
        const code = await allocateDocumentNumber(tx, "INV", manilaYear(new Date()), numbering, async (n) => (await tx.get(claim(n))).exists);

        const auto = defaultThresholds(cleaned.quantity, settings.reorderPercent, settings.criticalPercent);
        const reorderLevel = cleaned.reorderLevel ?? auto.reorderLevel;
        const criticalLevel = cleaned.criticalLevel ?? Math.min(auto.criticalLevel, reorderLevel);
        const how = source === "import" ? `imported${sourceName ? ` from ${sourceName}` : ""}` : "registered";

        if (category.create) {
          tx.create(category.create, { id: category.create.id, name: category.name, created_at: at, created_by_uid: caller.uid });
        }
        tx.create(itemRef, {
          id: itemId,
          item_code: code,
          name: cleaned.name,
          category: category.name,
          description: null,
          unit: cleaned.unit,
          location: settings.location,
          on_hand: cleaned.quantity,
          reorder_level: reorderLevel,
          critical_level: criticalLevel,
          supplier_id: null,
          unit_price: cleaned.unitPrice,
          attachments: [],
          comments: [],
          history: [{ id: `${itemId}-create`, kind: "create", text: `${code} ${how} with ${cleaned.quantity} ${cleaned.unit} on hand`, at }],
          created_at: at,
          updated_at: at,
          created_by_uid: caller.uid,
          updated_by_uid: caller.uid,
        });
        tx.create(claim(code), { collection: "inventory_items", doc_id: itemId, created_at: at });
        tx.create(ledgerRef, {
          id: ledgerId,
          date: at,
          document_number: code,
          type: "Beginning Balance",
          item_id: itemId,
          item_name: cleaned.name,
          quantity_in: cleaned.quantity,
          quantity_out: 0,
          balance: cleaned.quantity,
          remarks: source === "import" ? `Opening stock, ${how}` : "Item registered with opening stock",
          user_name: caller.email || "Administrator",
          created_by_uid: caller.uid,
        });
        return { index, ok: true, action: "created", id: itemId, code, name: cleaned.name };
      });
      results.push(result);
    } catch (e) {
      results.push({ index, ok: false, name: cleaned.name, error: e instanceof Error ? e.message : "Could not be saved." });
    }
  }
  return { results };
});

/**
 * Add Stocks (24 Oct 2026): received quantity for an item already on the
 * register. In one transaction the item's balance goes up and a "Stock
 * Receipt" line is written to its stock card with the date, the reference
 * (when given), the quantity received and the balance after. The item's
 * code, name, category and unit are not touched.
 *
 * Retry-safe: the stock-card line is named after the request ID, so a double
 * click or a retried call finds it already written and adds nothing.
 * Administrators only.
 */
export const addInventoryStock = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "add stock");
  if (caller.kind !== "staff") throw new HttpsError("permission-denied", "Sign in first.");

  const data = (request.data ?? {}) as Record<string, unknown>;
  const requestId = typeof data.requestId === "string" ? data.requestId : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) throw new HttpsError("invalid-argument", "A request ID is required.");
  const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
  if (!itemId || itemId.includes("/") || itemId.length > 100) throw new HttpsError("invalid-argument", "Choose the item.");
  const quantity = typeof data.quantity === "number" && Number.isFinite(data.quantity) ? data.quantity : NaN;
  if (!(quantity > 0) || quantity > 1_000_000_000) throw new HttpsError("invalid-argument", "Enter a quantity greater than 0.");
  const reference = typeof data.reference === "string" ? tidy(data.reference).slice(0, 60) : "";

  const db = getFirestore();
  const itemRef = db.collection("inventory_items").doc(itemId);
  const ledgerRef = db.collection("stock_card").doc(`stk-add-${requestId}`);

  return db.runTransaction(async (tx) => {
    const [ledger, item] = await Promise.all([tx.get(ledgerRef), tx.get(itemRef)]);
    if (ledger.exists) {
      return { already: true, itemId, onHand: Number(item.get("on_hand") ?? 0), balance: Number(ledger.get("balance") ?? 0) };
    }
    if (!item.exists) throw new HttpsError("not-found", "That item is no longer on the register.");
    const at = new Date().toISOString();
    const balance = Number(item.get("on_hand") ?? 0) + quantity;
    const unit = String(item.get("unit") ?? "");
    tx.create(ledgerRef, {
      id: ledgerRef.id,
      date: at,
      document_number: reference,
      type: "Stock Receipt",
      item_id: itemId,
      item_name: String(item.get("name") ?? ""),
      quantity_in: quantity,
      quantity_out: 0,
      balance,
      remarks: "Stock added",
      user_name: caller.email || "Administrator",
      created_by_uid: caller.uid,
    });
    tx.update(itemRef, {
      on_hand: balance,
      history: [
        ...((item.get("history") as unknown[]) ?? []),
        { id: ledgerRef.id, kind: "update", text: `+${quantity} ${unit} received${reference ? ` (${reference})` : ""} (balance ${balance})`, at },
      ],
      updated_at: at,
      updated_by_uid: caller.uid,
    });
    return { already: false, itemId, onHand: balance, balance };
  });
});
