import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createEnv, samplePR, staff } from "./setup";

let env: RulesTestEnvironment;

const firstComment = {
  id: "c1",
  author_uid: "admin-1",
  author: "admin@alaminos.gov.ph",
  text: "Checked against the paper PR.",
  createdAt: "2026-10-19T01:00:00.000Z",
};

const comment = (uid: string, text = "Reviewed.") => ({
  id: `c-${text.length}`,
  author_uid: uid,
  author: `${uid}@alaminos.gov.ph`,
  text,
  createdAt: "2026-10-19T02:00:00.000Z",
});

const OPERATIONAL = [
  "suppliers", "inventory_items", "stock_card",
  "energy_accounts", "energy_bills", "energy_submeters", "energy_submeter_bills",
  "water_accounts", "water_bills", "water_submeters", "water_submeter_bills", "water_meter_readings",
  "fuel_vehicles", "fuel_transactions", "fuel_odometer_readings", "fuel_trips",
  "violators", "violations",
];
const RECORDS = [
  "disposition_schedules", "record_series", "inventory_appraisals", "inventory_records",
  "disposal_requests", "disposal_items", "record_shelves", "record_shelf_levels",
  "record_boxes", "record_box_contents",
];
const STAFF_ONLY = [...OPERATIONAL, ...RECORDS, "system_configuration", "notifications", "audit_logs"];
const NUMBERED = {
  purchase_requests: "PR-2026-000001",
  purchase_orders: "PO-2026-000001",
  ris_requests: "RIS-2026-000001",
  reservations: "FR-2026-000001",
} as const;

/** Collections whose staff writes must carry the writer's account (signsWrite in firestore.rules). */
const SIGNED = new Set(["purchase_requests", "purchase_orders", "ris_requests", "reservations", ...OPERATIONAL, ...RECORDS]);
// Keyed by the modular Firestore instance a document reference points at;
// the test contexts hand out its compat wrapper, which keeps it as _delegate.
const writerOf = new WeakMap<object, string>();

/** A signed-in context whose writes are signed with its own account, as the app signs them. */
const signedIn = (uid: string, token: Record<string, unknown>) => {
  const db = env.authenticatedContext(uid, token).firestore();
  writerOf.set((db as unknown as { _delegate?: object })._delegate ?? db, uid);
  return db;
};

const as = (who: keyof typeof staff) => signedIn(staff[who].uid, staff[who].token);

/** updateDoc, stamped with the acting account unless the test sets the stamp itself. */
function updateDoc(ref: DocumentReference, data: Record<string, unknown>) {
  const uid = writerOf.get(ref.firestore);
  const stamp = uid && SIGNED.has(ref.parent.id) && !("updated_by_uid" in data);
  return fsUpdateDoc(ref, stamp ? { ...data, updated_by_uid: uid } : data);
}

/** setDoc, stamped with the acting account on collections that require it. */
function setDoc(ref: DocumentReference, data: Record<string, unknown>) {
  const uid = writerOf.get(ref.firestore);
  const stamp = uid && (SIGNED.has(ref.parent.id) || ref.parent.id === "stock_card");
  return fsSetDoc(ref, stamp ? { created_by_uid: uid, updated_by_uid: uid, ...data } : data);
}
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await createEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "purchase_requests/PR-2026-000001"), samplePR());
    await setDoc(doc(db, "inventory_items/item-1"), { id: "item-1", name: "Bond paper", created_at: "x" });
    await setDoc(doc(db, "audit_logs/AUD-2026-0001"), {
      id: "AUD-2026-0001",
      action: "Record Created",
      user_name: "clerk@alaminos.gov.ph",
      severity: "Information",
      comments: [firstComment],
    });
    await setDoc(doc(db, "notifications/n1"), { id: "n1", title: "New PR", is_read: false });
    await setDoc(doc(db, "document_counters/PR-2026"), { document_type: "PR", year: 2026, current_sequence: 1 });
    await setDoc(doc(db, "record_boxes/box-1"), { id: "box-1" });
    for (const c of STAFF_ONLY) {
      if (c !== "audit_logs") await setDoc(doc(db, `${c}/seed`), { id: "seed", created_at: "x" });
    }
    await setDoc(doc(db, "purchase_orders/PO-2026-000001"), {
      id: "PO-2026-000001", po_number: "PO-2026-000001", status: "Approved",
    });
    await setDoc(doc(db, "ris_requests/RIS-2026-000001"), {
      id: "RIS-2026-000001", ris_number: "RIS-2026-000001", status: "Pending Approval",
    });
    await setDoc(doc(db, "reservations/FR-2026-000001"), {
      id: "FR-2026-000001", res_number: "FR-2026-000001", status: "Pending",
    });
  });
});

describe("staff-only data, signed out", () => {
  it("cannot read, list or write any staff-only collection", async () => {
    for (const c of STAFF_ONLY) {
      await assertFails(getDoc(doc(anon(), `${c}/seed`)));
      await assertFails(getDocs(collection(anon(), c)));
      await assertFails(setDoc(doc(anon(), `${c}/new`), { id: "new" }));
    }
  });
});

describe("public portal: only the explicitly allowed operations", () => {
  it("opens each numbered record by its number, and nothing more", async () => {
    for (const [c, n] of Object.entries(NUMBERED)) {
      await assertSucceeds(getDoc(doc(anon(), `${c}/${n}`)));
      await assertFails(getDocs(collection(anon(), c)));
      await assertFails(updateDoc(doc(anon(), `${c}/${n}`), { status: "Approved" }));
      await assertFails(updateDoc(doc(anon(), `${c}/${n}`), { purpose: "Changed by the public" }));
      await assertFails(deleteDoc(doc(anon(), `${c}/${n}`)));
    }
  });

  it("cannot create any numbered record directly, even with a valid status", async () => {
    await assertFails(setDoc(doc(anon(), "ris_requests/RIS-2026-000002"), {
      id: "RIS-2026-000002", ris_number: "RIS-2026-000002", status: "Pending Approval",
    }));
    await assertFails(setDoc(doc(anon(), "reservations/FR-2026-000002"), {
      id: "FR-2026-000002", res_number: "FR-2026-000002", status: "Pending",
    }));
  });
});

