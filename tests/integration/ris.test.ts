import { beforeEach, describe, expect, it } from "vitest";

import { countRecords } from "@/features/shared/record-counts";
import { createInventoryItem, getInventoryItem, listStockCard } from "@/features/inventory/api";
import {
  addRequestComment,
  createRequest,
  getRequest,
  listRequests,
  setRequestStatus,
  suggestStock,
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
  it("the public portal files a slip, always as submitted, and tracks it", async () => {
    await signOutToPublic();
    const slip = await createRequest(input(), { asDraft: true });
    expect(slip).toMatchObject({ risNumber: `RIS-${manilaYear()}-000001`, status: "Pending Approval" });
    expect(slip.history[0].text).toBe(`${slip.risNumber} created`);
    expect((await getRequest(slip.id))?.purpose).toBe(input().purpose);
  });

  it("staff save drafts, edit, comment, list and count", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const draft = await createRequest(input(), { asDraft: true });
    expect(draft.status).toBe("Draft");
    await updateRequest(draft.id, input({ purpose: "Revised" }));
    await addRequestComment(draft.id, { author: "Dept", office: "MHO", text: "Urgent" });
    await setRequestStatus(draft.id, "Pending Approval", { by: "Dept" });
    expect((await listRequests({ search: "revised" })).map((r) => r.id)).toEqual([draft.id]);
    expect(await countRecords("ris_requests", ["Pending Approval"])).toBe(1);
  });

  it("releasing deducts stock and writes the stock card in the same step as the status", async () => {
    const { alcohol, gloves } = await stockedItems();
    const slip = await createRequest(
      input({
        items: [
          { inventoryItemId: alcohol.id, name: alcohol.name, unit: "bottle", requestedQty: 5, issuedQty: 5 },
          { inventoryItemId: gloves.id, name: gloves.name, unit: "box", requestedQty: 2, issuedQty: 2 },
          { name: "Item not in the register", unit: "pc", requestedQty: 1, issuedQty: 1 },
        ],
      }),
    );
    const released = await setRequestStatus(slip.id, "Released", { by: "GSO Head" });
    expect(released.status).toBe("Released");
    expect(released.history.filter((h) => h.text.startsWith("Stock card:"))).toHaveLength(2);
    expect((await getInventoryItem(alcohol.id))?.onHand).toBe(15);
    expect((await getInventoryItem(gloves.id))?.onHand).toBe(1);
    expect((await listStockCard(gloves.id))[0]).toMatchObject({ type: "RIS Release", quantityOut: 2, user: "GSO Head" });
  });

  it("a shortfall on any line leaves the slip, the stock and the stock card untouched", async () => {
    const { alcohol, gloves } = await stockedItems();
    const slip = await createRequest(
      input({
        items: [
          { inventoryItemId: alcohol.id, name: alcohol.name, unit: "bottle", requestedQty: 5, issuedQty: 5 },
          { inventoryItemId: gloves.id, name: gloves.name, unit: "box", requestedQty: 9, issuedQty: 9 },
        ],
      }),
    );
    await expect(setRequestStatus(slip.id, "Released")).rejects.toThrow(/Insufficient stock for Gloves, latex/);
    expect((await getRequest(slip.id))?.status).toBe("Pending Approval");
    expect((await getInventoryItem(alcohol.id))?.onHand).toBe(20);
    expect(await listStockCard(alcohol.id)).toHaveLength(1);
  });

  it("suggests stock to the public portal with name, unit and availability only", async () => {
    await stockedItems();
    await signOutToPublic();
    expect(await suggestStock("glo")).toEqual([{ name: "Gloves, latex", unit: "box", inStock: true }]);
    expect(await suggestStock("x")).toEqual([]);
  });
});
