import { doc, getDoc } from "firebase/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { firestore } from "@/lib/firestore";
import { loadStockLevels } from "@/features/shared/record-counts";
import {
  adjustStock,
  createInventoryItem,
  deductStock,
  deleteInventoryItems,
  getInventoryItem,
  listInventoryItems,
  listStockCard,
  updateInventoryItem,
  type ItemDraftInput,
} from "@/features/inventory/api";

import { createTeam, resetEmulators, signInAs } from "./setup";

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
  it("issues item codes per category and opens a stock card with the opening balance", async () => {
    const a = await createInventoryItem(input());
    const b = await createInventoryItem(input({ name: "Ballpen, black" }));
    expect([a.itemCode, b.itemCode]).toEqual(["OFF-0001", "OFF-0002"]);
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
    });
    const item = await createInventoryItem(input());
    expect(item.reorderLevel).toBe(20);
  });

  it("never lets two items share a code", async () => {
    await createInventoryItem(input({ itemCode: "PAPER-1" }));
    await expect(createInventoryItem(input({ itemCode: "PAPER-1" }))).rejects.toThrow(/already used/);
    expect(await listInventoryItems()).toHaveLength(1);
  });

  it("moves the code's claim when the code changes, and frees it on delete", async () => {
    const item = await createInventoryItem(input({ itemCode: "PAPER-1" }));
    await updateInventoryItem(item.id, { ...input(), itemCode: "PAPER-2" });
    expect(await claimExists("PAPER-1")).toBe(false);
    expect(await claimExists("PAPER-2")).toBe(true);
    await deleteInventoryItems([item.id]);
    expect(await claimExists("PAPER-2")).toBe(false);
    await expect(createInventoryItem(input({ itemCode: "PAPER-2" }))).resolves.toBeTruthy();
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

  it("is closed to Department Users and Viewers for writing", async () => {
    await signInAs("dept@alaminos.gov.ph");
    await expect(createInventoryItem(input())).rejects.toThrow(/permission/);
    await signInAs("viewer@alaminos.gov.ph");
    expect(await listInventoryItems()).toEqual([]);
  });
});