describe("ordinary staff cannot do Administrator work", () => {
  it("Department Users and Viewers cannot write operational, Records or settings data", async () => {
    for (const who of ["dept", "viewer"] as const) {
      for (const c of [...OPERATIONAL, ...RECORDS, "system_configuration"]) {
        await assertFails(setDoc(doc(as(who), `${c}/new`), { id: "new", category: "c", key: "k" }));
        await assertFails(updateDoc(doc(as(who), `${c}/seed`), { changed: true }));
        await assertFails(deleteDoc(doc(as(who), `${c}/seed`)));
      }
    }
  });

  it("a Viewer cannot change an administrative status", async () => {
    await assertFails(updateDoc(doc(as("viewer"), "purchase_requests/PR-2026-000001"), { status: "Approved" }));
    await assertFails(updateDoc(doc(as("viewer"), "purchase_orders/PO-2026-000001"), { status: "Released" }));
  });

  it("a Department User cannot release a purchase order", async () => {
    await assertFails(updateDoc(doc(as("dept"), "purchase_orders/PO-2026-000001"), { status: "Released" }));
  });

  it("only Administrators clear notifications", async () => {
    await assertFails(deleteDoc(doc(as("dept"), "notifications/n1")));
    await assertSucceeds(deleteDoc(doc(as("admin"), "notifications/n1")));
  });
});

describe("roles cannot be forged from the browser", () => {
  const forged = {
    lowercase: { role: "administrator", email: "a@alaminos.gov.ph" },
    padded: { role: "Administrator ", email: "a@alaminos.gov.ph" },
    adminFlag: { admin: true, email: "a@alaminos.gov.ph" },
    rolesArray: { roles: ["Administrator"], email: "a@alaminos.gov.ph" },
  };

  it("only the exact role claim counts", async () => {
    for (const [name, token] of Object.entries(forged)) {
      const db = env.authenticatedContext(`forged-${name}`, token).firestore();
      await assertFails(getDocs(collection(db, "purchase_requests")));
      await assertFails(setDoc(doc(db, "inventory_items/x"), { id: "x" }));
    }
  });

  it("an office email address alone grants nothing", async () => {
    const db = env.authenticatedContext("u1", { email: "gso.head@alaminos.gov.ph", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "inventory_items/seed")));
  });

  it("writing a role into a document grants nothing", async () => {
    const db = as("noRole");
    await assertFails(setDoc(doc(db, "users/norole-1"), { role: "Administrator" }));
    await assertFails(setDoc(doc(db, "roles/norole-1"), { role: "Administrator" }));
    await assertFails(getDocs(collection(db, "purchase_requests")));
  });
});

describe("audit trail is append-only", () => {
  const entry = (who: keyof typeof staff) => doc(as(who), "audit_logs/AUD-2026-0001");

  it("Administrators read it", async () => {
    await assertSucceeds(getDoc(entry("admin")));
  });

  it("nobody can delete an entry, Administrators included", async () => {
    for (const who of ["admin", "dept", "viewer"] as const) {
      await assertFails(deleteDoc(entry(who)));
    }
    await assertFails(deleteDoc(doc(anon(), "audit_logs/AUD-2026-0001")));
  });

  it("nobody can create or forge an entry", async () => {
    await assertFails(setDoc(doc(as("admin"), "audit_logs/AUD-2026-0002"), { action: "Forged" }));
    await assertFails(setDoc(entry("admin"), { action: "Rewritten", comments: [] }));
  });

  it("no field of an entry can be changed", async () => {
    await assertFails(updateDoc(entry("admin"), { action: "Record Deleted" }));
    await assertFails(updateDoc(entry("admin"), { user_name: "someone.else@alaminos.gov.ph" }));
    // A valid new comment does not carry another change through with it.
    await assertFails(updateDoc(entry("admin"), { severity: "Critical", comments: [firstComment, comment("admin-1")] }));
  });

  it("the first comment on an entry the trigger wrote (no comments field yet) is accepted", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "audit_logs/AUD-2026-0009"), { id: "AUD-2026-0009", action: "Record Created" });
    });
    await assertSucceeds(updateDoc(doc(as("admin"), "audit_logs/AUD-2026-0009"), { comments: [comment("admin-1")] }));
  });

  it("an Administrator may add one comment signed as themself", async () => {
    await assertSucceeds(updateDoc(entry("admin"), { comments: [firstComment, comment("admin-1")] }));
  });

  it("a comment cannot be signed as someone else", async () => {
    await assertFails(updateDoc(entry("admin"), { comments: [firstComment, comment("dept-1")] }));
  });

  it("earlier comments cannot be edited, removed or reordered", async () => {
    await assertFails(updateDoc(entry("admin"), { comments: [] }));
    await assertFails(
      updateDoc(entry("admin"), { comments: [{ ...firstComment, text: "Edited" }, comment("admin-1")] }),
    );
    await assertFails(updateDoc(entry("admin"), { comments: [comment("admin-1"), firstComment] }));
  });

  it("only one comment at a time, and not an empty one", async () => {
    await assertFails(
      updateDoc(entry("admin"), { comments: [firstComment, comment("admin-1", "a"), comment("admin-1", "bb")] }),
    );
    await assertFails(updateDoc(entry("admin"), { comments: [firstComment, comment("admin-1", "")] }));
  });

  it("other roles cannot comment", async () => {
    await assertFails(updateDoc(entry("dept"), { comments: [firstComment, comment("dept-1")] }));
    await assertFails(updateDoc(entry("viewer"), { comments: [firstComment, comment("viewer-1")] }));
  });
});

describe("public portal (signed out)", () => {
  it("can open one purchase request by its number (Track page)", async () => {
    await assertSucceeds(getDoc(doc(anon(), "purchase_requests/PR-2026-000001")));
  });

  it("cannot list the register", async () => {
    await assertFails(getDocs(collection(anon(), "purchase_requests")));
  });

  it("cannot write directly; submissions go through a Cloud Function", async () => {
    await assertFails(setDoc(doc(anon(), "purchase_requests/PR-2026-000002"), samplePR("PR-2026-000002")));
    await assertFails(updateDoc(doc(anon(), "purchase_requests/PR-2026-000001"), { status: "Approved" }));
  });

  it("cannot read staff-only data", async () => {
    await assertFails(getDoc(doc(anon(), "inventory_items/item-1")));
    await assertFails(getDoc(doc(anon(), "audit_logs/AUD-2026-0001")));
    await assertFails(getDoc(doc(anon(), "document_counters/PR-2026")));
  });
});

