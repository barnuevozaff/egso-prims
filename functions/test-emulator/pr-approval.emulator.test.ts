import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { manilaYear } from "../src/numbering.js";
import { AUTH, call, accountToken } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Approving a Purchase Request (21 Oct 2026): purpose, fund and signatories
 * required; the official PR number assigned once, in its own yearly sequence;
 * the signatories copied onto the request. Synthetic data only.
 */

let db: Firestore;
let admin: string;
let adminUid: string;
const year = manilaYear(new Date());

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

const setting = (category: string, key: string, value: unknown) =>
  db.doc(`system_configuration/cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`).set({ category, key, value });

async function signatories() {
  await setting("Signatories", "pr_requested_by_name", "TEST GSO SIGNATORY");
  await setting("Signatories", "pr_cash_availability_name", "TEST TREASURER");
  await setting("Signatories", "pr_approved_by_name", "TEST MAYOR");
}

async function submitted(id: string, over: Record<string, unknown> = {}) {
  await db.doc(`purchase_requests/${id}`).set({
    id, pr_number: id, department_code: "GSO", requester: "Test Requester", purpose: "Office supplies (test)",
    funding_source: "General Fund", status: "Submitted", request_date: "2026-10-21",
    items: [{ id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
    approvals: [], history: [], created_at: "2026-10-21T00:00:00.000Z", updated_at: "2026-10-21T00:00:00.000Z",
    ...over,
  });
}

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  ({ token: admin, uid: adminUid } = await accountToken("admin@alaminos.gov.ph"));
});

describe("approving a Purchase Request", () => {
  it("assigns 100-YYYY-000001 and the next, copies the signatories, and records who and when", async () => {
    await signatories();
    await submitted("PR-2026-000001");
    await submitted("PR-2026-000002");
    const first = await call("approvePurchaseRequest", { id: "PR-2026-000001" }, admin);
    expect(first.error).toBeUndefined();
    expect(first.result).toMatchObject({
      status: "Approved",
      pr_number: "PR-2026-000001",
      official_pr_number: `100-${year}-000001`,
      official_pr_number_assigned_by: "admin@alaminos.gov.ph",
      official_pr_number_assigned_by_uid: adminUid,
      signatories: {
        requested_by: { name: "TEST GSO SIGNATORY", designation: "General Services Officer" },
        cash_availability: { name: "TEST TREASURER", designation: "Municipal Treasurer" },
        approved_by: { name: "TEST MAYOR", designation: "Municipal Mayor" },
      },
    });
    const history = ((first.result?.history ?? []) as { kind: string; text: string }[]).map((h) => h.kind);
    expect(history).toEqual(["status", "official-number", "purchase-order"]);
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000002" }, admin)).result?.official_pr_number).toBe(`100-${year}-000002`);
  });

  it("refuses without a purpose or a configured signatory, and names what is missing; the fund is optional", async () => {
    await submitted("PR-2026-000003", { purpose: null });
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000003" }, admin)).error?.message).toBe(
      "Add the purpose to PR-2026-000003 before approving it.",
    );
    // Names only: the roles and designations are the form's (21 Oct 2026).
    await submitted("PR-2026-000005", { department_code: "MHO" });
    await setting("Signatories", "pr_cash_availability_name", "TEST TREASURER");
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000005" }, admin)).error?.message).toBe(
      "Set the printed name for Requested by (General Services Officer), Approved by (Municipal Mayor) in Settings → Purchase Request signatories before approving PR-2026-000005.",
    );
    // Nothing was numbered for the refused approvals.
    expect((await db.doc(`document_counters/PR-OFFICIAL-${year}`).get()).exists).toBe(false);

    // Whatever office filed it, Requested by is the General Services Officer.
    await signatories();
    const filedByMHO = await call("approvePurchaseRequest", { id: "PR-2026-000005" }, admin);
    expect(filedByMHO.result?.signatories).toEqual({
      requested_by: { name: "TEST GSO SIGNATORY", designation: "General Services Officer" },
      cash_availability: { name: "TEST TREASURER", designation: "Municipal Treasurer" },
      approved_by: { name: "TEST MAYOR", designation: "Municipal Mayor" },
    });

    // No fund, section or FPP (22 Oct 2026): approved, numbered, and its order made; the blanks stay blank.
    await submitted("PR-2026-000004", { funding_source: null, section: null, fpp: null });
    const blank = await call("approvePurchaseRequest", { id: "PR-2026-000004" }, admin);
    expect(blank.error).toBeUndefined();
    expect(blank.result).toMatchObject({ status: "Approved", funding_source: null, section: null, fpp: null });
    expect(blank.result?.official_pr_number).toMatch(new RegExp(`^100-${year}-\\d{6}$`));
    expect((await db.doc(`purchase_orders/${String(blank.result?.po_number)}`).get()).get("pr_number")).toBe("PR-2026-000004");
  });

  it("an approved document keeps its signatories and number when Settings change, and on a second approval", async () => {
    await signatories();
    await submitted("PR-2026-000006");
    await call("approvePurchaseRequest", { id: "PR-2026-000006" }, admin);
    await setting("Signatories", "pr_approved_by_name", "SOMEONE ELSE");
    await setting("Procurement", "official_pr_prefix", "200");
    // Returned to draft and approved again: same number, same signatories.
    await db.doc("purchase_requests/PR-2026-000006").update({ status: "Submitted" });
    const again = await call("approvePurchaseRequest", { id: "PR-2026-000006" }, admin);
    expect(again.result).toMatchObject({
      official_pr_number: `100-${year}-000001`,
      signatories: { approved_by: { name: "TEST MAYOR" } },
    });
    // A new approval takes the new prefix and the next number.
    await submitted("PR-2026-000007");
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000007" }, admin)).result?.official_pr_number).toBe(`200-${year}-000002`);
  });

  it("of simultaneous approvals, every request gets its own number and none repeats", async () => {
    await signatories();
    const ids = Array.from({ length: 5 }, (_, i) => `PR-2026-0001${i}`);
    for (const id of ids) await submitted(id);
    const results = await Promise.all(ids.map((id) => call("approvePurchaseRequest", { id }, admin)));
    const numbers = results.map((r) => String(r.result?.official_pr_number)).sort();
    expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => `100-${year}-${String(n).padStart(6, "0")}`));
  });

  it("restarts every year: last year's counter is not continued", async () => {
    await signatories();
    await db.doc(`document_counters/PR-OFFICIAL-${year - 1}`).set({ document_type: "PR-OFFICIAL", year: year - 1, current_sequence: 214 });
    await submitted("PR-2026-000020");
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000020" }, admin)).result?.official_pr_number).toBe(`100-${year}-000001`);
  });

  it("is for accounts only, never the public, and only for a submitted request", async () => {
    await signatories();
    await submitted("PR-2026-000030");
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000030" })).error?.status).toBe("PERMISSION_DENIED");
    // Any account approves: every account is an Administrator (29 Oct 2026).
    const { token: approver } = await accountToken("approver@gmail.com");
    const first = await call("approvePurchaseRequest", { id: "PR-2026-000030" }, approver);
    expect(first.result?.status).toBe("Approved");
    // Approving again (a double click, a retry) changes nothing and returns the same order.
    const again = await call("approvePurchaseRequest", { id: "PR-2026-000030" }, approver);
    expect(again.result).toMatchObject({ status: "Approved", po_number: first.result?.po_number });
    await db.doc("purchase_requests/PR-2026-000031").set({ id: "PR-2026-000031", pr_number: "PR-2026-000031", status: "Draft" });
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000031" }, admin)).error?.message).toMatch(
      /Only a submitted request can be approved/,
    );
  });
});

