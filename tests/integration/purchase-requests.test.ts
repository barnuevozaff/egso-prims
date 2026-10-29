import { getMetadata, ref } from "firebase/storage";
import { beforeEach, describe, expect, it } from "vitest";

import { requireFirebase } from "@/lib/firebase";
import { dataBackend } from "@/lib/data-backend";
import { countRecords } from "@/features/shared/record-counts";
import {
  addPurchaseRequestComment,
  cancelPurchaseRequest,
  createPurchaseRequest,
  deletePurchaseRequests,
  getPurchaseRequest,
  listPurchaseRequests,
  removePurchaseRequestAttachment,
  setPurchaseRequestStatus,
  updatePurchaseRequest,
  type PRDraftInput,
} from "@/features/purchase-requests/api";

import { cancelPurchaseOrder } from "@/features/purchase-orders/api";
import { prSummary } from "@/features/purchase-requests/types";

import { createTeam, manilaYear, resetEmulators, samplePdf, signInAs, signOutToPublic } from "./setup";

const input = (over: Partial<PRDraftInput> = {}): PRDraftInput => ({
  departmentCode: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Bond paper for Q4 reports (test data)",
  fundingSource: "General Fund",
  requestDate: "2026-10-19",
  items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
  attachments: [],
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await createTeam();
});