describe("signed-in accounts without a trusted role", () => {
  it("get nothing beyond the public view", async () => {
    for (const who of ["noRole", "madeUpRole"] as const) {
      await assertFails(getDocs(collection(as(who), "purchase_requests")));
      await assertFails(getDoc(doc(as(who), "inventory_items/item-1")));
      await assertFails(setDoc(doc(as(who), "purchase_requests/PR-2026-000002"), samplePR("PR-2026-000002")));
    }
  });
});

describe("Viewer", () => {
  it("reads but never writes", async () => {
    await assertSucceeds(getDocs(collection(as("viewer"), "purchase_requests")));
    await assertSucceeds(getDoc(doc(as("viewer"), "inventory_items/item-1")));
    await assertFails(setDoc(doc(as("viewer"), "purchase_requests/PR-2026-000002"), samplePR("PR-2026-000002")));
    await assertFails(updateDoc(doc(as("viewer"), "inventory_items/item-1"), { name: "Changed" }));
  });

  it("cannot read the audit trail", async () => {
    await assertFails(getDoc(doc(as("viewer"), "audit_logs/AUD-2026-0001")));
  });
});

describe("Department User", () => {
  it("edits a request it manages but cannot renumber it or change when it was created", async () => {
    const ref = doc(as("dept"), "purchase_requests/PR-2026-000001");
    await assertSucceeds(updateDoc(ref, { purpose: "Revised purpose (test data)" }));
    await assertFails(updateDoc(ref, { pr_number: "PR-2026-000777" }));
    await assertFails(updateDoc(ref, { created_at: "2020-01-01T00:00:00.000Z" }));
  });

  it("cannot use a status the workflow does not have", async () => {
    await assertFails(updateDoc(doc(as("dept"), "purchase_requests/PR-2026-000001"), { status: "Paid" }));
  });

  it("cannot manage purchase orders, inventory or settings", async () => {
    await assertFails(updateDoc(doc(as("dept"), "purchase_orders/PO-2026-000001"), { status: "Cancelled" }));
    await assertFails(updateDoc(doc(as("dept"), "inventory_items/item-1"), { name: "Changed" }));
    await assertFails(
      setDoc(doc(as("dept"), "system_configuration/x"), { category: "General", key: "x", value: 1 }),
    );
  });
});

describe("numbered documents are created only by the server", () => {
  const fresh = {
    purchase_requests: { id: "PR-2026-000009", pr_number: "PR-2026-000009", status: "Submitted" },
    purchase_orders: { id: "PO-2026-000009", po_number: "PO-2026-000009", status: "Draft" },
    ris_requests: { id: "RIS-2026-000009", ris_number: "RIS-2026-000009", status: "Pending Approval" },
    reservations: { id: "FR-2026-000009", res_number: "FR-2026-000009", status: "Pending" },
  } as const;

  it("no browser — Administrator, staff or public — can create one directly", async () => {
    for (const [c, data] of Object.entries(fresh)) {
      for (const db of [as("admin"), as("dept"), as("viewer"), anon()]) {
        await assertFails(setDoc(doc(db, `${c}/${data.id}`), data));
      }
    }
  });
});

describe("purchase request decisions, ownership and voiding", () => {
  const ctx = signedIn;
  const approver = () => ctx("approver-1", { role: "Department User", approver: true, email: "ap@alaminos.gov.ph" });
  const otherDept = () => ctx("dept-2", { role: "Department User", email: "dept2@alaminos.gov.ph" });
  const pr = (db: ReturnType<typeof anon>, n = "PR-2026-000001") => doc(db, `purchase_requests/${n}`);
  /** A status change as the app makes it: one new approval step, signed by the account taking it. */
  const step = (status: string, byUid: string, remarks?: string) => ({
    status,
    approvals: [{ step: status, by: "Test", byUid, ...(remarks !== undefined ? { remarks } : {}) }],
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, "purchase_requests/PR-2026-000002"), samplePR("PR-2026-000002", "Approved"));
      await setDoc(doc(db, "purchase_requests/PR-2026-000003"), samplePR("PR-2026-000003", "Draft"));
      await setDoc(doc(db, "purchase_requests/PR-2026-000004"), samplePR("PR-2026-000004", "Rejected"));
      await setDoc(doc(db, "purchase_requests/PR-2026-000005"), samplePR("PR-2026-000005", "Completed"));
      // Filed on the public portal: nobody owns it.
      await setDoc(doc(db, "purchase_requests/PR-2026-000006"), { ...samplePR("PR-2026-000006"), created_by_uid: null });
    });
  });

  it("a Department User cannot approve, reject, return or complete, even their own request", async () => {
    await assertFails(updateDoc(pr(as("dept")), step("Approved", "dept-1")));
    await assertFails(updateDoc(pr(as("dept")), step("Rejected", "dept-1")));
    await assertFails(updateDoc(pr(as("dept")), step("Draft", "dept-1")));
    await assertFails(updateDoc(pr(as("dept"), "PR-2026-000002"), step("Completed", "dept-1")));
  });

  it("the owner submits and voids their own open request, with a reason", async () => {
    await assertSucceeds(updateDoc(pr(as("dept"), "PR-2026-000003"), step("Submitted", "dept-1")));
    await assertSucceeds(updateDoc(pr(as("dept")), step("Cancelled", "dept-1", "Duplicate of PR-2026-000010")));
  });

  it("the owner cannot void an approved request; a decider can", async () => {
    await assertFails(updateDoc(pr(as("dept"), "PR-2026-000002"), step("Cancelled", "dept-1", "Not needed")));
    await assertSucceeds(updateDoc(pr(approver(), "PR-2026-000002"), step("Cancelled", "approver-1", "Not needed")));
  });

  it("a void must give a reason", async () => {
    await assertFails(updateDoc(pr(as("admin")), step("Cancelled", "admin-1")));
    await assertFails(updateDoc(pr(as("admin")), step("Cancelled", "admin-1", "")));
    await assertFails(updateDoc(pr(as("admin")), step("Cancelled", "admin-1", "x".repeat(501))));
  });

  it("another Department User cannot touch a request they did not raise, or a portal request", async () => {
    await assertFails(updateDoc(pr(otherDept()), { purpose: "Changed" }));
    await assertFails(updateDoc(pr(otherDept()), step("Cancelled", "dept-2", "Not mine")));
    await assertFails(updateDoc(pr(as("dept"), "PR-2026-000006"), { purpose: "Changed" }));
  });

  it("an explicitly authorised approver approves, returns, completes and handles portal requests", async () => {
    await assertSucceeds(updateDoc(pr(approver()), step("Approved", "approver-1")));
    await assertSucceeds(updateDoc(pr(approver(), "PR-2026-000002"), step("Completed", "approver-1")));
    await assertSucceeds(
      updateDoc(pr(approver(), "PR-2026-000006"), step("Draft", "approver-1", "Returned to requester for revision")),
    );
  });

  it("an Administrator decides on any request", async () => {
    await assertSucceeds(updateDoc(pr(as("admin")), step("Rejected", "admin-1")));
  });

  it("every status change is signed by the account taking it", async () => {
    // No new step, a step for another status, or someone else's signature.
    await assertFails(updateDoc(pr(as("admin")), { status: "Approved" }));
    await assertFails(updateDoc(pr(as("admin")), { status: "Approved", approvals: [{ step: "Rejected", byUid: "admin-1" }] }));
    await assertFails(updateDoc(pr(as("admin")), step("Approved", "approver-1")));
  });

  it("a Viewer can do none of it, even with an approver flag", async () => {
    const viewerApprover = ctx("va-1", { role: "Viewer", approver: true, email: "va@alaminos.gov.ph" });
    await assertFails(updateDoc(pr(viewerApprover), step("Approved", "va-1")));
    await assertFails(updateDoc(pr(as("viewer")), step("Approved", "viewer-1")));
  });

  it("the approver flag must be exactly true", async () => {
    const stringFlag = ctx("sf-1", { role: "Department User", approver: "true", email: "sf@alaminos.gov.ph" });
    await assertFails(updateDoc(pr(stringFlag), step("Approved", "sf-1")));
  });

  it("nobody skips a step or reopens a closed request, Administrators included", async () => {
    await assertFails(updateDoc(pr(as("admin"), "PR-2026-000003"), step("Approved", "admin-1")));
    await assertFails(updateDoc(pr(as("admin"), "PR-2026-000004"), step("Approved", "admin-1")));
    await assertFails(updateDoc(pr(as("admin"), "PR-2026-000005"), step("Draft", "admin-1")));
    await assertFails(updateDoc(pr(as("admin")), step("Completed", "admin-1")));
    await assertFails(updateDoc(pr(as("admin"), "PR-2026-000005"), step("Cancelled", "admin-1", "Too late")));
  });

  it("a closed request keeps its content; only comments are added", async () => {
    await assertFails(updateDoc(pr(as("admin"), "PR-2026-000005"), { purpose: "Rewritten" }));
    await assertSucceeds(
      updateDoc(pr(as("admin"), "PR-2026-000005"), { comments: [{ id: "c1", text: "Filed" }], updated_at: "x" }),
    );
  });

  it("a numbered request is never deleted, by anyone", async () => {
    for (const db of [as("admin"), approver(), as("dept"), anon()]) {
      await assertFails(deleteDoc(pr(db)));
    }
  });

  it("nobody changes who owns a request", async () => {
    await assertFails(updateDoc(pr(as("admin")), { created_by_uid: "admin-1" }));
  });
});

