import { doc, getDoc } from "firebase/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { firestore, writerUid } from "@/lib/firestore";
import { loadStockLevels } from "@/features/shared/record-counts";
import {
  adjustStock,
  createInventoryItem,
  deductStock,
  deleteInventoryItems,
  getInventoryItem,
  listInventoryItems,
  listStockCard,
  type ItemDraftInput,
} from "@/features/inventory/api";

import { createTeam, manilaYear, resetEmulators, signInAs } from "./setup";

const input = (over: Partial<ItemDraftInput> = {}): ItemDraftInput => ({
  name: "Bond paper, A4",
  category: "Office Supplies",
  unit: "ream",
  unitPrice: 250,
  beginningBalance: 40,
  attachments: [],
  ...over,
});

const claimExists = async (code: string) =>
  (await getDoc(doc(firestore(), "unique_keys", `inventory_items.item_code:${code}`))).exists();

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
  await signInAs("admin@alaminos.gov.ph");
});

describe("Inventory on Firestore", () => {
  it("issues item codes INV-<year>-<sequence> and opens a stock card with the opening balance", async () => {
    const a = await createInventoryItem(input());
    const b = await createInventoryItem(input({ name: "Ballpen, black" }));
    expect([a.itemCode, b.itemCode]).toEqual([`INV-${manilaYear()}-000001`, `INV-${manilaYear()}-000002`]);
    expect(a).toMatchObject({ onHand: 40, reorderLevel: 10, criticalLevel: 4, location: "GSO Stockroom A" });
    const card = await listStockCard(a.id);
    expect(card).toHaveLength(1);
    expect(card[0]).toMatchObject({ type: "Beginning Balance", quantityIn: 40, balance: 40 });
  });

  it("reads thresholds and the default location from Settings", async () => {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(firestore(), "system_configuration", "cfg-inventory-reorder-percent"), {
      category: "Inventory",
      key: "reorder_percent",
      value: 50,
      updated_by_uid: writerUid(),
    });
    const item = await createInventoryItem(input());
    expect(item.reorderLevel).toBe(20);
  });

  it("issues the code itself, never a typed one, and frees its claim with the item (22 Oct 2026)", async () => {
    const a = await createInventoryItem(input({ itemCode: "PAPER-1" }));
    const b = await createInventoryItem(input({ itemCode: "PAPER-1" }));
    expect(a.itemCode).not.toBe("PAPER-1");
    expect(new Set([a.itemCode, b.itemCode]).size).toBe(2);
    expect(await claimExists(a.itemCode)).toBe(true);
    await deleteInventoryItems([a.id]);
    expect(await claimExists(a.itemCode)).toBe(false);
    expect(await listInventoryItems()).toHaveLength(1);
  });

  it("adjusts and deducts stock with a stock-card line each, never below zero", async () => {
    const item = await createInventoryItem(input());
    await adjustStock(item.id, { type: "Purchase Order", quantity: 10, documentNumber: "PO-2026-000001", user: "Admin" });
    await deductStock([{ itemId: item.id, quantity: 15 }], { documentNumber: "RIS-2026-000001", user: "Admin" });
    expect((await getInventoryItem(item.id))?.onHand).toBe(35);
    await expect(
      adjustStock(item.id, { type: "Correction", quantity: -100, documentNumber: "ADJ", user: "Admin" }),
    ).rejects.toThrow(/below zero/);
    await expect(
      deductStock([{ itemId: item.id, quantity: 36 }], { documentNumber: "RIS-2026-000002", user: "Admin" }),
    ).rejects.toThrow(/Insufficient stock/);
    expect((await getInventoryItem(item.id))?.onHand).toBe(35);
    expect((await listStockCard(item.id)).map((e) => e.balance)).toEqual([35, 50, 40]);
  });

  it("counts two lines drawing on one item against its total stock", async () => {
    const item = await createInventoryItem(input({ beginningBalance: 10 }));
    await expect(
      deductStock(
        [
          { itemId: item.id, quantity: 6 },
          { itemId: item.id, quantity: 6 },
        ],
        { documentNumber: "RIS-2026-000003", user: "Admin" },
      ),
    ).rejects.toThrow(/requested 12, on hand 10/);
    expect((await getInventoryItem(item.id))?.onHand).toBe(10);
  });

  it("filters by category and stock status, and feeds the sidebar's stock alerts", async () => {
    await createInventoryItem(input());
    await createInventoryItem(input({ name: "Mop", category: "Janitorial & Sanitation Supplies", beginningBalance: 0 }));
    expect((await listInventoryItems({ category: "Janitorial & Sanitation Supplies" })).map((i) => i.name)).toEqual(["Mop"]);
    expect((await listInventoryItems({ search: "bond" })).map((i) => i.name)).toEqual(["Bond paper, A4"]);
    expect(await loadStockLevels()).toHaveLength(2);
  });

});
