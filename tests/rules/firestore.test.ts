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

describe("access cannot be forged from the browser", () => {
  const forged = {
    lowercase: { role: "administrator", email: "a@alaminos.gov.ph" },
    padded: { role: "Administrator ", email: "a@alaminos.gov.ph" },
    adminFlag: { admin: true, email: "a@alaminos.gov.ph" },
    rolesArray: { roles: ["Administrator"], email: "a@alaminos.gov.ph" },
  };

  // Without an email-and-password sign-in, claims and look-alike flags grant nothing.
  it("role claims and look-alike flags grant nothing", async () => {
    for (const [name, token] of Object.entries(forged)) {
      const db = env.authenticatedContext(`forged-${name}`, token).firestore();
      await assertFails(getDocs(collection(db, "purchase_requests")));
      await assertFails(setDoc(doc(db, "inventory_items/x"), { id: "x" }));
    }
  });

  it("an email address without an email-and-password sign-in grants nothing", async () => {
    const db = env.authenticatedContext("u1", { email: "gso.head@alaminos.gov.ph", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "inventory_items/seed")));
  });

  it("writing a role into a document grants nothing", async () => {
    const db = env.authenticatedContext("anon-1", { firebase: { sign_in_provider: "anonymous" } }).firestore();
    await assertFails(setDoc(doc(db, "users/norole-1"), { role: "Administrator" }));
    await assertFails(setDoc(doc(db, "roles/norole-1"), { role: "Administrator" }));
    await assertFails(getDocs(collection(db, "purchase_requests")));
  });
});