describe("reservation slots change only through the server", () => {
  const res = (db: ReturnType<typeof anon>) => doc(db, "reservations/FR-2026-000001");

  it("browsers cannot move a booking's facility, date or times", async () => {
    for (const change of [{ date: "2026-12-01" }, { start_time: "13:00" }, { facility_id: "Covered Court" }]) {
      await assertFails(updateDoc(res(as("admin")), change));
    }
    await assertSucceeds(updateDoc(res(as("admin")), { purpose: "Updated purpose" }));
  });

  it("statuses only move forward, each change signed, a void with its reason", async () => {
    const approved = { step: "Approved", by: "Test", byUid: "admin-1" };
    const voided = { step: "Cancelled", by: "Test", byUid: "admin-1", remarks: "Event called off" };
    await assertFails(updateDoc(res(as("admin")), { status: "Approved" }));
    await assertSucceeds(updateDoc(res(as("admin")), { status: "Approved", approvals: [approved] }));
    await assertFails(
      updateDoc(res(as("admin")), { status: "Cancelled", approvals: [approved, { ...voided, remarks: "" }] }),
    );
    await assertSucceeds(updateDoc(res(as("admin")), { status: "Cancelled", approvals: [approved, voided] }));
    await assertFails(
      updateDoc(res(as("admin")), {
        status: "Pending",
        approvals: [approved, voided, { step: "Pending", by: "Test", byUid: "admin-1" }],
      }),
    );
    await assertFails(
      updateDoc(res(as("admin")), { status: "Approved", approvals: [approved, voided, approved] }),
    );
  });
});

describe("Administrator", () => {
  it("manages operational records but cannot rewrite their history", async () => {
    await assertSucceeds(setDoc(doc(as("admin"), "suppliers/sup-2"), { id: "sup-2", name: "Toner Co." }));
    await assertSucceeds(updateDoc(doc(as("admin"), "inventory_items/item-1"), { name: "A4 bond paper" }));
    await assertFails(updateDoc(doc(as("admin"), "inventory_items/item-1"), { created_at: "y" }));
    await assertSucceeds(deleteDoc(doc(as("admin"), "inventory_items/item-1")));
  });

  it("can never touch document counters; numbers come from the server", async () => {
    await assertFails(getDoc(doc(as("admin"), "document_counters/PR-2026")));
    await assertFails(updateDoc(doc(as("admin"), "document_counters/PR-2026"), { current_sequence: 0 }));
  });

  it("changes settings", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin"), "system_configuration/x"), { category: "General", key: "x", value: 1 }),
    );
  });

  it("has no access to collections the rules do not name", async () => {
    await assertFails(setDoc(doc(as("admin"), "anything_else/x"), { a: 1 }));
  });
});

describe("notifications", () => {
  it("staff may only flip the read flag", async () => {
    const ref = doc(as("viewer"), "notifications/n1");
    await assertSucceeds(updateDoc(ref, { is_read: true }));
    await assertFails(updateDoc(ref, { title: "Edited" }));
    await assertFails(setDoc(doc(as("viewer"), "notifications/n2"), { title: "Fake", is_read: false }));
  });
});

