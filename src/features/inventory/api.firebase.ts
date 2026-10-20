import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
  writeBatch,
  type QueryConstraint,
  type Transaction,
} from "firebase/firestore";

import {
  fetchAllRows,
  firestore,
  friendlyFirebaseError,
  getRow,
  matchesSearch,
  updateRow,
  writerUid,
  type Row,
} from "@/lib/firestore";
import { removeAttachmentFile, uploadAttachmentInputs } from "@/lib/firebase-storage";
import { getConfigNumber, getConfigString } from "@/features/config/api.firebase";
import {
  exportInventoryCsv,
  itemCodePrefix,
  rowToEntry,
  rowToItem,
  stockThresholds,
  type ItemDraftInput,
  type StockDeduction,
} from "@/features/inventory/api.supabase";
import {
  stockStatusOf,
  type InventoryItem,
  type InventoryListFilters,
  type StockCardEntry,
  type StockTransactionType,
} from "@/features/inventory/types";

/**
 * Inventory service — Firestore-backed. Same signatures as api.supabase.ts.
 *
 * Every stock movement is one transaction: the item's balance, its history
 * and the stock-card line are written together or not at all, and the
 * balance is read inside the transaction, so two releases at the same moment
 * cannot both spend the same stock. (The Supabase version read, then wrote
 * each row separately.)
 *
 * Item codes are unique: each item claims its code in
 * unique_keys/inventory_items.item_code:{code} in the same transaction, and
 * firestore.rules refuse an item without its claim.
 */

export { exportInventoryCsv, itemCodePrefix, stockThresholds };

const TABLE = "inventory_items";
const LEDGER = "stock_card";
const DEFAULT_LOCATION = "GSO Stockroom A";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = (id: string) => `Inventory item not found: ${id}`;

const claimRef = (code: string) => doc(firestore(), "unique_keys", `inventory_items.item_code:${code}`);
const itemRef = (id: string) => doc(firestore(), TABLE, id);

function assertCodeShape(code: string) {
  if (!code || code.includes("/") || code.length > 60) {
    throw new Error(`Item code "${code}" cannot be used: up to 60 characters, no "/".`);
  }
}


/* ---------------- reading ---------------- */

function serverFilters(filters: InventoryListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.category) c.push(where("category", "==", filters.category));
  if (filters.supplierId) c.push(where("supplier_id", "==", filters.supplierId));
  if (filters.location) c.push(where("location", "==", filters.location));
  return c;
}

export async function listInventoryItems(filters: InventoryListFilters = {}): Promise<InventoryItem[]> {
  const rows = await fetchAllRows(TABLE, [...serverFilters(filters), orderBy("item_code", "asc")]);
  const from = filters.dateFrom ? new Date(filters.dateFrom).setHours(0, 0, 0, 0) : undefined;
  const to = filters.dateTo ? new Date(filters.dateTo).setHours(23, 59, 59, 999) : undefined;
  let items = rows
    .filter((r) => {
      const t = Date.parse(String(r.updated_at));
      return (
        (from === undefined || t >= from) &&
        (to === undefined || t <= to) &&
        matchesSearch(r, ["item_code", "name", "category", "location"], filters.search)
      );
    })
    .map(rowToItem);
  // Stock status derives from thresholds — filtered client-side.
  if (filters.stockStatus) items = items.filter((it) => stockStatusOf(it) === filters.stockStatus);
  return items;
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToItem(row) : null;
}

/** Next item code for a category, e.g. "OFF-0008", after the highest issued. */
export async function nextItemCode(category: string): Promise<string> {
  const prefix = itemCodePrefix(category);
  const snap = await getDocs(
    query(
      collection(firestore(), TABLE),
      where("item_code", ">=", `${prefix}-`),
      where("item_code", "<", `${prefix}-`),
      orderBy("item_code", "desc"),
      limit(1),
    ),
  );
  const last = snap.docs[0]?.get("item_code") as string | undefined;
  const seq = last ? Number(last.slice(prefix.length + 1)) || 0 : 0;
  return `${prefix}-${String(seq + 1).padStart(4, "0")}`;
}

/* ---------------- writing ---------------- */