describe("audit trail is append-only", () => {
  const entry = (who: keyof typeof staff) => doc(as(who), "audit_logs/AUD-2026-0001");

  it("accounts read it", async () => {
    await assertSucceeds(getDoc(entry("admin")));
  });

  it("nobody can delete an entry", async () => {
    for (const who of ["admin", "colleague"] as const) {
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
    await assertFails(updateDoc(entry("admin"), { comments: [firstComment, comment("colleague-1")] }));
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

  it("signed out, nobody comments", async () => {
    await assertFails(updateDoc(doc(anon(), "audit_logs/AUD-2026-0001"), { comments: [firstComment, comment("anon")] }));
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

describe("every account reads and edits the registers", () => {
  it("reads every register and the audit trail", async () => {
    await assertSucceeds(getDocs(collection(as("colleague"), "purchase_requests")));
    await assertSucceeds(getDoc(doc(as("colleague"), "inventory_items/item-1")));
    await assertSucceeds(getDoc(doc(as("colleague"), "audit_logs/AUD-2026-0001")));
  });

  it("edits a request but cannot renumber it or change when it was created", async () => {
    const ref = doc(as("colleague"), "purchase_requests/PR-2026-000001");
    await assertSucceeds(updateDoc(ref, { purpose: "Revised purpose (test data)" }));
    await assertFails(updateDoc(ref, { pr_number: "PR-2026-000777" }));
    await assertFails(updateDoc(ref, { created_at: "2020-01-01T00:00:00.000Z" }));
  });

  it("cannot use a status the workflow does not have", async () => {
    await assertFails(updateDoc(doc(as("colleague"), "purchase_requests/PR-2026-000001"), { status: "Paid" }));
  });
});

describe("numbered documents are created only by the server", () => {
  const fresh = {
    purchase_requests: { id: "PR-2026-000009", pr_number: "PR-2026-000009", status: "Submitted" },
    purchase_orders: { id: "PO-2026-000009", po_number: "PO-2026-000009", status: "Draft" },
    ris_requests: { id: "RIS-2026-000009", ris_number: "RIS-2026-000009", status: "Pending Approval" },
    reservations: { id: "FR-2026-000009", res_number: "FR-2026-000009", status: "Pending" },
  } as const;

  it("no browser, signed in or public, can create one directly", async () => {
    for (const [c, data] of Object.entries(fresh)) {
      for (const db of [as("admin"), as("colleague"), anon()]) {
        await assertFails(setDoc(doc(db, `${c}/${data.id}`), data));
      }
    }
  });
});

describe("purchase request decisions, ownership and voiding", () => {
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

  it("the owner submits their own draft", async () => {
    await assertSucceeds(updateDoc(pr(as("colleague"), "PR-2026-000003"), step("Submitted", "colleague-1")));
  });

  it("voiding is the voidPurchaseRequest function's: no browser voids, Administrators included (21 Oct 2026)", async () => {
    // The function is Administrator-only and checks for linked orders and slips.
    await assertFails(updateDoc(pr(as("colleague")), step("Cancelled", "colleague-1", "Duplicate of PR-2026-000010")));
    await assertFails(updateDoc(pr(as("admin")), step("Cancelled", "admin-1", "Not needed")));
  });

  it("a purchase request is never deleted, Administrators included", async () => {
    await assertFails(deleteDoc(pr(as("admin"))));
    await assertFails(deleteDoc(pr(as("admin"), "PR-2026-000003")));
    await assertFails(deleteDoc(pr(as("colleague"), "PR-2026-000003")));
  });

  it("approval is the approvePurchaseRequest function's: no browser approves (21 Oct 2026)", async () => {
    // The function checks the purpose and signatories, and assigns the official number.
    await assertFails(updateDoc(pr(as("admin")), step("Approved", "admin-1")));
  });

  it("the official number and the signatory copy are never written from the browser; an approved request is not edited", async () => {
    const db = as("admin");
    await assertFails(updateDoc(pr(db), { official_pr_number: "100-2026-000999" }));
    await assertFails(updateDoc(pr(db), { signatories: { approved_by: { name: "Anyone", designation: "Mayor" } } }));
    await assertSucceeds(updateDoc(pr(db), { purpose: "Revised before approval (test data)" }));
    await assertFails(updateDoc(pr(db, "PR-2026-000002"), { purpose: "Changed after approval" }));
    await assertSucceeds(
      updateDoc(pr(db, "PR-2026-000002"), { comments: [{ id: "c1", author: "Admin", text: "Noted", createdAt: "x" }] }),
    );
  });

  it("any account decides on any request, its own, someone else's or a portal one", async () => {
    await assertSucceeds(updateDoc(pr(as("admin")), step("Rejected", "admin-1")));
    await assertSucceeds(updateDoc(pr(as("colleague"), "PR-2026-000002"), step("Completed", "colleague-1")));
    await assertSucceeds(
      updateDoc(pr(as("colleague"), "PR-2026-000006"), step("Draft", "colleague-1", "Returned to requester for revision")),
    );
  });

  it("every status change is signed by the account taking it", async () => {
    // No new step, a step for another status, or someone else's signature.
    await assertFails(updateDoc(pr(as("admin")), { status: "Approved" }));
    await assertFails(updateDoc(pr(as("admin")), { status: "Approved", approvals: [{ step: "Rejected", byUid: "admin-1" }] }));
    await assertFails(updateDoc(pr(as("admin")), step("Approved", "colleague-1")));
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
    for (const db of [as("admin"), as("colleague"), anon()]) {
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
      setDoc(doc(as("admin"), "system_configuration/x"), {
        category: "General", key: "x", value: 1, updated_by_uid: staff.admin.uid,
      }),
    );
    // Not unsigned, and not under another account: the audit trail names the writer.
    await assertFails(setDoc(doc(as("admin"), "system_configuration/y"), { category: "General", key: "y", value: 1 }));
    await assertFails(
      setDoc(doc(as("admin"), "system_configuration/y"), {
        category: "General", key: "y", value: 1, updated_by_uid: staff.colleague.uid,
      }),
    );
  });

  it("has no access to collections the rules do not name", async () => {
    await assertFails(setDoc(doc(as("admin"), "anything_else/x"), { a: 1 }));
  });
});

describe("notifications", () => {
  it("an account may only flip the read flag", async () => {
    const ref = doc(as("colleague"), "notifications/n1");
    await assertSucceeds(updateDoc(ref, { is_read: true }));
    await assertFails(updateDoc(ref, { title: "Edited" }));
    await assertFails(setDoc(doc(as("colleague"), "notifications/n2"), { title: "Fake", is_read: false }));
  });

  it("are cleared by an account, never signed out", async () => {
    await assertFails(deleteDoc(doc(anon(), "notifications/n1")));
    await assertSucceeds(deleteDoc(doc(as("admin"), "notifications/n1")));
  });
});

describe("Records Management", () => {
  it("accounts read; nobody signed out does", async () => {
    await assertSucceeds(getDoc(doc(as("colleague"), "record_boxes/box-1")));
    await assertFails(getDoc(doc(anon(), "record_boxes/box-1")));
  });

  it("in the browser, a shelf is only renamed and a box label only corrected", async () => {
    await assertSucceeds(updateDoc(doc(as("admin"), "record_boxes/box-1"), { label_override: "Box 01 (blue)" }));
    await assertFails(updateDoc(doc(anon(), "record_boxes/box-1"), { label_override: "x" }));
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

describe("item codes: items are created only by createInventoryItems (22 Oct 2026)", () => {
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

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await fsSetDoc(doc(db, "inventory_items/inv-a"), item("inv-a", "INV-2026-000001"));
      await fsSetDoc(doc(db, "unique_keys/inventory_items.item_code:INV-2026-000001"), {
        collection: "inventory_items",
        doc_id: "inv-a",
      });
    });
  });

  it("no browser creates an item, with its claim or without", async () => {
    const db = as("admin");
    await assertFails(setDoc(doc(db, "inventory_items/inv-b"), item("inv-b", "INV-2026-000002")));
    const b = writeBatch(db);
    b.set(doc(db, "inventory_items/inv-b"), item("inv-b", "INV-2026-000002"));
    b.set(claim(db, "INV-2026-000002"), { collection: "inventory_items", doc_id: "inv-b" });
    await assertFails(b.commit());
  });

  it("an item's code never changes; its other details do", async () => {
    const db = as("admin");
    await assertFails(updateDoc(doc(db, "inventory_items/inv-a"), { item_code: "INV-2026-000050" }));
    await assertSucceeds(updateDoc(doc(db, "inventory_items/inv-a"), { name: "Bond paper, A4" }));
  });

  it("a live claim is never released or moved from the browser", async () => {
    const db = as("admin");
    await assertFails(deleteDoc(claim(db, "INV-2026-000001")));
    await assertFails(setDoc(claim(db, "INV-2026-000001"), { collection: "inventory_items", doc_id: "inv-z" }));
  });

  it("claims are not readable signed out; rate limits by nobody", async () => {
    await assertFails(getDoc(claim(anon(), "INV-2026-000001")));
    for (const db of [as("admin"), anon()]) {
      await assertFails(getDoc(doc(db, "rate_limits/x")));
      await assertFails(setDoc(doc(db, "rate_limits/x"), { count: 0 }));
    }
  });
});

describe("every staff write is signed by the account making it", () => {
  it("a write signed with someone else's account, or not signed, is refused", async () => {
    const ref = doc(as("admin"), "purchase_requests/PR-2026-000001");
    await assertFails(updateDoc(ref, { purpose: "Changed", updated_by_uid: "colleague-1" }));
    await assertFails(updateDoc(ref, { purpose: "Changed", updated_by_uid: null }));
    await assertFails(fsUpdateDoc(doc(as("admin"), "reservations/FR-2026-000001"), { purpose: "Changed" }));
    await assertSucceeds(updateDoc(ref, { purpose: "Changed" }));
  });

  it("a new inventory item and a stock-card line name their creator", async () => {
    const db = as("admin");
    await assertFails(fsSetDoc(doc(db, "stock_card/stk-1"), { item_id: "item-1", quantity_in: 1 }));
    await assertFails(
      fsSetDoc(doc(db, "stock_card/stk-2"), { item_id: "item-1", quantity_in: 1, created_by_uid: "colleague-1" }),
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

  it("nobody deletes one, signed in or public", async () => {
    for (const ref of [po, ris, fr]) {
      for (const db of [as("admin"), as("colleague"), anon()]) {
        await assertFails(deleteDoc(ref(db)));
      }
    }
  });

  it("a void gives its reason and is signed by the account taking it", async () => {
    await assertFails(updateDoc(po(as("admin")), { status: "Cancelled" }));
    await assertFails(updateDoc(po(as("admin")), voidStep("admin-1", "")));
    await assertFails(updateDoc(po(as("admin")), voidStep("colleague-1")));
    await assertSucceeds(updateDoc(po(as("admin")), voidStep("admin-1")));
    await assertSucceeds(updateDoc(ris(as("colleague")), voidStep("colleague-1")));
    await assertFails(updateDoc(fr(as("colleague")), voidStep("colleague-1", "")));
    await assertSucceeds(updateDoc(fr(as("colleague")), voidStep("colleague-1")));
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
    // Approval issues stock, so only approveRisRequest approves a slip, signed or not (22 Oct 2026).
    await assertFails(
      updateDoc(ris(as("admin")), {
        status: "Approved",
        approvals: [{ step: "Approved", by: "Test", byUid: "admin-1" }],
      }),
    );
    // Returning a pending slip for revision.
    await assertFails(updateDoc(ris(as("admin")), { status: "Draft" }));
    await assertSucceeds(
      updateDoc(ris(as("admin")), {
        status: "Draft",
        approvals: [{ step: "Draft", by: "Test", byUid: "admin-1" }],
      }),
    );
  });
});

describe("purchase orders: Draft → Pending Approval → Approved, approved by the server (21 Oct 2026)", () => {
  const ref = (n: string) => doc(as("admin"), `purchase_orders/${n}`);
  const step = (status: string, remarks?: string) => ({
    status,
    approvals: [{ step: status, by: "Test", byUid: "admin-1", ...(remarks ? { remarks } : {}) }],
  });
  const base = (n: string, status: string, over: Record<string, unknown> = {}) => ({
    id: n, po_number: n, pr_number: "PR-2026-000001", department_code: "GSO", requester: "Test", purpose: "Test",
    supplier_name: "Test Supplies Co.", status, approvals: [], history: [], ...over,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await fsSetDoc(doc(db, "purchase_orders/PO-2026-000010"), base("PO-2026-000010", "Draft"));
      await fsSetDoc(doc(db, "purchase_orders/PO-2026-000011"), base("PO-2026-000011", "Pending Approval"));
      await fsSetDoc(
        doc(db, "purchase_orders/PO-2026-000012"),
        base("PO-2026-000012", "Approved", {
          po_date: "2026-10-21",
          signatories: { approved_by: { name: "TEST MAYOR", designation: "Municipal Mayor" }, bac_secretary: null },
        }),
      );
      await fsSetDoc(doc(db, "purchase_orders/PO-2026-000013"), base("PO-2026-000013", "Released"));
      await fsSetDoc(
        doc(db, "purchase_orders/PO-2026-000014"),
        base("PO-2026-000014", "Approved", { authorization: "pr-approval", authorized_items: [] }),
      );
      await fsSetDoc(doc(db, "purchase_requests/PR-2026-000070"), {
        ...samplePR("PR-2026-000070", "Approved"),
        po_number: "PO-2026-000014",
        approvals: [],
      });
    });
  });

  it("an order authorized with its request is corrected by the server, never returned or edited from the browser", async () => {
    await assertFails(updateDoc(ref("PO-2026-000014"), step("Draft", "Returned for correction")));
    await assertFails(updateDoc(ref("PO-2026-000014"), { supplier_name: "Typed in the browser" }));
    await assertFails(updateDoc(ref("PO-2026-000014"), { authorized_items: [{ description: "x" }] }));
    await assertFails(updateDoc(ref("PO-2026-000014"), { authorization: null }));
    await assertSucceeds(updateDoc(ref("PO-2026-000014"), { comments: [{ id: "c1", text: "Printed" }] }));
  });

  it("a request's link to its order is the server's, and a request with an order is not returned to draft", async () => {
    const pr = (db: ReturnType<typeof anon>) => doc(db, "purchase_requests/PR-2026-000070");
    await assertFails(updateDoc(pr(as("admin")), step("Draft", "Revise")));
    await assertFails(updateDoc(pr(as("admin")), { po_number: "PO-2026-000099" }));
    await assertFails(updateDoc(doc(as("admin"), "purchase_requests/PR-2026-000001"), { po_number: "PO-2026-000099" }));
  });

  it("an Administrator submits a draft and returns it; no browser approves", async () => {
    await assertSucceeds(updateDoc(ref("PO-2026-000010"), step("Pending Approval")));
    await assertSucceeds(updateDoc(ref("PO-2026-000011"), step("Draft", "Returned for correction")));
    await assertFails(updateDoc(ref("PO-2026-000011"), step("Approved")));
    await assertFails(updateDoc(ref("PO-2026-000010"), step("Approved")));
  });

  it("Approved is final: no release or completion and no edit; only a return to draft, a void, or a comment", async () => {
    await assertFails(updateDoc(ref("PO-2026-000012"), step("Released")));
    await assertFails(updateDoc(ref("PO-2026-000012"), step("Completed")));
    await assertFails(updateDoc(ref("PO-2026-000012"), { supplier_name: "Changed after approval" }));
    await assertFails(updateDoc(ref("PO-2026-000012"), { items: [] }));
    await assertSucceeds(updateDoc(ref("PO-2026-000012"), { comments: [{ id: "c1", text: "Printed and sent for signing" }] }));
    await assertSucceeds(updateDoc(ref("PO-2026-000012"), step("Draft", "Returned for correction")));
  });

  it("the signatory copy, the PO date and the source request are never written from the browser", async () => {
    await assertSucceeds(updateDoc(ref("PO-2026-000010"), { supplier_name: "Corrected before approval" }));
    await assertFails(
      updateDoc(ref("PO-2026-000010"), { signatories: { approved_by: { name: "ANYONE", designation: "Mayor" } } }),
    );
    await assertFails(updateDoc(ref("PO-2026-000010"), { po_date: "2026-01-01" }));
    await assertFails(updateDoc(ref("PO-2026-000010"), { pr_number: "PR-2026-000099" }));
    await assertFails(updateDoc(ref("PO-2026-000010"), { department_code: "MHO" }));
    await assertFails(updateDoc(ref("PO-2026-000010"), { approved_at: "2026-10-21" }));
  });

  it("only orders released under the earlier workflow take issue stamps, and they can still be completed", async () => {
    await assertFails(updateDoc(ref("PO-2026-000010"), { issued_at: "2026-10-21", issued_by: "Admin" }));
    await assertFails(updateDoc(ref("PO-2026-000012"), { issued_at: "2026-10-21", issued_by: "Admin" }));
    await assertSucceeds(updateDoc(ref("PO-2026-000013"), { issued_at: "2026-10-21", issued_by: "Admin" }));
    await assertSucceeds(updateDoc(ref("PO-2026-000013"), step("Completed")));
  });

  it("Settings text stays a sensible length", async () => {
    const setting = (value: string) =>
      setDoc(doc(as("admin"), "system_configuration/cfg-po-signatories-po-approving-name"), {
        category: "PO Signatories",
        key: "po_approving_name",
        value,
        updated_by_uid: staff.admin.uid,
      });
    await assertSucceeds(setting("TEST MAYOR"));
    await assertFails(setting("x".repeat(2001)));
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
      updateDoc(open, { payment_status: "Cancelled", cancel_reason: "Issued in error", cancelled_by_uid: "colleague-1", cancelled_at: "x" }),
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