describe("Records Management", () => {
  it("staff read; nobody outside staff does", async () => {
    await assertSucceeds(getDoc(doc(as("viewer"), "record_boxes/box-1")));
    await assertFails(getDoc(doc(anon(), "record_boxes/box-1")));
  });

  it("an Administrator only renames a shelf or corrects a box label in the browser", async () => {
    await assertSucceeds(updateDoc(doc(as("admin"), "record_boxes/box-1"), { label_override: "Box 01 (blue)" }));
    await assertFails(updateDoc(doc(as("viewer"), "record_boxes/box-1"), { label_override: "x" }));
    // Moving a box goes through moveRecordBox, which keeps one box per position.
    await assertFails(updateDoc(doc(as("admin"), "record_boxes/box-1"), { slot: 2 }));
    await assertSucceeds(updateDoc(doc(as("admin"), "record_shelves/seed"), { name: "Shelf 1 (north wall)" }));
    await assertFails(updateDoc(doc(as("admin"), "record_shelves/seed"), { name: "" }));
    await assertFails(updateDoc(doc(as("admin"), "record_shelves/seed"), { position: 9 }));
  });

  it("forms, lines, boxes, filing and positions are written only by Cloud Functions", async () => {
    const db = as("admin");
    for (const c of ["disposition_schedules", "record_series", "inventory_appraisals", "inventory_records",
      "disposal_requests", "disposal_items", "record_shelves", "record_shelf_levels", "record_boxes", "record_box_contents"]) {
      await assertFails(setDoc(doc(db, `${c}/new`), { id: "new", status: "Approved" }));
      await assertFails(deleteDoc(doc(db, `${c}/seed`)));
    }
    await assertFails(updateDoc(doc(db, "disposition_schedules/seed"), { status: "Approved" }));
    await assertFails(getDoc(doc(db, "record_box_positions/x")));
    await assertFails(setDoc(doc(db, "record_box_positions/x"), { box_id: "box-1" }));
  });
});

describe("unique item codes", () => {
  const claim = (db: ReturnType<typeof anon>, code: string) =>
    doc(db, "unique_keys", `inventory_items.item_code:${code}`);
  const item = (id: string, code: string) => ({
    id,
    item_code: code,
    name: `Item ${code}`,
    created_at: "x",
    created_by_uid: "admin-1",
    updated_by_uid: "admin-1",
  });

  async function addItem(id: string, code: string) {
    const db = as("admin");
    const b = writeBatch(db);
    b.set(doc(db, `inventory_items/${id}`), item(id, code));
    b.set(claim(db, code), { collection: "inventory_items", doc_id: id });
    await b.commit();
  }

  it("an item is saved together with the claim on its code", async () => {
    await assertSucceeds(addItem("inv-a", "OFF-0001"));
  });

  it("an item without its claim is refused", async () => {
    await assertFails(setDoc(doc(as("admin"), "inventory_items/inv-b"), item("inv-b", "OFF-0002")));
  });

  it("a second item cannot take a code already claimed", async () => {
    await addItem("inv-a", "OFF-0001");
    await assertFails(addItem("inv-b", "OFF-0001"));
    await assertFails(setDoc(doc(as("admin"), "inventory_items/inv-b"), item("inv-b", "OFF-0001")));
  });

  it("a claim must name the item that holds the code", async () => {
    await addItem("inv-a", "OFF-0001");
    await assertFails(setDoc(claim(as("admin"), "OFF-0099"), { collection: "inventory_items", doc_id: "inv-a" }));
  });

  it("changing a code moves the claim; it cannot be changed without one", async () => {
    await addItem("inv-a", "OFF-0001");
    const db = as("admin");
    await assertFails(updateDoc(doc(db, "inventory_items/inv-a"), { item_code: "OFF-0050" }));
    const b = writeBatch(db);
    b.update(doc(db, "inventory_items/inv-a"), { item_code: "OFF-0050", updated_by_uid: "admin-1" });
    b.set(claim(db, "OFF-0050"), { collection: "inventory_items", doc_id: "inv-a" });
    b.delete(claim(db, "OFF-0001"));
    await assertSucceeds(b.commit());
  });

  it("a claim is released only with its item", async () => {
    await addItem("inv-a", "OFF-0001");
    await assertFails(deleteDoc(claim(as("admin"), "OFF-0001")));
    const db = as("admin");
    const b = writeBatch(db);
    b.delete(doc(db, "inventory_items/inv-a"));
    b.delete(claim(db, "OFF-0001"));
    await assertSucceeds(b.commit());
  });

  it("claims and rate limits are not readable by staff or the public", async () => {
    await addItem("inv-a", "OFF-0001");
    for (const db of [as("dept"), as("viewer"), anon()]) {
      await assertFails(getDoc(claim(db, "OFF-0001")));
    }
    for (const db of [as("admin"), as("dept"), anon()]) {
      await assertFails(getDoc(doc(db, "rate_limits/x")));
      await assertFails(setDoc(doc(db, "rate_limits/x"), { count: 0 }));
    }
  });
});

describe("every staff write is signed by the account making it", () => {
  it("a write signed with someone else's account, or not signed, is refused", async () => {
    const ref = doc(as("admin"), "purchase_requests/PR-2026-000001");
    await assertFails(updateDoc(ref, { purpose: "Changed", updated_by_uid: "dept-1" }));
    await assertFails(updateDoc(ref, { purpose: "Changed", updated_by_uid: null }));
    await assertFails(fsUpdateDoc(doc(as("admin"), "reservations/FR-2026-000001"), { purpose: "Changed" }));
    await assertSucceeds(updateDoc(ref, { purpose: "Changed" }));
  });

  it("a new inventory item and a stock-card line name their creator", async () => {
    const db = as("admin");
    await assertFails(fsSetDoc(doc(db, "stock_card/stk-1"), { item_id: "item-1", quantity_in: 1 }));
    await assertFails(
      fsSetDoc(doc(db, "stock_card/stk-2"), { item_id: "item-1", quantity_in: 1, created_by_uid: "dept-1" }),
    );
    await assertSucceeds(setDoc(doc(db, "stock_card/stk-3"), { item_id: "item-1", quantity_in: 1 }));
  });
});