export async function createInventoryItem(input: ItemDraftInput): Promise<InventoryItem> {
  const [reorderPercent, criticalPercent, defaultLocation] = await Promise.all([
    getConfigNumber("Inventory", "reorder_percent"),
    getConfigNumber("Inventory", "critical_percent"),
    getConfigString("Inventory", "default_stock_location"),
  ]);
  const thresholds = stockThresholds(input.beginningBalance, reorderPercent, criticalPercent);
  const typedCode = input.itemCode?.trim();
  if (typedCode) assertCodeShape(typedCode);
  // Uploaded once, before the code is final: a generated code may be retried.
  const attachments = (
    await uploadAttachmentInputs(input.attachments, typedCode || `upload-${uid()}`)
  ).map((a) => ({ ...a, id: uid(), uploadedAt: nowIso() }));

  // A generated code can be taken by someone saving at the same moment;
  // then the next one is tried. A typed code is the user's choice and is
  // reported instead.
  for (let attempt = 0; ; attempt++) {
    const itemCode = typedCode || (await nextItemCode(input.category));
    assertCodeShape(itemCode);
    const at = nowIso();
    const id = `inv-${Date.now()}`;
    const ledgerId = `stk-${uid()}`;
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
      created_by_uid: writerUid(),
      updated_by_uid: writerUid(),
    };
    try {
      await runTransaction(firestore(), async (tx) => {
        if ((await tx.get(claimRef(itemCode))).exists()) throw new Error(`CODE_TAKEN`);
        tx.set(itemRef(id), row);
        tx.set(claimRef(itemCode), { collection: TABLE, doc_id: id, created_at: at });
        tx.set(doc(firestore(), LEDGER, ledgerId), {
          created_by_uid: writerUid(),
          id: ledgerId,
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
        });
      });
      return rowToItem(row);
    } catch (e) {
      if (e instanceof Error && e.message === "CODE_TAKEN") {
        if (!typedCode && attempt < 3) continue;
        throw new Error(`Item code ${itemCode} is already used by another item.`);
      }
      throw friendlyFirebaseError(e);
    }
  }
}

export async function updateInventoryItem(
  id: string,
  input: Omit<ItemDraftInput, "beginningBalance">,
): Promise<InventoryItem> {
  const current = await getInventoryItem(id);
  if (!current) throw new Error(notFound(id));
  const itemCode = input.itemCode?.trim() || current.itemCode;
  assertCodeShape(itemCode);
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    itemCode,
  );
  const at = nowIso();
  try {
    return rowToItem(
      await runTransaction(firestore(), async (tx) => {
        const snap = await tx.get(itemRef(id));
        if (!snap.exists()) throw new Error(notFound(id));
        const r = { ...snap.data(), id } as Row;
        const codeChanges = itemCode !== r.item_code;
        if (codeChanges) {
          const claim = await tx.get(claimRef(itemCode));
          if (claim.exists() && claim.get("doc_id") !== id) {
            throw new Error(`Item code ${itemCode} is already used by another item.`);
          }
        }
        const patch = {
          item_code: itemCode,
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          unit: input.unit,
          location: input.location ?? r.location,
          supplier_id: input.supplierId ?? r.supplier_id ?? null,
          unit_price: input.unitPrice,
          attachments: [...(r.attachments ?? []), ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at }))],
          history: [...(r.history ?? []), { id: uid(), kind: "update", text: "Item details updated", at }],
          updated_at: at,
          updated_by_uid: writerUid(),
        };
        tx.update(itemRef(id), patch);
        if (codeChanges) {
          tx.set(claimRef(itemCode), { collection: TABLE, doc_id: id, created_at: at });
          if (r.item_code) tx.delete(claimRef(String(r.item_code)));
        }
        return { ...r, ...patch };
      }),
    );
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

export async function deleteInventoryItems(ids: string[]): Promise<void> {
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const rows = await Promise.all(chunk.map((id) => getRow(TABLE, id)));
      const batch = writeBatch(firestore());
      chunk.forEach((id, k) => {
        batch.delete(itemRef(id));
        const code = rows[k]?.item_code;
        if (code) batch.delete(claimRef(String(code)));
      });
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

export async function addInventoryComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<InventoryItem> {
  const at = nowIso();
  return rowToItem(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      comments: [...(r.comments ?? []), { id: uid(), createdAt: at, ...input }],
      history: [...(r.history ?? []), { id: uid(), kind: "comment", text: `${input.author} commented`, at }],
      updated_at: at,
    })),
  );
}

export async function removeInventoryAttachment(id: string, attachmentId: string): Promise<InventoryItem> {
  const current = await getInventoryItem(id);
  if (!current) throw new Error(notFound(id));
  const removed = current.attachments.find((a) => a.id === attachmentId);
  if (removed?.path) await removeAttachmentFile(removed.path);
  const at = nowIso();
  return rowToItem(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      attachments: (r.attachments ?? []).filter((a: { id: string }) => a.id !== attachmentId),
      history: [
        ...(r.history ?? []),
        { id: uid(), kind: "attachment", text: `Attachment removed${removed ? `: ${removed.name}` : ""}`, at },
      ],
      updated_at: at,
    })),
  );
}

