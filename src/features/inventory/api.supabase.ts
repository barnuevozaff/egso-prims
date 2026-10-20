import { fetchAll, isoDate, requireDb, searchOr, unwrap } from "@/lib/db";
import { uploadAttachmentInputs } from "@/lib/storage";
import { getConfigNumber, getConfigString } from "@/features/config/api";
import {
  itemValue,
  stockStatusOf,
  type InventoryItem,
  type InventoryListFilters,
  type StockCardEntry,
  type StockTransactionType,
} from "@/features/inventory/types";
import { supplierById } from "@/features/purchase-orders/types";
import type { AttachmentInput } from "@/features/shared/attachment-list";

/**
 * Inventory service — Supabase-backed. All stock movements flow through this
 * service so the stock card ledger stays complete; the RIS module calls
 * deductStock() on release.
 */

const TABLE = "inventory_items";
/** Where stock lands unless the office records otherwise. */
const DEFAULT_LOCATION = "GSO Stockroom A";

/**
 * Stock thresholds, derived from the quantity being stocked rather than typed.
 *
 * A share of the stocking level is the point to reorder, a smaller share the
 * point it is critical — proportions that hold whatever the item is, from a
 * handful of printers to hundreds of sacks of cement. They are set from the
 * quantity received so they describe a normal stocking level, and deliberately
 * not recomputed as stock is issued: a threshold that fell with the balance
 * would never be crossed.
 *
 * The two shares are the office's to set, in Settings → Inventory. The
 * defaults here are the values the module used before that setting existed,
 * and are what a caller gets if configuration cannot be read.
 */
export function stockThresholds(
  quantity: number,
  reorderPercent = 25,
  criticalPercent = 10,
): {
  reorderLevel: number;
  criticalLevel: number;
} {
  if (quantity <= 0) return { reorderLevel: 0, criticalLevel: 0 };
  const share = (percent: number, fallback: number) =>
    Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent / 100 : fallback;
  return {
    reorderLevel: Math.max(1, Math.round(quantity * share(reorderPercent, 0.25))),
    criticalLevel: Math.max(1, Math.round(quantity * share(criticalPercent, 0.1))),
  };
}
const LEDGER = "stock_card";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToItem(r: any): InventoryItem {
  return {
    id: r.id,
    itemCode: r.item_code,
    name: r.name,
    category: r.category,
    description: r.description ?? undefined,
    unit: r.unit,
    location: r.location,
    onHand: r.on_hand,
    reorderLevel: r.reorder_level,
    criticalLevel: r.critical_level,
    supplierId: r.supplier_id ?? undefined,
    unitPrice: Number(r.unit_price),
    attachments: r.attachments ?? [],
    comments: r.comments ?? [],
    history: r.history ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToEntry(r: any): StockCardEntry {
  return {
    id: r.id,
    date: r.date,
    documentNumber: r.document_number,
    type: r.type,
    itemId: r.item_id,
    itemName: r.item_name,
    quantityIn: r.quantity_in,
    quantityOut: r.quantity_out,
    balance: r.balance,
    remarks: r.remarks ?? undefined,
    user: r.user_name,
  };
}

export async function listInventoryItems(
  filters: InventoryListFilters = {},
): Promise<InventoryItem[]> {
  const db = requireDb();
  let q = db.from(TABLE).select("*").order("item_code", { ascending: true });
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.supplierId) q = q.eq("supplier_id", filters.supplierId);
  if (filters.location) q = q.eq("location", filters.location);
  if (filters.dateFrom) q = q.gte("updated_at", isoDate(filters.dateFrom));
  if (filters.dateTo) q = q.lte("updated_at", isoDate(filters.dateTo, true));
  if (filters.search?.trim()) {
    q = q.or(searchOr(["item_code", "name", "category", "location"], filters.search));
  }
  let items = (await fetchAll((from, to) => q.range(from, to))).map(rowToItem);
  // Stock status derives from thresholds — filtered client-side.
  if (filters.stockStatus) {
    items = items.filter((it) => stockStatusOf(it) === filters.stockStatus);
  }
  return items;
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToItem(data) : null;
}

export interface ItemDraftInput {
  /** Omit to have the next code for the category issued automatically. */
  itemCode?: string;
  name: string;
  category: InventoryItem["category"];
  description?: string;
  unit: string;
  /** Defaults to the office's main stockroom when not supplied. */
  location?: string;
  supplierId?: string;
  unitPrice: number;
  /** Units being stocked. Also sets the reorder and critical thresholds. */
  beginningBalance: number;
  attachments: AttachmentInput[];
}

/**
 * Next item code for a category, e.g. "OFF-0008".
 *
 * The prefix is the category's first three letters, so a category added by
 * the office needs no lookup table; the sequence continues from the highest
 * code already issued under that prefix.
 */
export function itemCodePrefix(category: string): string {
  const letters = category.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "GEN").padEnd(3, "X");
}