describe("purchase orders, slips and bookings are voided, never deleted", () => {
  const voidStep = (byUid: string, remarks = "Raised in error") => ({
    status: "Cancelled",
    approvals: [{ step: "Cancelled", by: "Test", byUid, remarks }],
  });
  const po = (db: ReturnType<typeof anon>, n = "PO-2026-000001") => doc(db, `purchase_orders/${n}`);
  const ris = (db: ReturnType<typeof anon>, n = "RIS-2026-000001") => doc(db, `ris_requests/${n}`);
  const fr = (db: ReturnType<typeof anon>) => doc(db, "reservations/FR-2026-000001");

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await fsSetDoc(doc(db, "purchase_orders/PO-2026-000002"), {
        id: "PO-2026-000002", po_number: "PO-2026-000002", status: "Approved", issued_at: "2026-10-01T00:00:00.000Z",
      });
      await fsSetDoc(doc(db, "purchase_orders/PO-2026-000003"), {
        id: "PO-2026-000003", po_number: "PO-2026-000003", status: "Released",
      });
      await fsSetDoc(doc(db, "ris_requests/RIS-2026-000002"), {
        id: "RIS-2026-000002", ris_number: "RIS-2026-000002", status: "Released",
      });
    });
  });

  it("nobody deletes one — Administrator, staff or public", async () => {
    for (const ref of [po, ris, fr]) {
      for (const db of [as("admin"), as("dept"), as("viewer"), anon()]) {
        await assertFails(deleteDoc(ref(db)));
      }
    }
  });

  it("a void gives its reason and is signed by the account taking it", async () => {
    await assertFails(updateDoc(po(as("admin")), { status: "Cancelled" }));
    await assertFails(updateDoc(po(as("admin")), voidStep("admin-1", "")));
    await assertFails(updateDoc(po(as("admin")), voidStep("dept-1")));
    await assertSucceeds(updateDoc(po(as("admin")), voidStep("admin-1")));
    await assertSucceeds(updateDoc(ris(as("dept")), voidStep("dept-1")));
    await assertFails(updateDoc(fr(as("dept")), voidStep("dept-1", "")));
    await assertSucceeds(updateDoc(fr(as("dept")), voidStep("dept-1")));
  });

  it("an order issued to the supplier, or Released, cannot be voided", async () => {
    await assertFails(updateDoc(po(as("admin"), "PO-2026-000002"), voidStep("admin-1")));
    await assertFails(updateDoc(po(as("admin"), "PO-2026-000003"), voidStep("admin-1")));
  });

  it("a released slip is voided only by the server, which returns its stock", async () => {
    await assertFails(updateDoc(ris(as("admin"), "RIS-2026-000002"), voidStep("admin-1")));
    await assertFails(updateDoc(ris(as("admin"), "RIS-2026-000002"), { stock_reversed_at: "2026-10-19" }));
  });

  it("a voided document stays voided; only its comments grow", async () => {
    await assertSucceeds(updateDoc(po(as("admin")), voidStep("admin-1")));
    const reopened = {
      status: "Approved",
      approvals: [voidStep("admin-1").approvals[0], { step: "Approved", by: "Test", byUid: "admin-1" }],
    };
    await assertFails(updateDoc(po(as("admin")), reopened));
    await assertFails(updateDoc(po(as("admin")), { purpose: "Rewritten" }));
    await assertSucceeds(updateDoc(po(as("admin")), { comments: [{ id: "c1", text: "Voided per memo" }] }));
  });

  it("every status change is signed, not only a void", async () => {
    await assertFails(updateDoc(ris(as("admin")), { status: "Approved" }));
    await assertSucceeds(
      updateDoc(ris(as("admin")), {
        status: "Approved",
        approvals: [{ step: "Approved", by: "Test", byUid: "admin-1" }],
      }),
    );
  });
});

describe("utility and violation records", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await fsSetDoc(doc(db, "water_meter_readings/wmr-1"), {
        id: "wmr-1", previous_reading: 10, current_reading: 15, consumption: 5, created_at: "x",
      });
      await fsSetDoc(doc(db, "fuel_trips/trp-1"), {
        id: "trp-1", control_no: "2026-10-0001", beginning_odometer: 100, ending_odometer: 150, created_at: "x",
      });
      await fsSetDoc(doc(db, "violations/VT-2026-000001"), {
        id: "VT-2026-000001", violation_no: "VT-2026-000001", violator_id: "vlt-1",
        amount: 500, amount_paid: 0, outstanding_balance: 500, payment_status: "Pending", created_at: "x",
      });
      await fsSetDoc(doc(db, "violations/VT-2026-000002"), {
        id: "VT-2026-000002", violation_no: "VT-2026-000002", violator_id: "vlt-1",
        amount: 500, amount_paid: 500, outstanding_balance: 0, payment_status: "Paid", created_at: "x",
      });
      await fsSetDoc(doc(db, "energy_bills/eb-1"), { id: "eb-1", doc_number: "EC-2026-000001", amount: 1 });
    });
  });

  it("numbered records are created only by the server, even for Administrators", async () => {
    const db = as("admin");
    for (const c of ["energy_bills", "water_bills", "fuel_transactions", "fuel_trips", "violations"]) {
      await assertFails(setDoc(doc(db, `${c}/x-1`), { id: "x-1", amount: 1, amount_paid: 0, outstanding_balance: 1 }));
    }
  });

  it("a record's number never changes", async () => {
    await assertFails(updateDoc(doc(as("admin"), "energy_bills/eb-1"), { doc_number: "EC-2026-000099" }));
    await assertFails(updateDoc(doc(as("admin"), "fuel_trips/trp-1"), { control_no: "2026-10-0099" }));
  });

  it("finalized bills, purchases and trips are corrected and voided only through Cloud Functions", async () => {
    // Policy 2026-10-20: the previous values must be kept, which an edit in
    // place would lose, and a void replaces deletion.
    const db = as("admin");
    await assertFails(updateDoc(doc(db, "energy_bills/eb-1"), { amount: 2 }));
    await assertFails(updateDoc(doc(db, "energy_bills/eb-1"), { voided: true, void_reason: "x" }));
    await assertFails(updateDoc(doc(db, "fuel_trips/trp-1"), { purpose: "Rewritten" }));
    for (const ref of ["energy_bills/eb-1", "fuel_trips/trp-1"]) await assertFails(deleteDoc(doc(db, ref)));
    // Readings and submeter bills keep their correction history too (2026-10-21).
    await assertFails(updateDoc(doc(db, "water_meter_readings/wmr-1"), { current_reading: 16, consumption: 6 }));
  });

  it("an unsigned write is refused", async () => {
    await assertFails(fsUpdateDoc(doc(as("admin"), "energy_bills/eb-1"), { amount: 2 }));
    await assertFails(fsSetDoc(doc(as("admin"), "suppliers/sup-9"), { id: "sup-9", name: "Test supplier" }));
    await assertSucceeds(setDoc(doc(as("admin"), "suppliers/sup-9"), { id: "sup-9", name: "Test supplier" }));
  });

  it("submeter bills and readings are created by the server only, so their holder's status is checked", async () => {
    // Approved 2026-10-21: createUtilityEntry refuses an archived account,
    // an inactive submeter or vehicle, and a second active bill for a month.
    const db = as("admin");
    await assertFails(setDoc(doc(db, "water_meter_readings/wmr-2"), { id: "wmr-2", previous_reading: 10, current_reading: 15, consumption: 5 }));
    await assertFails(setDoc(doc(db, "fuel_odometer_readings/fod-1"), { id: "fod-1", previous_odometer: 150, current_odometer: 200, distance: 50 }));
    for (const c of ["energy_submeter_bills", "water_submeter_bills"]) {
      await assertFails(setDoc(doc(db, `${c}/sb-1`), { id: "sb-1", submeter_id: "s-1", consumption: 1, amount: 1 }));
    }
    await assertFails(updateDoc(doc(db, "water_meter_readings/wmr-1"), { current_reading: 5, consumption: -5 }));
    await assertFails(updateDoc(doc(db, "fuel_trips/trp-1"), { ending_odometer: 90 }));
  });

  it("a payment cannot exceed the amount, and the balance is what remains", async () => {
    const ref = doc(as("admin"), "violations/VT-2026-000001");
    await assertFails(updateDoc(ref, { amount_paid: 600, outstanding_balance: -100, payment_status: "Paid" }));
    await assertFails(updateDoc(ref, { amount_paid: 500, outstanding_balance: 500, payment_status: "Paid" }));
    await assertSucceeds(updateDoc(ref, { amount_paid: 500, outstanding_balance: 0, payment_status: "Paid" }));
  });

  it("a settled ticket keeps its amount and cannot be cancelled; a cancelled one takes no payment", async () => {
    const paid = doc(as("admin"), "violations/VT-2026-000002");
    await assertFails(updateDoc(paid, { amount: 600, outstanding_balance: 100 }));
    await assertFails(updateDoc(paid, { payment_status: "Cancelled", amount_paid: 0, outstanding_balance: 500 }));
    await assertSucceeds(updateDoc(paid, { remarks: "Receipt checked" }));
    const open = doc(as("admin"), "violations/VT-2026-000001");
    // Cancelled with its reason, signed by the account cancelling it (2026-10-21).
    await assertFails(updateDoc(open, { payment_status: "Cancelled", cancel_reason: "Issued in error" }));
    await assertFails(
      updateDoc(open, { payment_status: "Cancelled", cancel_reason: "", cancelled_by_uid: "admin-1", cancelled_at: "x" }),
    );
    await assertFails(
      updateDoc(open, { payment_status: "Cancelled", cancel_reason: "Issued in error", cancelled_by_uid: "dept-1", cancelled_at: "x" }),
    );
    await assertSucceeds(
      updateDoc(open, { payment_status: "Cancelled", cancel_reason: "Issued in error", cancelled_by_uid: "admin-1", cancelled_at: "x" }),
    );
    await assertFails(updateDoc(open, { payment_status: "Paid", amount_paid: 500, outstanding_balance: 0 }));
    // A numbered ticket is never deleted.
    await assertFails(deleteDoc(open));
  });
});