/* ---------------- stock movements ---------------- */

/**
 * Deducts released quantities inside the caller's transaction and writes one
 * stock-card line per item. Validates the whole batch before writing; any
 * shortfall aborts the transaction with nothing changed. The RIS module calls
 * this inside its own release transaction, so the slip's status and the
 * stock move together.
 */
export async function deductStockInTransaction(
  tx: Transaction,
  deductions: StockDeduction[],
  context: { documentNumber: string; user: string },
): Promise<StockCardEntry[]> {
  const snaps = await Promise.all(deductions.map((d) => tx.get(itemRef(d.itemId))));
  const items = snaps.map((s, i) => {
    if (!s.exists()) throw new Error(`Inventory item not found: ${deductions[i].itemId}`);
    return rowToItem({ ...s.data(), id: s.id });
  });

  // Several lines may draw on one item; check what the slip takes in total.
  const wanted = new Map<string, number>();
  for (const d of deductions) wanted.set(d.itemId, (wanted.get(d.itemId) ?? 0) + d.quantity);
  for (const item of items) {
    const quantity = wanted.get(item.id) ?? 0;
    if (quantity > item.onHand) {
      throw new Error(`Insufficient stock for ${item.name}: requested ${quantity}, on hand ${item.onHand}`);
    }
  }

  const at = nowIso();
  const balances = new Map(items.map((it) => [it.id, it.onHand]));
  const histories = new Map(items.map((it) => [it.id, [...it.history]]));
  const entries: StockCardEntry[] = [];
  deductions.forEach((d, i) => {
    const item = items[i];
    const balance = balances.get(item.id)! - d.quantity;
    balances.set(item.id, balance);
    histories.get(item.id)!.push({
      id: uid(),
      kind: "update",
      text: `${context.documentNumber}: −${d.quantity} ${item.unit} released (balance ${balance})`,
      at,
    });
    const ledgerRow = {
      id: `stk-${uid()}`,
      date: at,
      document_number: context.documentNumber,
      type: "RIS Release" as StockTransactionType,
      item_id: item.id,
      item_name: item.name,
      quantity_in: 0,
      quantity_out: d.quantity,
      balance,
      user_name: context.user,
      created_by_uid: writerUid(),
    };
    tx.set(doc(firestore(), LEDGER, ledgerRow.id), ledgerRow);
    entries.push(rowToEntry(ledgerRow));
  });
  for (const [itemId, balance] of balances) {
    tx.update(itemRef(itemId), {
      on_hand: balance,
      updated_at: at,
      history: histories.get(itemId),
      updated_by_uid: writerUid(),
    });
  }
  return entries;
}

export async function deductStock(
  deductions: StockDeduction[],
  context: { documentNumber: string; user: string },
): Promise<StockCardEntry[]> {
  try {
    return await runTransaction(firestore(), (tx) => deductStockInTransaction(tx, deductions, context));
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
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
  try {
    return await runTransaction(firestore(), async (tx) => {
      const snap = await tx.get(itemRef(itemId));
      if (!snap.exists()) throw new Error(notFound(itemId));
      const item = rowToItem({ ...snap.data(), id: snap.id });
      if (item.onHand + input.quantity < 0) throw new Error(`Adjustment would drive ${item.name} below zero`);
      const at = nowIso();
      const balance = item.onHand + input.quantity;
      tx.update(itemRef(itemId), {
        on_hand: balance,
        updated_at: at,
        updated_by_uid: writerUid(),
        history: [
          ...item.history,
          {
            id: uid(),
            kind: "update",
            text: `${input.documentNumber}: ${input.quantity > 0 ? "+" : ""}${input.quantity} ${item.unit} (${input.type.toLowerCase()}, balance ${balance})`,
            at,
          },
        ],
      });
      const ledgerRow = {
        id: `stk-${uid()}`,
        date: at,
        document_number: input.documentNumber,
        type: input.type,
        item_id: item.id,
        item_name: item.name,
        quantity_in: input.quantity > 0 ? input.quantity : 0,
        quantity_out: input.quantity < 0 ? -input.quantity : 0,
        balance,
        remarks: input.remarks ?? null,
        user_name: input.user,
        created_by_uid: writerUid(),
      };
      tx.set(doc(firestore(), LEDGER, ledgerRow.id), ledgerRow);
      return rowToEntry(ledgerRow);
    });
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

export async function listStockCard(itemId?: string): Promise<StockCardEntry[]> {
  const rows = await fetchAllRows(LEDGER, [
    ...(itemId ? [where("item_id", "==", itemId)] : []),
    orderBy("date", "desc"),
  ]);
  return rows.map(rowToEntry);
}