export async function nextItemCode(category: string): Promise<string> {
  const db = requireDb();
  const prefix = itemCodePrefix(category);
  const { data } = await db
    .from(TABLE)
    .select("item_code")
    .like("item_code", `${prefix}-%`)
    .order("item_code", { ascending: false })
    .limit(1);
  const last = data?.[0]?.item_code as string | undefined;
  const seq = last ? Number(last.slice(prefix.length + 1)) || 0 : 0;
  return `${prefix}-${String(seq + 1).padStart(4, "0")}`;
}

export async function createInventoryItem(input: ItemDraftInput): Promise<InventoryItem> {
  const db = requireDb();
  const at = nowIso();
  const id = `inv-${Date.now()}`;
  const itemCode = input.itemCode?.trim() || (await nextItemCode(input.category));
  // Read at the moment of stocking, so an item keeps the thresholds that were
  // in force when it was received rather than shifting under a later change.
  const [reorderPercent, criticalPercent, defaultLocation] = await Promise.all([
    getConfigNumber("Inventory", "reorder_percent"),
    getConfigNumber("Inventory", "critical_percent"),
    getConfigString("Inventory", "default_stock_location"),
  ]);
  const thresholds = stockThresholds(input.beginningBalance, reorderPercent, criticalPercent);
  const attachments = (await uploadAttachmentInputs(input.attachments, itemCode)).map(
    (a) => ({ ...a, id: uid(), uploadedAt: at }),
  );
  const row = {
    id,
    item_code: itemCode,
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    unit: input.unit,
    location: input.location ?? (defaultLocation || DEFAULT_LOCATION),
    on_hand: input.beginningBalance,
    reorder_level: thresholds.reorderLevel,
    critical_level: thresholds.criticalLevel,
    supplier_id: input.supplierId ?? null,
    unit_price: input.unitPrice,
    attachments,
    comments: [],
    history: [{ id: uid(), kind: "create", text: `${itemCode} added to inventory`, at }],
    created_at: at,
    updated_at: at,
  };
  const item = rowToItem(unwrap(await db.from(TABLE).insert(row).select().single()));
  unwrap(
    await db.from(LEDGER).insert({
      id: `stk-${uid()}`,
      date: at,
      document_number: "NEW-ITEM",
      type: "Beginning Balance",
      item_id: id,
      item_name: input.name,
      quantity_in: input.beginningBalance,
      quantity_out: 0,
      balance: input.beginningBalance,
      remarks: "Item registered with opening stock",
      user_name: "Administrator",
    }),
  );
  return item;
}