describe("Purchase Requests on Firestore", () => {
  it("runs through the same api.ts the screens use", () => {
    expect(dataBackend).toBe("firebase");
  });

  it("the public portal files a request and can track it by number, but not list the register", async () => {
    await signOutToPublic();
    const pr = await createPurchaseRequest(input());
    expect(pr.prNumber).toBe(`PR-${manilaYear()}-000001`);
    expect(pr.status).toBe("Submitted");
    expect((await getPurchaseRequest(pr.id))?.purpose).toBe(input().purpose);
    await expect(listPurchaseRequests()).rejects.toThrow(/permission/i);
  });

  it("the portal files with office, name, purpose and items; the GSO may add the fund, which is optional (22 Oct 2026)", async () => {
    await signOutToPublic();
    // The purpose is required again on submission; spaces alone do not count.
    await expect(createPurchaseRequest(input({ purpose: "   " }))).rejects.toThrow("Purpose is required.");
    const pr = await createPurchaseRequest(
      input({
        purpose: "Office supplies for daily administrative operations (test data)",
        fundingSource: undefined,
        section: "Supply",
        fpp: "1000-01",
        items: [
          { description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 },
          { description: "Ballpen, black", quantity: 3, unit: "box", estimatedCost: 120 },
        ],
      }),
    );
    expect(pr).toMatchObject({
      purpose: "Office supplies for daily administrative operations (test data)",
      fundingSource: undefined,
      section: "Supply",
      fpp: "1000-01",
      status: "Submitted",
    });
    expect(prSummary(pr)).toBe("Office supplies for daily administrative operations (test data)");

    await signInAs("admin@alaminos.gov.ph");
    const completed = await updatePurchaseRequest(pr.id, input({ purpose: "Office supplies for Q4 (test data)", fundingSource: "General Fund" }));
    expect(completed).toMatchObject({ purpose: "Office supplies for Q4 (test data)", fundingSource: "General Fund" });
    await signInAs("head@alaminos.gov.ph");
    const approved = await setPurchaseRequestStatus(pr.id, "Approved", { by: "Approver" });
    // Two references: the tracking one from submission, the official one from approval.
    expect(approved).toMatchObject({
      status: "Approved",
      prNumber: `PR-${manilaYear()}-000001`,
      officialPrNumber: `100-${manilaYear()}-000001`,
      signatories: { requestedBy: { name: "TEST GSO SIGNATORY" }, cashAvailability: { name: "TEST TREASURER" } },
    });
    // An approved request is an official document: its content is not edited.
    await signInAs("admin@alaminos.gov.ph");
    await expect(updatePurchaseRequest(pr.id, input({ purpose: "Changed afterwards" }))).rejects.toThrow(/permission/i);
  });

  it("lists newest first and filters by status, office, date and search", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const a = await createPurchaseRequest(input({ purpose: "Toner cartridges", departmentCode: "MHO" }));
    const b = await createPurchaseRequest(input({ purpose: "Bond paper", requestDate: "2026-09-01" }));
    await signInAs("admin@alaminos.gov.ph");
    await setPurchaseRequestStatus(a.id, "Approved", { by: "Administrator" });

    expect((await listPurchaseRequests()).map((p) => p.id)).toEqual([b.id, a.id]);
    expect((await listPurchaseRequests({ status: "Approved" })).map((p) => p.id)).toEqual([a.id]);
    expect((await listPurchaseRequests({ departmentCode: "MHO" })).map((p) => p.id)).toEqual([a.id]);
    expect((await listPurchaseRequests({ search: "toner" })).map((p) => p.id)).toEqual([a.id]);
    expect((await listPurchaseRequests({ dateTo: new Date("2026-09-30") })).map((p) => p.id)).toEqual([b.id]);
    expect(await countRecords("purchase_requests", ["Submitted"])).toBe(1);
  });

  it("an edit without headings keeps the group headings a request already has (21 Oct 2026)", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input({ headings: [{ position: 0, text: "Office Supplies" }] }));
    expect(pr.headings?.map((h) => h.text)).toEqual(["Office Supplies"]);
    const edited = await updatePurchaseRequest(pr.id, input({ purpose: "Revised purpose (test data)" }));
    expect(edited.purpose).toBe("Revised purpose (test data)");
    expect(edited.headings?.map((h) => h.text)).toEqual(["Office Supplies"]);
  });

  it("edits, comments and keeps the whole history", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    const edited = await updatePurchaseRequest(pr.id, input({ purpose: "Revised purpose" }));
    expect(edited.purpose).toBe("Revised purpose");
    const commented = await addPurchaseRequestComment(pr.id, { author: "Dept", office: "GSO", text: "Please rush" });
    expect(commented.comments).toHaveLength(1);
    expect(commented.history.map((h) => h.kind)).toEqual(["create", "status", "update", "comment"]);
  });

  it("any account approves another's request, signed with its own account (29 Oct 2026)", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());

    await signInAs("head@alaminos.gov.ph");
    const approved = await setPurchaseRequestStatus(pr.id, "Approved", { by: "Approver" });
    expect(approved.status).toBe("Approved");
    // Signed by the account that approved it, as the server sees it.
    expect(approved.approvals.at(-1)).toMatchObject({ step: "Approved", by: "head@alaminos.gov.ph" });
  });

  it("uploads attachments to Storage and removes them", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const pr = await createPurchaseRequest(
      input({ attachments: [{ name: "quotation.pdf", kind: "pdf", size: 5, uploadedBy: "Admin", file: samplePdf() }] }),
    );
    const [file] = pr.attachments;
    expect(file.path).toMatch(/^attachments\/upload-[0-9a-f-]+\/\d+-quotation\.pdf$/);
    const { storage } = requireFirebase();
    expect((await getMetadata(ref(storage, file.path!))).contentType).toBe("application/pdf");

    const after = await removePurchaseRequestAttachment(pr.id, file.id);
    expect(after.attachments).toHaveLength(0);
    await expect(getMetadata(ref(storage, file.path!))).rejects.toThrow();
  });

  it("a numbered request is voided, never deleted: number, record and history stay", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    await expect(deletePurchaseRequests([pr.id])).rejects.toThrow(/permission/i);
    await expect(cancelPurchaseRequest(pr.id, { reason: "  ", by: "Admin" })).rejects.toThrow(/reason/);

    const voided = await cancelPurchaseRequest(pr.id, { reason: "Duplicate request", by: "GSO Admin", office: "GSO" });
    expect(voided).toMatchObject({ id: pr.id, prNumber: pr.prNumber, status: "Cancelled", purpose: pr.purpose });
    const step = voided.approvals.at(-1);
    expect(step).toMatchObject({ step: "Cancelled", by: "GSO Admin", remarks: "Duplicate request" });
    expect(step?.byUid).toBe(requireFirebase().auth.currentUser?.uid);
    expect(step?.at).toBeTruthy();
    expect(voided.history.at(-1)?.text).toBe("Status → Cancelled: Duplicate request");
    await expect(cancelPurchaseRequest(pr.id, { reason: "Again", by: "Admin" })).rejects.toThrow(/cannot be voided/);
  });

  it("any account voids a request, its own or another's", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const own = await createPurchaseRequest(input());
    const other = await createPurchaseRequest(input());
    expect((await cancelPurchaseRequest(own.id, { reason: "Raised by mistake", by: "Clerk" })).status).toBe("Cancelled");
    await signInAs("admin@alaminos.gov.ph");
    expect((await cancelPurchaseRequest(other.id, { reason: "Not needed", by: "Admin" })).status).toBe("Cancelled");
  });

  it("a request with a purchase order in force is not voided until the order is voided", async () => {
    await signInAs("admin@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    // Approving creates the order (21 Oct 2026).
    const approved = await setPurchaseRequestStatus(pr.id, "Approved", { by: "Administrator" });
    const po = { id: approved.poNumber!, poNumber: approved.poNumber! };
    expect(po.poNumber).toMatch(/^PO-/);
    await expect(cancelPurchaseRequest(pr.id, { reason: "Not needed", by: "Admin" })).rejects.toThrow(
      new RegExp(`${po.poNumber}.*in force`),
    );
    expect((await getPurchaseRequest(pr.id))?.status).toBe("Approved");

    await cancelPurchaseOrder(po.id, { reason: "Supplier withdrew (test data)", by: "Admin" });
    const voided = await cancelPurchaseRequest(pr.id, { reason: "Not needed", by: "Admin" });
    // The tracking reference, the official number, the items and the history stay.
    expect(voided).toMatchObject({
      status: "Cancelled",
      prNumber: pr.prNumber,
      officialPrNumber: approved.officialPrNumber,
      items: [expect.objectContaining({ description: "Bond paper, A4" })],
    });
    expect(voided.history.length).toBe(approved.history.length + 1);
  });

  it("a request is marked completed only after approval", async () => {
    await signInAs("clerk@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    await signInAs("head@alaminos.gov.ph");
    await expect(setPurchaseRequestStatus(pr.id, "Completed")).rejects.toThrow(/permission/i);
    await setPurchaseRequestStatus(pr.id, "Approved", { by: "Approver" });
    expect((await setPurchaseRequestStatus(pr.id, "Completed", { by: "Approver" })).status).toBe("Completed");
  });
});
