import { beforeEach, describe, expect, it } from "vitest";

import { countRecords } from "@/features/shared/record-counts";
import { createInventoryItem, getInventoryItem, listStockCard } from "@/features/inventory/api";
import {
  addRequestComment,
  approveRequest,
  createRequest,
  getRequest,
  listRequests,
  listStock,
  setRequestStatus,
  updateRequest,
  type RISDraftInput,
} from "@/features/ris/api";

import { createTeam, manilaYear, resetEmulators, signInAs, signOutToPublic } from "./setup";

const input = (over: Partial<RISDraftInput> = {}): RISDraftInput => ({
  departmentCode: "MHO",
  requester: "Maria Santos",
  purpose: "Clinic supplies (test data)",
  receivedBy: "Maria Santos",
  items: [{ name: "Alcohol, 500 ml", unit: "bottle", requestedQty: 5, issuedQty: 0 }],
  attachments: [],
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

async function stockedItems() {
  await signInAs("admin@alaminos.gov.ph");
  const alcohol = await createInventoryItem({
    name: "Alcohol, 500 ml",
    category: "Medical & First Aid Supplies",
    unit: "bottle",
    unitPrice: 90,
    beginningBalance: 20,
    attachments: [],
  });
  const gloves = await createInventoryItem({
    name: "Gloves, latex",
    category: "Medical & First Aid Supplies",
    unit: "box",
    unitPrice: 300,
    beginningBalance: 3,
    attachments: [],
  });
  return { alcohol, gloves };
}

describe("RIS on Firestore", () => {
  it("the public portal files a slip from the stock list, always as submitted, and tracks it", async () => {
    const { alcohol, gloves } = await stockedItems();
    await signOutToPublic();
    const slip = await createRequest(
      input({
        items: [
          // As the portal's item picker fills a line (29 Oct 2026).
          { inventoryItemId: alcohol.id, stockNo: alcohol.itemCode, name: alcohol.name, unit: alcohol.unit, requestedQty: 5, issuedQty: 0 },
          // The register's name, unit and code win over whatever the browser sent.
          { inventoryItemId: gloves.id, name: "gloves", unit: "pc", requestedQty: 1, issuedQty: 0 },
        ],
      }),
      { asDraft: true },
    );
    expect(slip).toMatchObject({ risNumber: `RIS-${manilaYear()}-000001`, status: "Pending Approval" });
    expect(slip.items).toMatchObject([
      { inventoryItemId: alcohol.id, stockNo: alcohol.itemCode, name: "Alcohol, 500 ml", unit: "bottle", requestedQty: 5 },
      { inventoryItemId: gloves.id, stockNo: gloves.itemCode, name: "Gloves, latex", unit: "box", requestedQty: 1 },
    ]);
    expect(slip.history[0].text).toBe(`${slip.risNumber} created`);
    expect((await getRequest(slip.id))?.purpose).toBe(input().purpose);
  });

  it("the public portal cannot file an item that is not on the stock list (22 Oct 2026)", async () => {
    await signOutToPublic();
    await expect(createRequest(input())).rejects.toThrow("Choose each item from the GSO stock list.");
    await signInAs("admin@alaminos.gov.ph");
    expect(await countRecords("ris_requests", ["Pending Approval"])).toBe(0);
  });

  it("staff save drafts, edit, comment, list and count", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const draft = await createRequest(input(), { asDraft: true });
    expect(draft.status).toBe("Draft");
    await updateRequest(draft.id, input({ purpose: "Revised" }));
    await addRequestComment(draft.id, { author: "Dept", office: "MHO", text: "Urgent" });
    await setRequestStatus(draft.id, "Pending Approval", { by: "Dept" });
    expect((await listRequests({ search: "revised" })).map((r) => r.id)).toEqual([draft.id]);
    expect(await countRecords("ris_requests", ["Pending Approval"])).toBe(1);
  });

  it("approving issues the stock: deducts it and writes the stock card in the same step as the status", async () => {
    const { alcohol, gloves } = await stockedItems();
    const slip = await createRequest(
      input({
        items: [
          { inventoryItemId: alcohol.id, name: alcohol.name, unit: "bottle", requestedQty: 5, issuedQty: 5 },
          { inventoryItemId: gloves.id, name: gloves.name, unit: "box", requestedQty: 2, issuedQty: 2 },
        ],
      }),
    );
    // There is no separate Release step (22 Oct 2026).
    await expect(setRequestStatus(slip.id, "Released")).rejects.toThrow("Approving a slip issues its stock; use Approve.");
    const approved = await approveRequest(slip.id, { by: "GSO Head" });
    expect(approved.status).toBe("Approved");
    expect(approved.history.filter((h) => h.text.startsWith("Stock card:"))).toHaveLength(2);
    expect((await getInventoryItem(alcohol.id))?.onHand).toBe(15);
    expect((await getInventoryItem(gloves.id))?.onHand).toBe(1);
    expect((await listStockCard(gloves.id))[0]).toMatchObject({ type: "RIS Release", quantityOut: 2, user: "GSO Head" });
    // A second click or a retry never deducts twice.
    expect((await approveRequest(slip.id, { by: "GSO Head" })).status).toBe("Approved");
    expect((await getInventoryItem(alcohol.id))?.onHand).toBe(15);
    expect(await listStockCard(alcohol.id)).toHaveLength(2);
  });

  it("a shortfall or an unlinked line leaves the slip, the stock and the stock card untouched", async () => {
    const { alcohol, gloves } = await stockedItems();
    const short = await createRequest(
      input({
        items: [
          { inventoryItemId: alcohol.id, name: alcohol.name, unit: "bottle", requestedQty: 5, issuedQty: 5 },
          { inventoryItemId: gloves.id, name: gloves.name, unit: "box", requestedQty: 9, issuedQty: 9 },
        ],
      }),
    );
    await expect(approveRequest(short.id)).rejects.toThrow(/Not enough stock .* Gloves, latex: 9 needed, 3 on hand/);
    // Staff may type an item the register lacks, but it must be linked before approval.
    const unlinked = await createRequest(
      input({
        items: [
          { inventoryItemId: alcohol.id, name: alcohol.name, unit: "bottle", requestedQty: 5, issuedQty: 5 },
          { name: "Item not in the register", unit: "pc", requestedQty: 1, issuedQty: 1 },
        ],
      }),
    );
    await expect(approveRequest(unlinked.id)).rejects.toThrow(/Choose the inventory item for Item not in the register/);
    for (const slip of [short, unlinked]) expect((await getRequest(slip.id))?.status).toBe("Pending Approval");
    expect((await getInventoryItem(alcohol.id))?.onHand).toBe(20);
    expect((await getInventoryItem(gloves.id))?.onHand).toBe(3);
    expect(await listStockCard(alcohol.id)).toHaveLength(1);
  });

  it("lists the stock to the public portal with ID, code, name, unit and availability only", async () => {
    const { alcohol, gloves } = await stockedItems();
    await signOutToPublic();
    expect(await listStock()).toEqual([
      { id: alcohol.id, code: alcohol.itemCode, name: "Alcohol, 500 ml", unit: "bottle", inStock: true },
      { id: gloves.id, code: gloves.itemCode, name: "Gloves, latex", unit: "box", inStock: true },
    ]);
  });
});