export async function updateInventoryItem(
  id: string,
  input: Omit<ItemDraftInput, "beginningBalance">,
): Promise<InventoryItem> {
  const db = requireDb();
  const current = await getInventoryItem(id);
  if (!current) throw new Error(`Inventory item not found: ${id}`);
  const at = nowIso();
  const itemCode = input.itemCode?.trim() || current.itemCode;
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    itemCode,
  );
  const row = {
    item_code: itemCode,
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    unit: input.unit,
    location: input.location ?? current.location,
    supplier_id: input.supplierId ?? current.supplierId ?? null,
    unit_price: input.unitPrice,
    attachments: [
      ...current.attachments,
      ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at })),
    ],
    history: [...current.history, { id: uid(), kind: "update", text: "Item details updated", at }],
    updated_at: at,
  };
  return rowToItem(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function deleteInventoryItems(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

export async function addInventoryComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<InventoryItem> {
  const db = requireDb();
  const current = await getInventoryItem(id);
  if (!current) throw new Error(`Inventory item not found: ${id}`);
  const at = nowIso();
  const row = {
    comments: [...current.comments, { id: uid(), createdAt: at, ...input }],
    history: [
      ...current.history,
      { id: uid(), kind: "comment", text: `${input.author} commented`, at },
    ],
    updated_at: at,
  };
  return rowToItem(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function removeInventoryAttachment(
  id: string,
  attachmentId: string,
): Promise<InventoryItem> {
  const db = requireDb();
  const current = await getInventoryItem(id);
  if (!current) throw new Error(`Inventory item not found: ${id}`);
  const removed = current.attachments.find((a) => a.id === attachmentId);
  const at = nowIso();
  if (removed?.path) {
    await db.storage.from("attachments").remove([removed.path]);
  }
  const row = {
    attachments: current.attachments.filter((a) => a.id !== attachmentId),
    history: [
      ...current.history,
      {
        id: uid(),
        kind: "attachment",
        text: `Attachment removed${removed ? `: ${removed.name}` : ""}`,
        at,
      },
    ],
    updated_at: at,
  };
  return rowToItem(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export interface StockDeduction {
  itemId: string;
  quantity: number;
}

/**
 * Deducts released quantities and writes one stock-card transaction per item
 * (called by the RIS module on release). Validates the whole batch first.
 */
export async function deductStock(
  deductions: StockDeduction[],
  context: { documentNumber: string; user: string },
): Promise<StockCardEntry[]> {
  const db = requireDb();
  const ids = deductions.map((d) => d.itemId);
  const items = unwrap(await db.from(TABLE).select("*").in("id", ids)).map(rowToItem);

  for (const d of deductions) {
    const item = items.find((i) => i.id === d.itemId);
    if (!item) throw new Error(`Inventory item not found: ${d.itemId}`);
    if (d.quantity > item.onHand) {
      throw new Error(
        `Insufficient stock for ${item.name}: requested ${d.quantity}, on hand ${item.onHand}`,
      );
    }
  }

  const at = nowIso();
  const entries: StockCardEntry[] = [];
  for (const d of deductions) {
    const item = items.find((i) => i.id === d.itemId)!;
    const newBalance = item.onHand - d.quantity;
    unwrap(
      await db
        .from(TABLE)
        .update({
          on_hand: newBalance,
          updated_at: at,
          history: [
            ...item.history,
            {
              id: uid(),
              kind: "update",
              text: `${context.documentNumber}: −${d.quantity} ${item.unit} released (balance ${newBalance})`,
              at,
            },
          ],
        })
        .eq("id", item.id),
    );
    const ledgerRow = {
      id: `stk-${uid()}`,
      date: at,
      document_number: context.documentNumber,
      type: "RIS Release" as StockTransactionType,
      item_id: item.id,
      item_name: item.name,
      quantity_in: 0,
      quantity_out: d.quantity,
      balance: newBalance,
      user_name: context.user,
    };
    unwrap(await db.from(LEDGER).insert(ledgerRow));
    entries.push(rowToEntry(ledgerRow));
  }
  return entries;
}

/** Signed stock adjustment (PO delivery, return, correction) with ledger entry. */
export async function adjustStock(
  itemId: string,
  input: {
    type: Extract<StockTransactionType, "Purchase Order" | "Manual Adjustment" | "Return" | "Correction">;
    quantity: number;
    documentNumber: string;
    remarks?: string;
    user: string;
  },
): Promise<StockCardEntry> {
  const db = requireDb();
  const item = await getInventoryItem(itemId);
  if (!item) throw new Error(`Inventory item not found: ${itemId}`);
  if (item.onHand + input.quantity < 0) {
    throw new Error(`Adjustment would drive ${item.name} below zero`);
  }
  const at = nowIso();
  const newBalance = item.onHand + input.quantity;
  unwrap(
    await db
      .from(TABLE)
      .update({
        on_hand: newBalance,
        updated_at: at,
        history: [
          ...item.history,
          {
            id: uid(),
            kind: "update",
            text: `${input.documentNumber}: ${input.quantity > 0 ? "+" : ""}${input.quantity} ${item.unit} (${input.type.toLowerCase()}, balance ${newBalance})`,
            at,
          },
        ],
      })
      .eq("id", itemId),
  );
  const ledgerRow = {
    id: `stk-${uid()}`,
    date: at,
    document_number: input.documentNumber,
    type: input.type,
    item_id: item.id,
    item_name: item.name,
    quantity_in: input.quantity > 0 ? input.quantity : 0,
    quantity_out: input.quantity < 0 ? -input.quantity : 0,
    balance: newBalance,
    remarks: input.remarks ?? null,
    user_name: input.user,
  };
  unwrap(await db.from(LEDGER).insert(ledgerRow));
  return rowToEntry(ledgerRow);
}

export async function listStockCard(itemId?: string): Promise<StockCardEntry[]> {
  const db = requireDb();
  let q = db.from(LEDGER).select("*").order("date", { ascending: false });
  if (itemId) q = q.eq("item_id", itemId);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToEntry);
}

export function exportInventoryCsv(rows: InventoryItem[]): string {
  const header = ["Item Code", "Name", "Category", "Unit", "On Hand", "Unit Price", "Total Value", "Supplier", "Status", "Location"];
  const lines = rows.map((it) =>
    [
      it.itemCode,
      `"${it.name}"`,
      it.category,
      it.unit,
      it.onHand,
      it.unitPrice,
      itemValue(it),
      `"${supplierById(it.supplierId)?.name ?? ""}"`,
      stockStatusOf(it),
      `"${it.location}"`,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