describe("one violator profile per person", () => {
  const claimRef = (db: ReturnType<typeof anon>, key: string) => doc(db, "unique_keys", `violators.name_key:${key}`);
  const profile = (id: string, key: string) => ({
    id,
    full_name: key,
    name_key: key,
    created_at: "x",
    created_by_uid: "admin-1",
    updated_by_uid: "admin-1",
  });

  async function addProfile(id: string, key: string) {
    const db = as("admin");
    const b = writeBatch(db);
    b.set(doc(db, `violators/${id}`), profile(id, key));
    b.set(claimRef(db, key), { collection: "violators", doc_id: id });
    return b.commit();
  }

  it("a profile is saved together with the claim on its name", async () => {
    await assertSucceeds(addProfile("vlt-a", "nasol richard"));
    await assertFails(setDoc(doc(as("admin"), "violators/vlt-b"), profile("vlt-b", "cruz ana")));
  });

  it("a second profile cannot take a name already claimed", async () => {
    await addProfile("vlt-a", "nasol richard");
    await assertFails(addProfile("vlt-b", "nasol richard"));
  });

  it("a live claim never moves; a stale one is taken over", async () => {
    await addProfile("vlt-a", "nasol richard");
    const db = as("admin");
    // vlt-b tries to take the name while vlt-a still holds it.
    const steal = writeBatch(db);
    steal.set(doc(db, "violators/vlt-b"), profile("vlt-b", "nasol richard"));
    steal.set(claimRef(db, "nasol richard"), { collection: "violators", doc_id: "vlt-b" });
    await assertFails(steal.commit());
    // vlt-a is deleted without releasing its claim; the name is free again.
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), "violators/vlt-a")));
    const takeOver = writeBatch(db);
    takeOver.set(doc(db, "violators/vlt-b"), profile("vlt-b", "nasol richard"));
    takeOver.set(claimRef(db, "nasol richard"), { collection: "violators", doc_id: "vlt-b" });
    await assertSucceeds(takeOver.commit());
  });

  it("a renamed profile claims its new name and releases the old one", async () => {
    await addProfile("vlt-a", "nasol richard");
    const db = as("admin");
    await assertFails(updateDoc(doc(db, "violators/vlt-a"), { name_key: "nasol ricardo" }));
    const b = writeBatch(db);
    b.update(doc(db, "violators/vlt-a"), { name_key: "nasol ricardo", full_name: "Nasol, Ricardo", updated_by_uid: "admin-1" });
    b.set(claimRef(db, "nasol ricardo"), { collection: "violators", doc_id: "vlt-a" });
    b.delete(claimRef(db, "nasol richard"));
    await assertSucceeds(b.commit());
  });

  it("a claim is never released from the browser; a profile is deleted only by the server", async () => {
    await addProfile("vlt-a", "nasol richard");
    const db = as("admin");
    await assertFails(deleteDoc(claimRef(db, "nasol richard")));
    // Profiles are deleted by deleteRecordHolders, and only while they hold no tickets.
    const b = writeBatch(db);
    b.delete(doc(db, "violators/vlt-a"));
    b.delete(claimRef(db, "nasol richard"));
    await assertFails(b.commit());
  });
});