describe("the purchase order created with the approval (21 Oct 2026)", () => {
  const orders = async () => (await db.collection("purchase_orders").get()).docs;
  const poSetting = (key: string, value: string) => setting("PO Signatories", key, value);

  it("creates exactly one order, already authorized, from the request's items, with blanks left blank", async () => {
    await signatories();
    await poSetting("po_approving_name", "TEST MAYOR");
    await setting("Procurement", "po_payment_term", "Cash (test)");
    await submitted("PR-2026-000001");
    const res = await call("approvePurchaseRequest", { id: "PR-2026-000001", by: "x" }, admin);
    const poNumber = String(res.result?.po_number);
    expect(poNumber).toBe(`PO-${year}-000001`);
    const docs = await orders();
    expect(docs.map((d) => d.id)).toEqual([poNumber]);
    expect(docs[0].data()).toMatchObject({
      status: "Approved",
      authorization: "pr-approval",
      pr_number: "PR-2026-000001",
      pr_official_number: `100-${year}-000001`,
      department_code: "GSO",
      requester: "Test Requester",
      purpose: "Office supplies (test)",
      supplier_name: "",
      supplier_address: null,
      mode_of_procurement: null,
      delivery_address: null,
      delivery_term: null,
      payment_term: "Cash (test)",
      expected_delivery: null,
      approved_by_uid: adminUid,
      signatories: { approved_by: { name: "TEST MAYOR", designation: "Municipal Mayor" }, bac_secretary: null },
      items: [{ description: "Bond paper, A4", quantity: 10, unit: "ream", unitCost: 250, stockNo: null }],
    });
    expect(docs[0].get("authorized_items")).toEqual(docs[0].get("items"));
    expect(docs[0].get("po_date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await db.doc("purchase_requests/PR-2026-000001").get()).get("po_number")).toBe(poNumber);
    expect((await db.doc("unique_keys/purchase_orders.source_pr:PR-2026-000001").get()).get("doc_id")).toBe(poNumber);
  });

  it("is created even when the PO signatory is not set, which then prints blank", async () => {
    await signatories();
    await submitted("PR-2026-000001");
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000001" }, admin)).error).toBeUndefined();
    expect((await orders())[0].get("signatories")).toEqual({ approved_by: null, bac_secretary: null });
  });

  it("simultaneous approvals and retries of one request make one order between them", async () => {
    await signatories();
    await submitted("PR-2026-000001");
    const results = await Promise.all(
      Array.from({ length: 4 }, () => call("approvePurchaseRequest", { id: "PR-2026-000001" }, admin)),
    );
    const numbers = new Set(results.filter((r) => r.result).map((r) => r.result?.po_number));
    expect(numbers.size).toBe(1);
    expect(await orders()).toHaveLength(1);
    // A retry afterwards finds it too.
    expect((await call("approvePurchaseRequest", { id: "PR-2026-000001" }, admin)).result?.po_number).toBe([...numbers][0]);
    expect(await orders()).toHaveLength(1);
  });

  it("different requests approved at once each get their own order and number", async () => {
    await signatories();
    const ids = ["PR-2026-000101", "PR-2026-000102", "PR-2026-000103"];
    for (const id of ids) await submitted(id);
    const results = await Promise.all(ids.map((id) => call("approvePurchaseRequest", { id }, admin)));
    const numbers = results.map((r) => String(r.result?.po_number)).sort();
    expect(numbers).toEqual([1, 2, 3].map((n) => `PO-${year}-${String(n).padStart(6, "0")}`));
  });

  it("an older approved request gets its order once, or its earlier order linked (ensurePurchaseOrderForPR)", async () => {
    await submitted("PR-2026-000201", { status: "Approved", official_pr_number: "100-2026-000099" });
    const made = await call("ensurePurchaseOrderForPR", { id: "PR-2026-000201" }, admin);
    expect(made.result).toMatchObject({ po_number: `PO-${year}-000001`, created: true });
    expect((await call("ensurePurchaseOrderForPR", { id: "PR-2026-000201" }, admin)).result).toEqual({
      po_number: `PO-${year}-000001`,
      created: false,
    });

    // Ordered by hand earlier: that order is linked, nothing new is made.
    await submitted("PR-2026-000202", { status: "Approved" });
    await db.doc("purchase_orders/PO-2025-000777").set({ po_number: "PO-2025-000777", pr_number: "PR-2026-000202", status: "Approved", created_at: "2025-12-01" });
    expect((await call("ensurePurchaseOrderForPR", { id: "PR-2026-000202" }, admin)).result).toEqual({
      po_number: "PO-2025-000777",
      created: false,
    });
    expect(await orders()).toHaveLength(2);

    expect((await call("ensurePurchaseOrderForPR", { id: "PR-2026-000201" })).error?.status).toBe("PERMISSION_DENIED");
    await submitted("PR-2026-000203");
    expect((await call("ensurePurchaseOrderForPR", { id: "PR-2026-000203" }, admin)).error?.message).toMatch(/is Submitted/);
  });
});

describe("signatory names in Settings reach only new documents, and only their own form (21 Oct 2026)", () => {
  it("each name goes to its own role; approved documents keep the names they were approved with", async () => {
    await signatories();
    await setting("PO Signatories", "po_approving_name", "PO MAYOR NAME");
    await setting("PO Signatories", "po_bac_secretary_name", "BAC NAME");
    await submitted("PR-2026-000301");
    const first = await call("approvePurchaseRequest", { id: "PR-2026-000301" }, admin);
    const firstPO = (await db.doc(`purchase_orders/${first.result?.po_number}`).get()).data()!;
    expect(first.result?.signatories.approved_by).toEqual({ name: "TEST MAYOR", designation: "Municipal Mayor" });
    expect(firstPO.signatories).toEqual({
      approved_by: { name: "PO MAYOR NAME", designation: "Municipal Mayor" },
      bac_secretary: { name: "BAC NAME", designation: "BAC Secretary" },
    });

    // A new Treasurer changes the PR only; a new BAC Secretary the PO only.
    await setting("Signatories", "pr_cash_availability_name", "NEW TREASURER");
    await setting("PO Signatories", "po_bac_secretary_name", "NEW BAC NAME");
    await submitted("PR-2026-000302");
    const second = await call("approvePurchaseRequest", { id: "PR-2026-000302" }, admin);
    const secondPO = (await db.doc(`purchase_orders/${second.result?.po_number}`).get()).data()!;
    expect(second.result?.signatories.cash_availability).toEqual({ name: "NEW TREASURER", designation: "Municipal Treasurer" });
    expect(secondPO.signatories.approved_by).toEqual({ name: "PO MAYOR NAME", designation: "Municipal Mayor" });
    expect(secondPO.signatories.bac_secretary).toEqual({ name: "NEW BAC NAME", designation: "BAC Secretary" });

    // The first request and its order still carry their original names.
    expect((await db.doc("purchase_requests/PR-2026-000301").get()).get("signatories.cash_availability.name")).toBe("TEST TREASURER");
    expect((await db.doc(`purchase_orders/${first.result?.po_number}`).get()).get("signatories.bac_secretary.name")).toBe("BAC NAME");
  });
});
