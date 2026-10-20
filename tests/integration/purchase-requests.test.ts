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

  it("lists newest first and filters by status, office, date and search", async () => {
    await signInAs("dept@alaminos.gov.ph");
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

  it("edits, comments and keeps the whole history", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    const edited = await updatePurchaseRequest(pr.id, input({ purpose: "Revised purpose" }));
    expect(edited.purpose).toBe("Revised purpose");
    const commented = await addPurchaseRequestComment(pr.id, { author: "Dept", office: "GSO", text: "Please rush" });
    expect(commented.comments).toHaveLength(1);
    expect(commented.history.map((h) => h.kind)).toEqual(["create", "status", "update", "comment"]);
  });

  it("only an Administrator or an approver approves; a Department User is refused", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    await expect(setPurchaseRequestStatus(pr.id, "Approved")).rejects.toThrow(/permission/i);
    expect((await getPurchaseRequest(pr.id))?.status).toBe("Submitted");

    await signInAs("approver@alaminos.gov.ph");
    const approved = await setPurchaseRequestStatus(pr.id, "Approved", { by: "Approver" });
    expect(approved.status).toBe("Approved");
    expect(approved.approvals.at(-1)).toMatchObject({ step: "Approved", by: "Approver" });

    await signInAs("viewer@alaminos.gov.ph");
    await expect(setPurchaseRequestStatus(pr.id, "Completed")).rejects.toThrow(/permission/i);
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

  it("a Department User voids only their own open request", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const own = await createPurchaseRequest(input());
    await signOutToPublic();
    const portal = await createPurchaseRequest(input());
    await signInAs("dept@alaminos.gov.ph");
    await expect(cancelPurchaseRequest(portal.id, { reason: "Not mine", by: "Dept" })).rejects.toThrow(/permission/i);
    expect((await cancelPurchaseRequest(own.id, { reason: "Raised by mistake", by: "Dept" })).status).toBe("Cancelled");
  });

  it("only a decider marks a request completed, and only after approval", async () => {
    await signInAs("dept@alaminos.gov.ph");
    const pr = await createPurchaseRequest(input());
    await signInAs("approver@alaminos.gov.ph");
    await expect(setPurchaseRequestStatus(pr.id, "Completed")).rejects.toThrow(/permission/i);
    await setPurchaseRequestStatus(pr.id, "Approved", { by: "Approver" });
    await signInAs("dept@alaminos.gov.ph");
    await expect(setPurchaseRequestStatus(pr.id, "Completed")).rejects.toThrow(/permission/i);
    await signInAs("approver@alaminos.gov.ph");
    expect((await setPurchaseRequestStatus(pr.id, "Completed", { by: "Approver" })).status).toBe("Completed");
  });
});