describe("unique account, plate and submeter numbers", () => {
  const claim = (db: ReturnType<typeof anon>, key: string) => doc(db, "unique_keys", key);
  const stamped = (row: Record<string, unknown>) => ({
    ...row,
    created_at: "x",
    created_by_uid: "admin-1",
    updated_by_uid: "admin-1",
  });

  async function saveWithClaim(collection: string, row: Record<string, unknown>, key: string) {
    const db = as("admin");
    const b = writeBatch(db);
    b.set(doc(db, `${collection}/${String(row.id)}`), stamped(row));
    b.set(claim(db, key), { collection, doc_id: row.id });
    return b.commit();
  }

  it("an account is saved together with the claim on its number", async () => {
    await assertSucceeds(
      saveWithClaim("energy_accounts", { id: "ea-a", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-1"),
    );
    await assertFails(setDoc(doc(as("admin"), "energy_accounts/ea-b"), { id: "ea-b", account_number: "ACC-2" }));
  });

  it("a second account, vehicle or submeter cannot take a number already claimed", async () => {
    await saveWithClaim("water_accounts", { id: "wa-a", account_number: "W-1" }, "water_accounts.account_number:W-1");
    await assertFails(saveWithClaim("water_accounts", { id: "wa-b", account_number: "W-1" }, "water_accounts.account_number:W-1"));
    await saveWithClaim("fuel_vehicles", { id: "fv-a", plate_number: "TST 001" }, "fuel_vehicles.plate_number:TST 001");
    await assertFails(saveWithClaim("fuel_vehicles", { id: "fv-b", plate_number: "TST 001" }, "fuel_vehicles.plate_number:TST 001"));
    const sub = (id: string, account: string) => ({ id, account_id: account, submeter_number: "S-1" });
    await saveWithClaim("energy_submeters", sub("es-a", "ea-1"), "energy_submeters.submeter_number:ea-1~S-1");
    await assertFails(saveWithClaim("energy_submeters", sub("es-b", "ea-1"), "energy_submeters.submeter_number:ea-1~S-1"));
    // The same submeter number on another account is a different key.
    await assertSucceeds(saveWithClaim("energy_submeters", sub("es-c", "ea-2"), "energy_submeters.submeter_number:ea-2~S-1"));
  });

  it("a claim must carry the document's own value, with / written %2F", async () => {
    await assertFails(
      saveWithClaim("energy_accounts", { id: "ea-a", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-9"),
    );
    await assertSucceeds(
      saveWithClaim("energy_accounts", { id: "ea-s", account_number: "12/34" }, "energy_accounts.account_number:12%2F34"),
    );
  });

  it("changing the number needs the new claim; the old one is released with it", async () => {
    await saveWithClaim("fuel_vehicles", { id: "fv-a", plate_number: "TST 001" }, "fuel_vehicles.plate_number:TST 001");
    const db = as("admin");
    await assertFails(updateDoc(doc(db, "fuel_vehicles/fv-a"), { plate_number: "TST 002" }));
    await assertSucceeds(updateDoc(doc(db, "fuel_vehicles/fv-a"), { vehicle_name: "Renamed" }));
    const b = writeBatch(db);
    b.update(doc(db, "fuel_vehicles/fv-a"), { plate_number: "TST 002", updated_by_uid: "admin-1" });
    b.set(claim(db, "fuel_vehicles.plate_number:TST 002"), { collection: "fuel_vehicles", doc_id: "fv-a" });
    b.delete(claim(db, "fuel_vehicles.plate_number:TST 001"));
    await assertSucceeds(b.commit());
  });

  it("a live claim never moves; a stale one is taken over", async () => {
    await saveWithClaim("energy_accounts", { id: "ea-a", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-1");
    await assertFails(saveWithClaim("energy_accounts", { id: "ea-b", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-1"));
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), "energy_accounts/ea-a")));
    await assertSucceeds(
      saveWithClaim("energy_accounts", { id: "ea-b", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-1"),
    );
  });

  it("a claim is not released on its own, and holders are not deleted from the browser", async () => {
    await saveWithClaim("energy_accounts", { id: "ea-a", account_number: "ACC-1" }, "energy_accounts.account_number:ACC-1");
    const db = as("admin");
    await assertFails(deleteDoc(claim(db, "energy_accounts.account_number:ACC-1")));
    const b = writeBatch(db);
    b.delete(doc(db, "energy_accounts/ea-a"));
    b.delete(claim(db, "energy_accounts.account_number:ACC-1"));
    await assertFails(b.commit());
  });

  it("holders of official records are never deleted from the browser, and cannot archive themselves", async () => {
    const db = as("admin");
    for (const ref of ["energy_accounts/seed", "water_accounts/seed", "energy_submeters/seed", "water_submeters/seed", "fuel_vehicles/seed", "violators/seed"]) {
      await assertFails(deleteDoc(doc(db, ref)));
    }
    // Archiving is the server's (setRecordHolderArchived), with who and when.
    await assertFails(updateDoc(doc(db, "energy_accounts/seed"), { archived: true }));
    // Readings and submeter bills are voided with a reason, not deleted (2026-10-21).
    for (const c of ["water_meter_readings", "fuel_odometer_readings", "energy_submeter_bills", "water_submeter_bills"]) {
      await assertFails(deleteDoc(doc(db, `${c}/seed`)));
    }
  });

  it("an archived account takes no new submeter, and no submeter moves onto it", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await fsSetDoc(doc(c.firestore(), "water_accounts/wa-old"), { id: "wa-old", account_number: "W-OLD", archived: true });
      await fsSetDoc(doc(c.firestore(), "water_accounts/wa-new"), { id: "wa-new", account_number: "W-NEW" });
    });
    const sub = (id: string, account: string) => ({ id, account_id: account, submeter_number: "S-1" });
    await assertFails(saveWithClaim("water_submeters", sub("ws-a", "wa-old"), "water_submeters.submeter_number:wa-old~S-1"));
    await assertSucceeds(saveWithClaim("water_submeters", sub("ws-b", "wa-new"), "water_submeters.submeter_number:wa-new~S-1"));
    const db = as("admin");
    // Edits that leave the account alone stay open, so an archived account's submeter can still be set Archived.
    await assertSucceeds(updateDoc(doc(db, "water_submeters/ws-b"), { submeter_name: "Renamed" }));
    const b = writeBatch(db);
    b.update(doc(db, "water_submeters/ws-b"), { account_id: "wa-old", updated_by_uid: "admin-1" });
    b.set(claim(db, "water_submeters.submeter_number:wa-old~S-1"), { collection: "water_submeters", doc_id: "ws-b" });
    b.delete(claim(db, "water_submeters.submeter_number:wa-new~S-1"));
    await assertFails(b.commit());
  });
});
